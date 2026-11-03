const {
  money,
  validatePartialReturnQuantity,
  REFUND_METHOD_CASH,
  REFUND_METHOD_DEBT,
  normalizeRefundMethod,
} = require('./orderReturnUtils');
const { stockUnitsForItem } = require('./productPricing');
const {
  restoreInventoryForPartialReturn,
  serverTimestamp,
  roundMoney,
  docExists,
} = require('./inventoryLayerEngine');
const { appendCashMovementInTx, shiftSnapFromDoc, getOpenShiftDocInTx } = require('./cashShiftEngine');

function lineProductId(line) {
  return line?.id || line?.productId || '';
}

async function executePartialOrderReturn(db, uid, input, { actor }) {
  const orderId = input.orderId;
  const productId = input.productId;
  const qty = Number(input.quantity) || 0;
  const refundAmount = roundMoney(input.refundAmount);
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
  const idemKey = String(input.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    const orderRef = db.doc(`users/${uid}/orders/${orderId}`);
    const orderSnap = await tx.get(orderRef);
    if (!docExists(orderSnap)) throw new Error('الطلب غير موجود');
    const order = orderSnap.data();
    if (order.status === 'cancelled') throw new Error('الطلب ملغى — لا استرجاع جزئي');

    if (idemKey) {
      const priorRef = db.doc(`users/${uid}/idempotency/return_${idemKey}`);
      const priorQ = await tx.get(priorRef);
      if (docExists(priorQ)) {
        return { duplicate: true, returnId: priorQ.data().returnId };
      }
    }

    const items = order.items || [];
    const line = items.find((it) => lineProductId(it) === productId || it.productId === productId);
    if (!line) throw new Error('الصنف غير موجود في الفاتورة');

    const qtyCheck = validatePartialReturnQuantity(line, qty);
    if (!qtyCheck.ok) throw new Error(qtyCheck.message);

    const pid = lineProductId(line);
    const stockUnits = restock ? stockUnitsForItem({ ...line, quantity: qty }) : 0;

    let productRef = null;
    let productSnap = null;
    if (stockUnits > 0) {
      productRef = db.doc(`users/${uid}/products/${pid}`);
      productSnap = await tx.get(productRef);
      if (!docExists(productSnap)) throw new Error('المنتج غير موجود');
    }

    let shiftSnap = null;
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, input.shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل مرتجع الكاش');
      shiftSnap = shiftSnapFromDoc(openDoc);
    }

    let customerRef = null;
    let customerSnap = null;
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT && order.customerId) {
      customerRef = db.doc(`users/${uid}/customers/${order.customerId}`);
      customerSnap = await tx.get(customerRef);
      if (!docExists(customerSnap)) throw new Error('العميل غير موجود');
    }

    let layerRestore = null;
    if (stockUnits > 0 && productSnap) {
      layerRestore = await restoreInventoryForPartialReturn(tx, db, uid, pid, line, stockUnits);
    }

    const nextItems = items.map((it) => {
      if (lineProductId(it) !== pid && it.productId !== productId) return it;
      return { ...it, returnedQty: (Number(it.returnedQty) || 0) + qty };
    });

    const orderPatch = {
      items: nextItems,
      returnTotal: roundMoney((Number(order.returnTotal) || 0) + refundAmount),
      updatedAt: serverTimestamp(db),
    };

    if (refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      orderPatch.returnCashTotal = roundMoney((Number(order.returnCashTotal) || 0) + refundAmount);
    }
    if (refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT) {
      orderPatch.debtAmount = money(Math.max(0, money(order.debtAmount) - refundAmount));
      orderPatch.returnDebtTotal = roundMoney((Number(order.returnDebtTotal) || 0) + refundAmount);
    }

    tx.update(orderRef, orderPatch);

    if (productRef && productSnap && stockUnits > 0) {
      const currentStock = Number(productSnap.data().stock) || 0;
      tx.update(productRef, {
        stock: currentStock + stockUnits,
        updatedAt: serverTimestamp(db),
      });
    }

    if (shiftSnap && refundAmount > 0 && refundMethod === REFUND_METHOD_CASH) {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'refund',
        amount: refundAmount,
        reason: `استرجاع جزئي — طلب ${order.orderNumber || orderId}`,
        actor,
        orderId,
        orderNumber: order.orderNumber,
      });
    }

    if (customerRef && customerSnap && refundAmount > 0 && refundMethod === REFUND_METHOD_DEBT) {
      const bal = money(customerSnap.data().balance);
      const entry = {
        type: 'partial_return',
        orderId,
        orderNumber: order.orderNumber || null,
        amount: -refundAmount,
        date: new Date().toISOString(),
        note: reason,
      };
      tx.update(customerRef, {
        balance: money(Math.max(0, bal - refundAmount)),
        transactions: [...(customerSnap.data().transactions || []), entry].slice(-100),
        updatedAt: serverTimestamp(db),
      });
    }

    const returnRef = db.collection(`users/${uid}/orderReturns`).doc();
    const auditRef = db.collection(`users/${uid}/orderReturnAudits`).doc();

    const returnPayload = {
      orderId,
      orderNumber: order.orderNumber || null,
      productId: pid,
      productName: line.name || '',
      quantity: qty,
      stockUnits: stockUnits > 0 ? stockUnits : null,
      refundAmount,
      refundMethod,
      itemCondition,
      reason,
      restock,
      inventoryRestore: layerRestore,
      shiftId: shiftSnap?.id || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
      createdBy: actor || null,
      idempotencyKey: idemKey || null,
    };

    tx.set(returnRef, returnPayload);
    tx.set(auditRef, { ...returnPayload, returnId: returnRef.id, action: 'partial_return_created' });

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/return_${idemKey}`), {
        returnId: returnRef.id,
        orderId,
        createdAtMs: Date.now(),
      });
    }

    return { duplicate: false, returnId: returnRef.id };
  });
}

module.exports = { executePartialOrderReturn };
