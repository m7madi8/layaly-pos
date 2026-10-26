import { db, doc, collection, runTransaction, serverTimestamp, updateDoc } from '../firebaseClient';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';
import {
  SUPPLIER_PAYMENT_CATEGORY,
  SUPPLIER_PAYMENT_SECTION,
  buildPaymentReference,
  computeSupplierPayableFromExpenses,
  roundMoney,
  validateSupplierPaymentInput,
} from '../utils/supplierAccounting';

const expensesCol = (uid) => collection(db, 'users', uid, 'expenses');
const supplierRef = (uid, supplierId) => doc(db, 'users', uid, 'suppliers', supplierId);
const idempotencyCol = (uid) => collection(db, 'users', uid, 'supplierPaymentIdempotency');

function nextSupplierBalanceAfterPayment(supplierSnap, amount, expensesSnapshot, supplierId) {
  const hasStoredBalance =
    supplierSnap.data().balance != null && supplierSnap.data().balance !== '';
  const prevBalance = hasStoredBalance
    ? roundMoney(supplierSnap.data().balance)
    : computeSupplierPayableFromExpenses(expensesSnapshot || [], supplierId);
  return roundMoney(prevBalance - amount);
}

function nextSupplierBalanceAfterPurchase(supplierSnap, amount, expensesSnapshot, supplierId) {
  const hasStored = supplierSnap.data().balance != null && supplierSnap.data().balance !== '';
  const prev = hasStored
    ? roundMoney(supplierSnap.data().balance)
    : computeSupplierPayableFromExpenses(expensesSnapshot, supplierId);
  return roundMoney(prev + roundMoney(amount));
}

/**
 * Records a supplier payment once: expense + payable balance + optional cash withdrawal.
 * @returns {{ expenseId: string, paymentRef: string, cashRecorded: boolean }}
 */
export async function executeSupplierPayment(uid, input, { actor, idempotencyKey }) {
  const validation = validateSupplierPaymentInput({
    amount: input.amount,
    supplierId: input.supplierId,
    suppliers: input.suppliers,
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' — '));
  }

  const paymentMethod = String(input.paymentMethod || 'Cash').trim() || 'Cash';
  const payDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(payDate.getTime())) throw new Error('تاريخ الدفع غير صالح');

  const notes = String(input.notes || input.description || '').trim();
  const supplierName = validation.supplier?.name || 'تاجر';
  const paymentRef = buildPaymentReference(payDate);
  const amount = validation.amount;
  const supplierId = input.supplierId;
  const idemKey = String(idempotencyKey || '').trim();

  return runTransaction(db, async (tx) => {
    let idemRef = null;
    if (idemKey) {
      idemRef = doc(idempotencyCol(uid), idemKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        const data = idemSnap.data();
        return {
          expenseId: data.expenseId,
          paymentRef: data.paymentRef,
          cashRecorded: Boolean(data.cashRecorded),
          duplicate: true,
        };
      }
    }

    const sRef = supplierRef(uid, supplierId);
    const supplierSnap = await tx.get(sRef);
    if (!supplierSnap.exists()) throw new Error('التاجر غير موجود');

    let cashShiftCtx = null;
    if (paymentMethod === 'Cash') {
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, input.shiftId || null);
    }

    const expenseRef = doc(expensesCol(uid));
    const description = notes || `دفعة للتاجر — ${supplierName}`;

    const expenseData = {
      amount,
      date: payDate,
      section: SUPPLIER_PAYMENT_SECTION,
      category: SUPPLIER_PAYMENT_CATEGORY,
      description,
      notes,
      supplierId,
      supplierName,
      paymentMethod,
      paymentRef,
      recordedBy: actor || null,
      excludeFromReportTotals: true,
      linkedIngredientId: null,
      linkedProductId: null,
      linkedProductName: '',
      quantityBought: 0,
      receiptUrl: input.receiptUrl || '',
      userId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(expenseRef, expenseData);

    const newBalance = nextSupplierBalanceAfterPayment(
      supplierSnap,
      amount,
      input.expensesSnapshot || [],
      supplierId
    );
    tx.update(sRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });

    let cashRecorded = false;
    if (paymentMethod === 'Cash' && cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'withdrawal',
        amount,
        reason: `دفعة تاجر — ${supplierName}${paymentRef ? ` (${paymentRef})` : ''}`,
        actor,
        expenseId: expenseRef.id,
      });
      cashRecorded = true;
    }

    if (idemKey && idemRef) {
      tx.set(idemRef, {
        expenseId: expenseRef.id,
        paymentRef,
        cashRecorded,
        supplierId,
        amount,
        createdAt: serverTimestamp(),
      });
    }

    return {
      expenseId: expenseRef.id,
      paymentRef,
      cashRecorded,
      duplicate: false,
    };
  });
}

/** Increase supplier payable when a purchase expense is created (supplierSnap must be pre-read). */
export function applySupplierPurchaseBalanceWrite(
  tx,
  supplierRefPath,
  supplierSnap,
  supplierId,
  amount,
  expensesSnapshot = []
) {
  const amt = roundMoney(amount);
  if (!supplierSnap?.exists() || !(amt > 0)) return;
  const next = nextSupplierBalanceAfterPurchase(supplierSnap, amt, expensesSnapshot, supplierId);
  tx.update(supplierRefPath, { balance: next, updatedAt: serverTimestamp() });
}

/** @deprecated Use applySupplierPurchaseBalanceWrite after reading supplier in the same transaction. */
export async function applySupplierPurchaseBalanceInTransaction(
  tx,
  uid,
  supplierId,
  amount,
  expensesSnapshot = []
) {
  const sRef = supplierRef(uid, supplierId);
  const snap = await tx.get(sRef);
  applySupplierPurchaseBalanceWrite(tx, sRef, snap, supplierId, amount, expensesSnapshot);
}

/** Align stored payable with purchase/payment history (legacy suppliers). */
export async function reconcileSupplierBalance(uid, supplierId, expenses) {
  const computed = computeSupplierPayableFromExpenses(expenses, supplierId);
  await updateDoc(supplierRef(uid, supplierId), {
    balance: computed,
    updatedAt: serverTimestamp(),
  });
  return computed;
}
