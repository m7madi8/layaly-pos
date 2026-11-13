import {
  db,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  query,
  where,
  getDocs,
} from '../firebaseClient';
import { roundMoney } from '../utils/employeeBenefitAccounting';
import {
  assertExpensePaymentSourceSelected,
  PAYMENT_SOURCE_DRAWER,
  paymentSourceToLegacyMethod,
} from '../utils/expensePaymentSource';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';
import { vaultDocRef, applyVaultCredit } from './vaultService';

const posDebtsCol = (uid) => collection(db, 'users', uid, 'employeePosDebts');
const repaymentsCol = (uid) => collection(db, 'users', uid, 'employeeDebtRepayments');
const repayIdempotencyCol = (uid) => collection(db, 'users', uid, 'employeeDebtRepayIdempotency');
const posDebtIdempotencyCol = (uid) => collection(db, 'users', uid, 'employeePosDebtIdempotency');
const advancesCol = (uid) => collection(db, 'users', uid, 'employeeAdvances');

/** يُستدعى داخل معاملة إتمام طلب — لا يُكرّر الدين لنفس orderId */
export async function recordEmployeePosDebtInTransaction(
  tx,
  uid,
  {
    staffMemberId,
    staffName,
    orderId,
    orderNumber,
    amount,
    itemsSummary,
    actor,
    idempotencyKey,
  }
) {
  const amt = roundMoney(amount);
  const sid = String(staffMemberId || '').trim();
  if (!sid || !(amt > 0)) return null;
  if (!orderId) throw new Error('معرّف الطلب مطلوب لتسجيل دين الموظف');

  const idemKey = String(idempotencyKey || `pos_debt_${orderId}`).trim();
  const idemRef = doc(posDebtIdempotencyCol(uid), idemKey);
  const idemSnap = await tx.get(idemRef);
  if (idemSnap.exists()) {
    return { posDebtId: idemSnap.data().posDebtId, duplicate: true };
  }

  const debtRef = doc(posDebtsCol(uid));
  tx.set(debtRef, {
    staffMemberId: sid,
    staffName: String(staffName || '').trim(),
    orderId: String(orderId),
    orderNumber: String(orderNumber || ''),
    amount: amt,
    amountRepaid: 0,
    status: 'open',
    itemsSummary: String(itemsSummary || '').slice(0, 500),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    recordedBy: actor || null,
  });
  tx.set(idemRef, { posDebtId: debtRef.id, orderId, amount: amt, createdAtMs: Date.now() });
  return { posDebtId: debtRef.id, duplicate: false };
}

export async function listPosDebtsForStaff(uid, staffMemberId) {
  const q = query(posDebtsCol(uid), where('staffMemberId', '==', staffMemberId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listEmployeeDebtRepaymentsForStaff(uid, staffMemberId) {
  const q = query(repaymentsCol(uid), where('staffMemberId', '==', staffMemberId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listPayrollPaymentsForStaff(uid, staffMemberId) {
  const q = query(collection(db, 'users', uid, 'payrollPayments'), where('staffMemberId', '==', staffMemberId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * تسديد دين موظف (نقطة البيع + سلف) — إيداع للصندوق أو الخزنة، بدون مصروف تشغيلي.
 */
export async function recordEmployeeDebtRepayment(
  uid,
  {
    staffMemberId,
    amount,
    paymentSource,
    note = '',
    actor,
    shiftId,
    idempotencyKey,
  }
) {
  assertExpensePaymentSourceSelected(paymentSource);
  const pay = roundMoney(amount);
  if (!(pay > 0)) throw new Error('أدخل مبلغ التسديد أكبر من صفر');
  const sid = String(staffMemberId || '').trim();
  if (!sid) throw new Error('معرّف الموظف مطلوب');

  const idemKey = String(idempotencyKey || '').trim();

  return runTransaction(db, async (tx) => {
    if (idemKey) {
      const idemRef = doc(repayIdempotencyCol(uid), idemKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        return { repaymentId: idemSnap.data().repaymentId, duplicate: true };
      }
    }

    const posQ = query(posDebtsCol(uid), where('staffMemberId', '==', sid));
    const posSnap = await tx.get(posQ);
    const posDebts = posSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter((d) => d.status !== 'cancelled' && d.status !== 'closed')
      .map((d) => ({
        ...d,
        remaining: roundMoney((Number(d.amount) || 0) - (Number(d.amountRepaid) || 0)),
      }))
      .filter((d) => d.remaining > 0)
      .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));

    const advQ = query(advancesCol(uid), where('staffMemberId', '==', sid));
    const advSnap = await tx.get(advQ);
    const advances = advSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter((a) => roundMoney(a.balanceRemaining) > 0 && a.status !== 'closed')
      .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));

    let remainingPay = pay;
    const allocations = [];

    for (const d of posDebts) {
      if (remainingPay <= 0) break;
      const use = roundMoney(Math.min(remainingPay, d.remaining));
      if (!(use > 0)) continue;
      const newRepaid = roundMoney((Number(d.amountRepaid) || 0) + use);
      const closed = newRepaid >= roundMoney(d.amount) - 0.009;
      tx.update(d.ref, {
        amountRepaid: newRepaid,
        status: closed ? 'closed' : 'partial',
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      });
      allocations.push({ kind: 'pos_debt', id: d.id, amount: use, orderId: d.orderId });
      remainingPay = roundMoney(remainingPay - use);
    }

    for (const a of advances) {
      if (remainingPay <= 0) break;
      const advRem = roundMoney(a.balanceRemaining);
      const use = roundMoney(Math.min(remainingPay, advRem));
      if (!(use > 0)) continue;
      const nextRem = roundMoney(advRem - use);
      tx.update(a.ref, {
        balanceRemaining: nextRem,
        status: nextRem <= 0.009 ? 'closed' : 'open',
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      });
      allocations.push({ kind: 'advance', id: a.id, amount: use });
      remainingPay = roundMoney(remainingPay - use);
    }

  const applied = roundMoney(pay - remainingPay);
    if (!(applied > 0)) {
      throw new Error('لا يوجد دين مفتوح على هذا الموظف لتسديده');
    }

    let cashShiftCtx = null;
    let vaultSnap = null;
    if (paymentSource === PAYMENT_SOURCE_DRAWER) {
      const safeShiftId = String(shiftId || '').trim();
      if (!safeShiftId) throw new Error('لا توجد وردية كاش مفتوحة — افتح الصندوق أو اختر الخزنة');
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, safeShiftId, { allowQueryFallback: false });
      if (!cashShiftCtx) throw new Error('وردية الكاش غير متاحة');
    } else {
      vaultSnap = await tx.get(vaultDocRef(uid));
    }

    const repayRef = doc(repaymentsCol(uid));
    const paymentSourceLabel =
      paymentSource === PAYMENT_SOURCE_DRAWER ? 'الصندوق' : 'الخزنة';

    tx.set(repayRef, {
      staffMemberId: sid,
      amount: applied,
      allocations,
      paymentSource,
      paymentSourceLabel,
      paymentMethod: paymentSourceToLegacyMethod(paymentSource),
      notes: String(note || '').trim(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      recordedBy: actor || null,
      shiftId: cashShiftCtx?.shiftId || null,
    });

    if (cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'deposit',
        amount: applied,
        reason: `تسديد دين موظف`,
        actor,
      });
    } else {
      applyVaultCredit(tx, uid, vaultSnap, {
        amount: applied,
        type: 'employee_debt_repay',
        reason: `تسديد دين موظف`,
        actor,
      });
    }

    if (idemKey) {
      const idemRef = doc(repayIdempotencyCol(uid), idemKey);
      tx.set(idemRef, { repaymentId: repayRef.id, amount: applied, createdAtMs: Date.now() });
    }

    return { repaymentId: repayRef.id, amountApplied: applied, allocations, duplicate: false };
  });
}

/** عكس دين نقطة بيع عند إلغاء طلب */
export async function cancelEmployeePosDebtForOrderInTransaction(tx, uid, orderId, { actor, reason }) {
  const oid = String(orderId || '').trim();
  if (!oid) return;
  const q = query(posDebtsCol(uid), where('orderId', '==', oid));
  const snap = await tx.get(q);
  for (const d of snap.docs) {
    const data = d.data();
    if (data.status === 'cancelled') continue;
    tx.update(d.ref, {
      status: 'cancelled',
      cancelReason: String(reason || 'إلغاء طلب').trim(),
      cancelledAt: serverTimestamp(),
      cancelledAtMs: Date.now(),
      cancelledBy: actor || null,
    });
  }
}
