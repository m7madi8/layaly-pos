import { db, doc, collection, addDoc, runTransaction, serverTimestamp, query, where, getDocs } from '../firebaseClient';
import { roundMoney } from '../utils/employeeBenefitAccounting';

const accrualsCol = (uid) => collection(db, 'users', uid, 'payrollAccruals');
const paymentsCol = (uid) => collection(db, 'users', uid, 'payrollPayments');
const advancesCol = (uid) => collection(db, 'users', uid, 'employeeAdvances');
const expensesCol = (uid) => collection(db, 'users', uid, 'expenses');

export const PAYROLL_STATUS_DUE = 'due';
export const PAYROLL_STATUS_PARTIAL = 'partial';
export const PAYROLL_STATUS_PAID = 'paid';

/** Create salary accrual (not an expense until payment). */
export async function createPayrollAccrual(uid, { staffMemberId, staffName, amount, periodLabel, dueDate }) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغ الراتب');
  if (!staffMemberId) throw new Error('اختر الموظف');
  const ref = await addDoc(accrualsCol(uid), {
    staffMemberId,
    staffName: String(staffName || '').trim(),
    amountDue: amt,
    amountPaid: 0,
    status: PAYROLL_STATUS_DUE,
    periodLabel: String(periodLabel || '').trim() || 'راتب',
    dueDate: dueDate || new Date(),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return ref.id;
}

/** Pay salary (partial or full) — single expense + payment row. */
export async function recordPayrollPayment(uid, { accrualId, amount, paymentMethod = 'Cash', note = '', actor, shiftId, idempotencyKey }) {
  const pay = roundMoney(amount);
  if (!(pay > 0)) throw new Error('أدخل مبلغ الدفعة');

  return runTransaction(db, async (tx) => {
    const aRef = doc(accrualsCol(uid), accrualId);
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists()) throw new Error('سجل الراتب غير موجود');
    const acc = aSnap.data();
    const remaining = roundMoney((Number(acc.amountDue) || 0) - (Number(acc.amountPaid) || 0));
    if (pay > remaining + 0.009) throw new Error(`المتبقي على الراتب ${remaining} ₪ فقط`);

    const newPaid = roundMoney((Number(acc.amountPaid) || 0) + pay);
    const newStatus =
      newPaid >= (Number(acc.amountDue) || 0) - 0.009 ? PAYROLL_STATUS_PAID : PAYROLL_STATUS_PARTIAL;

    const expenseRef = doc(expensesCol(uid));
    tx.set(expenseRef, {
      amount: pay,
      date: new Date(),
      category: 'Salaries',
      section: 'operating',
      description: `راتب — ${acc.staffName || ''} (${acc.periodLabel || ''})`,
      staffMemberId: acc.staffMemberId,
      payrollAccrualId: accrualId,
      paymentMethod,
      notes: String(note || '').trim(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      createdBy: actor || null,
      idempotencyKey: idempotencyKey || null,
    });

    const pRef = doc(paymentsCol(uid));
    tx.set(pRef, {
      accrualId,
      staffMemberId: acc.staffMemberId,
      amount: pay,
      expenseId: expenseRef.id,
      paymentMethod,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    tx.update(aRef, {
      amountPaid: newPaid,
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    });

    return { expenseId: expenseRef.id, paymentId: pRef.id, status: newStatus };
  });
}

export async function recordEmployeeAdvance(uid, { staffMemberId, staffName, amount, note = '', actor, paymentMethod = 'Cash' }) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغ السلفة');
  if (!staffMemberId) throw new Error('اختر الموظف');

  return runTransaction(db, async (tx) => {
    const advRef = doc(advancesCol(uid));
    const expenseRef = doc(expensesCol(uid));
    tx.set(advRef, {
      staffMemberId,
      staffName: String(staffName || '').trim(),
      amount: amt,
      balanceRemaining: amt,
      status: 'open',
      notes: String(note || '').trim(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    tx.set(expenseRef, {
      amount: amt,
      date: new Date(),
      category: 'Advance',
      section: 'operating',
      description: `سلفة — ${staffName || ''}`,
      staffMemberId,
      employeeAdvanceId: advRef.id,
      paymentMethod,
      notes: String(note || '').trim(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      createdBy: actor || null,
    });
    return { advanceId: advRef.id, expenseId: expenseRef.id };
  });
}

/** Repay advance (deduct from remaining balance). */
export async function recordAdvanceRepayment(uid, { advanceId, amount, note = '', actor, paymentMethod = 'Cash' }) {
  const pay = roundMoney(amount);
  if (!(pay > 0)) throw new Error('أدخل مبلغ التسديد');

  return runTransaction(db, async (tx) => {
    const advRef = doc(advancesCol(uid), advanceId);
    const advSnap = await tx.get(advRef);
    if (!advSnap.exists()) throw new Error('سجل السلفة غير موجود');
    const adv = advSnap.data();
    const rem = roundMoney(Number(adv.balanceRemaining) || 0);
    if (pay > rem + 0.009) throw new Error(`المتبقي على السلفة ${rem} ₪ فقط`);

    const nextRem = roundMoney(rem - pay);
    const expenseRef = doc(expensesCol(uid));
    tx.set(expenseRef, {
      amount: pay,
      date: new Date(),
      category: 'Advance',
      section: 'operating',
      description: `تسديد سلفة — ${adv.staffName || ''}`,
      staffMemberId: adv.staffMemberId,
      employeeAdvanceId: advanceId,
      paymentMethod,
      notes: String(note || '').trim(),
      isAdvanceRepayment: true,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      createdBy: actor || null,
    });

    tx.update(advRef, {
      balanceRemaining: nextRem,
      status: nextRem <= 0.009 ? 'closed' : 'open',
      updatedAt: serverTimestamp(),
    });

    return { expenseId: expenseRef.id, balanceRemaining: nextRem };
  });
}

export async function listPayrollAccrualsForStaff(uid, staffMemberId) {
  const q = query(accrualsCol(uid), where('staffMemberId', '==', staffMemberId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAdvancesForStaff(uid, staffMemberId) {
  const q = query(advancesCol(uid), where('staffMemberId', '==', staffMemberId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
