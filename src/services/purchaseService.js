import {
  db,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from '../firebaseClient';
import { purchaseUnitCost } from '../utils/productPricing';
import {
  normalizePurchasePaymentMethod,
  PURCHASE_PAYMENT_CASH,
  PURCHASE_PAYMENT_VAULT,
  purchaseIncreasesSupplierDebt,
} from '../utils/purchasePayment';
import { roundMoney } from '../utils/supplierAccounting';
import { applySupplierPurchaseBalanceWrite } from './supplierPaymentService';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';
import { vaultDocRef, applyVaultCredit, applyVaultDebit } from './vaultService';

/**
 * @returns {Promise<{ expenseId: string, paymentMethod: string, cashRecorded: boolean, vaultRecorded: boolean }>}
 */
export async function executePurchase(uid, input, { actor, shiftId = null }) {
  const paymentMethod = normalizePurchasePaymentMethod(input.paymentMethod);
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('أدخل مبلغ المشتريات أكبر من صفر');
  if (!input.supplierId) throw new Error('اختر التاجر');

  const payDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(payDate.getTime())) throw new Error('تاريخ غير صالح');

  const quantityBought = parseFloat(input.quantityBought) || 0;
  const supplierName = String(input.supplierName || '').trim();

  return runTransaction(db, async (tx) => {
    let cashShiftCtx = null;
    if (paymentMethod === PURCHASE_PAYMENT_CASH) {
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
    }

    let vaultSnap = null;
    if (paymentMethod === PURCHASE_PAYMENT_VAULT) {
      const vRef = vaultDocRef(uid);
      vaultSnap = await tx.get(vRef);
    }

    const expenseRef = doc(collection(db, 'users', uid, 'expenses'));

    let ingRef = null;
    let currentStock = 0;
    if (input.linkedIngredientId && quantityBought > 0) {
      ingRef = doc(db, 'users', uid, 'ingredients', input.linkedIngredientId);
      const ingDoc = await tx.get(ingRef);
      if (ingDoc.exists()) currentStock = ingDoc.data().stock || 0;
    }

    let productRef = null;
    let productData = null;
    if (input.linkedProductId && quantityBought > 0) {
      productRef = doc(db, 'users', uid, 'products', input.linkedProductId);
      const productDoc = await tx.get(productRef);
      if (!productDoc.exists()) throw new Error('الصنف المرتبط بالمشتريات غير موجود');
      productData = productDoc.data();
    }

    let supplierRefPath = null;
    let supplierSnap = null;
    if (input.supplierId) {
      supplierRefPath = doc(db, 'users', uid, 'suppliers', input.supplierId);
      supplierSnap = await tx.get(supplierRefPath);
      if (!supplierSnap.exists()) throw new Error('التاجر غير موجود');
    }

    const expenseData = {
      amount,
      date: payDate,
      section: 'purchase',
      category: input.category,
      description: input.description || '',
      supplierId: input.supplierId,
      supplierName: supplierName || supplierSnap?.data()?.name || '',
      paymentMethod,
      notes: String(input.notes || '').trim(),
      linkedIngredientId: input.linkedIngredientId || null,
      linkedProductId: input.linkedProductId || null,
      linkedProductName: input.linkedProductName || '',
      quantityBought,
      receiptUrl: input.receiptUrl || '',
      recordedBy: actor || null,
      userId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(expenseRef, expenseData);

    if (ingRef) {
      tx.update(ingRef, { stock: currentStock + quantityBought });
    }
    if (productRef && productData) {
      const unitCost = purchaseUnitCost(productData, amount, quantityBought);
      tx.update(productRef, {
        stock: (Number(productData.stock) || 0) + quantityBought,
        ...(unitCost > 0 ? { cost: unitCost } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    if (
      supplierRefPath &&
      supplierSnap?.exists() &&
      purchaseIncreasesSupplierDebt({ paymentMethod })
    ) {
      applySupplierPurchaseBalanceWrite(
        tx,
        supplierRefPath,
        supplierSnap,
        input.supplierId,
        amount,
        input.expensesSnapshot || []
      );
    }

    let cashRecorded = false;
    if (paymentMethod === PURCHASE_PAYMENT_CASH && cashShiftCtx) {
      const label = supplierName || supplierSnap?.data()?.name || 'تاجر';
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'withdrawal',
        amount,
        reason: `مشتريات — ${label}${input.linkedProductName ? ` (${input.linkedProductName})` : ''}`,
        actor,
        expenseId: expenseRef.id,
      });
      cashRecorded = true;
    }

    let vaultRecorded = false;
    if (paymentMethod === PURCHASE_PAYMENT_VAULT) {
      const label = supplierName || supplierSnap?.data()?.name || 'تاجر';
      applyVaultDebit(tx, uid, vaultSnap, {
        amount,
        type: 'purchase',
        reason: `مشتريات — ${label}`,
        actor,
        expenseId: expenseRef.id,
      });
      vaultRecorded = true;
    }

    return {
      expenseId: expenseRef.id,
      paymentMethod,
      cashRecorded,
      vaultRecorded,
    };
  });
}

/** داخل transaction حذف مشتريات — عكس الدين أو إرجاع نقد/خزنة */
export async function reversePurchaseEffectsInTransaction(
  tx,
  uid,
  expense,
  { actor, supplierDocRef, supplierSnap, shiftId }
) {
  const paymentMethod = normalizePurchasePaymentMethod(expense.paymentMethod);
  const amount = roundMoney(expense.amount);
  if (!(amount > 0)) return;

  if (supplierDocRef && supplierSnap?.exists() && purchaseIncreasesSupplierDebt(expense)) {
    const prev = roundMoney(supplierSnap.data().balance);
    tx.update(supplierDocRef, {
      balance: roundMoney(prev - amount),
      updatedAt: serverTimestamp(),
    });
  }

  if (paymentMethod === PURCHASE_PAYMENT_VAULT) {
    const vRef = vaultDocRef(uid);
    const vSnap = await tx.get(vRef);
    applyVaultCredit(tx, uid, vSnap, {
      amount,
      type: 'purchase_reversal',
      reason: `إلغاء مشتريات — ${expense.description || expense.id}`,
      actor,
    });
  }

  if (paymentMethod === PURCHASE_PAYMENT_CASH) {
    const cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
    if (cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'deposit',
        amount,
        reason: `إلغاء مشتريات — ${expense.description || expense.id}`,
        actor,
        expenseId: expense.id,
      });
    }
  }
}
