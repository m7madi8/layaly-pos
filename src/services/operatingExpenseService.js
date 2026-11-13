import { Timestamp } from 'firebase/firestore';
import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import { roundMoney } from '../utils/productPricing';
import {
  assertExpensePaymentSourceSelected,
  PAYMENT_SOURCE_DRAWER,
  PAYMENT_SOURCE_VAULT,
  paymentSourceToLegacyMethod,
  legacyMethodToPaymentSource,
} from '../utils/expensePaymentSource';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';
import { vaultDocRef, applyVaultDebit, applyVaultCredit } from './vaultService';

const expensesCol = (uid) => collection(db, 'users', uid, 'expenses');
const idempotencyCol = (uid) => collection(db, 'users', uid, 'operatingExpenseIdempotency');

function resolvePaymentSourceFromExpense(expense) {
  const src = expense?.paymentSource;
  if (src === PAYMENT_SOURCE_DRAWER || src === PAYMENT_SOURCE_VAULT) return src;
  return legacyMethodToPaymentSource(expense?.paymentMethod);
}

export { resolvePaymentSourceFromExpense };

/**
 * @returns {Promise<{ expenseId, paymentSource, cashRecorded, vaultRecorded, duplicate? }>}
 */
export async function executeOperatingExpense(uid, input, { actor, shiftId, idempotencyKey }) {
  const paymentSource = input.paymentSource;
  assertExpensePaymentSourceSelected(paymentSource);

  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('أدخل مبلغ المصروف أكبر من صفر');

  const payDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(payDate.getTime())) throw new Error('تاريخ غير صالح');

  const category = String(input.category || 'Other').trim();
  const description = String(input.description || input.notes || '').trim();
  const notes = String(input.notes || '').trim();
  const idemKey = String(idempotencyKey || '').trim();

  return runTransaction(db, async (tx) => {
    if (idemKey) {
      const idemRef = doc(idempotencyCol(uid), idemKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        const data = idemSnap.data();
        return {
          expenseId: data.expenseId,
          paymentSource: data.paymentSource,
          cashRecorded: Boolean(data.cashRecorded),
          vaultRecorded: Boolean(data.vaultRecorded),
          duplicate: true,
        };
      }
    }

    let cashShiftCtx = null;
    if (paymentSource === PAYMENT_SOURCE_DRAWER) {
      const safeShiftId = String(shiftId || '').trim();
      if (!safeShiftId) {
        throw new Error('لا توجد وردية كاش مفتوحة — افتح الصندوق أو اختر مصدر الخزنة');
      }
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, safeShiftId, {
        allowQueryFallback: false,
      });
      if (!cashShiftCtx) {
        throw new Error('وردية الكاش غير متاحة — حدّث الصفحة من شاشة الصندوق');
      }
    }

    let vaultSnap = null;
    if (paymentSource === PAYMENT_SOURCE_VAULT) {
      vaultSnap = await tx.get(vaultDocRef(uid));
    }

    const expenseRef = doc(expensesCol(uid));
    const reasonLabel = description || category;

    let cashRecorded = false;
    let vaultRecorded = false;

    const expensePayload = {
      amount,
      date: Timestamp.fromDate(payDate),
      dateMs: payDate.getTime(),
      section: 'operating',
      category,
      description: reasonLabel,
      paymentMethod: paymentSourceToLegacyMethod(paymentSource),
      paymentSource,
      notes,
      receiptUrl: input.receiptUrl || '',
      staffMemberId: input.staffMemberId || '',
      shiftId: cashShiftCtx?.shiftId || null,
      cashRecorded: false,
      vaultRecorded: false,
      recordedBy: actor || null,
      userId: uid,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    };

    tx.set(expenseRef, expensePayload);

    if (paymentSource === PAYMENT_SOURCE_DRAWER && cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'withdrawal',
        amount,
        reason: `مصروف — ${reasonLabel}`,
        actor,
        expenseId: expenseRef.id,
      });
      cashRecorded = true;
    }

    if (paymentSource === PAYMENT_SOURCE_VAULT) {
      applyVaultDebit(tx, uid, vaultSnap, {
        amount,
        type: 'operating_expense',
        reason: `مصروف — ${reasonLabel}`,
        actor,
        expenseId: expenseRef.id,
      });
      vaultRecorded = true;
    }

    tx.update(expenseRef, { cashRecorded, vaultRecorded });

    if (idemKey) {
      const idemRef = doc(idempotencyCol(uid), idemKey);
      tx.set(idemRef, {
        expenseId: expenseRef.id,
        paymentSource,
        cashRecorded,
        vaultRecorded,
        amount,
        category,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
    }

    return {
      expenseId: expenseRef.id,
      paymentSource,
      cashRecorded,
      vaultRecorded,
      duplicate: false,
    };
  });
}

/** عكس مصروف تشغيلي مُسجّل من الصندوق أو الخزنة */
export async function reverseOperatingExpenseInTransaction(
  tx,
  uid,
  expense,
  { actor, shiftId }
) {
  const source = resolvePaymentSourceFromExpense(expense);
  const amount = roundMoney(expense.amount);
  if (!source || !(amount > 0)) return;

  const label = expense.description || expense.category || 'مصروف';

  if (source === PAYMENT_SOURCE_VAULT) {
    const vSnap = await tx.get(vaultDocRef(uid));
    applyVaultCredit(tx, uid, vSnap, {
      amount,
      type: 'expense_reversal',
      reason: `إلغاء مصروف — ${label}`,
      actor,
    });
    return;
  }

  if (source === PAYMENT_SOURCE_DRAWER && shiftId) {
    const ctx = await readOpenCashShiftInTransaction(tx, uid, shiftId, {
      allowQueryFallback: false,
    });
    if (ctx) {
      await appendCashMovementInTransaction(tx, uid, ctx.shiftId, ctx.shiftSnap, {
        type: 'deposit',
        amount,
        reason: `إلغاء مصروف — ${label}`,
        actor,
        expenseId: expense.id,
      });
    }
  }
}
