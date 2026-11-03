import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import { roundMoney } from '../utils/employeeBenefitAccounting';
import { stockUnitsForItem } from '../utils/productPricing';
import { validatePartialReturnQuantity } from '../utils/orderReturn';
import {
  normalizeRefundMethod,
  REFUND_METHOD_CASH,
  REFUND_METHOD_DEBT,
} from '../utils/partialReturnRefund';
import { restoreInventoryForPartialReturn } from './inventoryLayerService';
import { readOpenCashShiftInTransaction, recordCashRefundInTransaction } from './cashShiftService';

const returnsCol = (uid) => collection(db, 'users', uid, 'orderReturns');
const auditCol = (uid) => collection(db, 'users', uid, 'orderReturnAudits');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function lineProductId(line) {
  return line?.id || line?.productId || '';
}

/**
 * Partial line return — idempotent; audit trail; cash/debt refund; FIFO-aware restock.
 */
export async function executePartialOrderReturn(uid, input, { actor, idempotencyKey }) {
  const orderId = input.orderId;
  const productId = input.productId;
  const qty = Number(input.quantity) || 0;
  let refundAmount = roundMoney(input.refundAmount);
  if (!orderId || !productId || !(qty > 0)) throw new Error('بيانات الاسترجاع غير مكتملة');
  if (!(refundAmount >= 0)) throw new Error('مبلغ الاسترجاع غير صالح');

  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('سبب الاسترجاع إلزامي');

  const itemCondition = String(input.itemCondition || 'resellable').trim();
  const refundMethod = normalizeRefundMethod(input, {
    refundAmount,
    refundCash: input.refundCash,
  });
  const restock = Boolean(input.restock) && itemCondition !== 'damaged';

  const idemKey = String(idempotencyKey || '').trim();
  const returnRef = doc(returnsCol(uid));
  const auditRef = doc(auditCol(uid));

  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, 'users', uid, 'orders', orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error('الطلب غير موجود');
    const order = orderSnap.data();
    if (order.status === 'cancelled') throw new Error('الطلب ملغى — لا استرجاع جزئي');

    const items = order.items || [];
    const line = items.find((it) => lineProductId(it) === productId || it.productId === productId);
    if (!line) throw new Error('الصنف غير موجود في الفاتورة');

    const qtyCheck = validatePartialReturnQuantity(line, qty);
    if (!qtyCheck.ok) throw new Error(qtyCheck.message);

    if (idemKey) {
      const priorQ = await tx.get(doc(db, 'users', uid, 'idempotency', `return_${idemKey}`));
      if (priorQ.exists()) {
        return { duplicate: true, returnId: priorQ.data().returnId };
      }
    }

    const pid = lineProductId(line);
    const stockUnits = restock ? stockUnitsForItem({ ...line, quantity: qty }) : 0;

    let layerRestore = null;
    let productSnap = null;
    let productRef = null;
    if (stockUnits > 0) {
      productRef = doc(db, 'users', uid, 'products', pid);
      productSnap = await tx.get(productRef);
      if (!productSnap.exists()) throw new Error('المنتج غير موجود');
      layerRestore = await restoreInventoryForPartialReturn(tx, uid, pid, line, stockUnits);
    }

    let shiftCtx = null;
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      shiftCtx = await readOpenCashShiftInTransaction(tx, uid, input.shiftId || null);
      if (!shiftCtx) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل مرتجع الكاش');
    }

    let customerRef = null;
    let customerSnap = null;
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT && order.customerId) {
      customerRef = doc(db, 'users', uid, 'customers', order.customerId);
      customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists()) throw new Error('العميل غير موجود');
    }

    const nextItems = items.map((it) => {
      if (lineProductId(it) !== pid && it.productId !== productId) return it;
      return { ...it, returnedQty: (Number(it.returnedQty) || 0) + qty };
    });

    const orderPatch = {
      items: nextItems,
      returnTotal: roundMoney((Number(order.returnTotal) || 0) + refundAmount),
      updatedAt: serverTimestamp(),
    };

    if (refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      orderPatch.returnCashTotal = roundMoney((Number(order.returnCashTotal) || 0) + refundAmount);
    }
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT) {
      const prevDebt = money(order.debtAmount);
      orderPatch.debtAmount = money(Math.max(0, prevDebt - refundAmount));
      orderPatch.returnDebtTotal = roundMoney((Number(order.returnDebtTotal) || 0) + refundAmount);
    }

    tx.update(orderRef, orderPatch);

    if (productRef && productSnap?.exists() && stockUnits > 0) {
      const currentStock = Number(productSnap.data().stock) || 0;
      tx.update(productRef, {
        stock: currentStock + stockUnits,
        updatedAt: serverTimestamp(),
      });
    }

    if (shiftCtx && refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      await recordCashRefundInTransaction(tx, uid, {
        amount: refundAmount,
        orderId,
        orderNumber: order.orderNumber,
        actor,
        shiftId: shiftCtx.shiftId,
        shiftSnap: shiftCtx.shiftSnap,
      });
    }

    if (customerRef && customerSnap?.exists() && refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT) {
      const bal = money(customerSnap.data().balance);
      const nextBal = money(Math.max(0, bal - refundAmount));
      const entry = {
        type: 'partial_return',
        orderId,
        orderNumber: order.orderNumber || null,
        amount: -refundAmount,
        date: new Date().toISOString(),
        note: reason,
      };
      const transactions = [...(customerSnap.data().transactions || []), entry].slice(-100);
      tx.update(customerRef, {
        balance: nextBal,
        transactions,
        updatedAt: serverTimestamp(),
      });
    }

    const returnPayload = {
      orderId,
      orderNumber: order.orderNumber || null,
      productId: pid,
      productName: line.name || '',
      quantity: qty,
      stockUnits: stockUnits > 0 ? stockUnits : null,
      refundAmount,
      refundMethod,
      refundCash: refundMethod === REFUND_METHOD_CASH && refundAmount > 0,
      itemCondition,
      reason,
      restock,
      inventoryRestore: layerRestore || null,
      shiftId: shiftCtx?.shiftId || input.shiftId || null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      createdBy: actor || null,
      idempotencyKey: idemKey || null,
    };

    tx.set(returnRef, returnPayload);

    tx.set(auditRef, {
      ...returnPayload,
      returnId: returnRef.id,
      action: 'partial_return_created',
      orderSnapshot: {
        returnTotal: orderPatch.returnTotal,
        returnCashTotal: orderPatch.returnCashTotal ?? order.returnCashTotal ?? 0,
        returnDebtTotal: orderPatch.returnDebtTotal ?? order.returnDebtTotal ?? 0,
      },
    });

    if (idemKey) {
      tx.set(doc(db, 'users', uid, 'idempotency', `return_${idemKey}`), {
        returnId: returnRef.id,
        orderId,
        createdAtMs: Date.now(),
      });
    }

    return { duplicate: false, returnId: returnRef.id };
  });
}
