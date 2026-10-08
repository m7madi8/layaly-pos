import { db, doc, collection, addDoc, getDocs, query, orderBy, runTransaction, serverTimestamp } from '../firebaseClient';
import { computeExpectedCash } from '../utils/cashShiftMath';
import { vaultDocRef, applyVaultCredit } from './vaultService';

export { computeExpectedCash, summarizeMovements } from '../utils/cashShiftMath';

const shiftsCol = (uid) => collection(db, 'users', uid, 'cashShifts');
const movementsCol = (uid) => collection(db, 'users', uid, 'cashMovements');
export const cashShiftRef = (uid, id) => doc(db, 'users', uid, 'cashShifts', id);
export const cashMovementRef = (uid, id) => doc(db, 'users', uid, 'cashMovements', id);

export async function findOpenCashShift(uid) {
  const snap = await getDocs(query(shiftsCol(uid), orderBy('openedAtMs', 'desc')));
  const open = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((s) => s.status === 'open');
  return open || null;
}

export async function findLastClosedCashShift(uid) {
  const snap = await getDocs(query(shiftsCol(uid), orderBy('closedAtMs', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((s) => s.status === 'closed') || null;
}

export async function openCashShift(uid, { openingBalance, actor, notes = '' }) {
  const existing = await findOpenCashShift(uid);
  if (existing) throw new Error('يوجد وردية كاش مفتوحة بالفعل — أغلقها أولاً');

  const opening = Math.max(0, Number(openingBalance) || 0);
  const nowMs = Date.now();
  const ref = await addDoc(shiftsCol(uid), {
    status: 'open',
    openingBalance: opening,
    cashSales: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    cashRefunds: 0,
    expectedClosingBalance: opening,
    actualClosingBalance: null,
    difference: null,
    notes: String(notes || '').trim(),
    openedAt: serverTimestamp(),
    openedAtMs: nowMs,
    openedBy: actor || null,
    employeeId: actor?.role || null,
    closedAt: null,
    closedAtMs: null,
    closedBy: null,
  });
  return ref.id;
}

async function appendMovementInTx(tx, uid, shiftId, shiftSnap, { type, amount, reason, actor, orderId, orderNumber }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');
  if (!shiftSnap.exists()) throw new Error('وردية الكاش غير موجودة');
  const shift = shiftSnap.data();
  if (shift.status !== 'open') throw new Error('وردية الكاش مغلقة');

  const sums = {
    cashSales: Number(shift.cashSales) || 0,
    cashWithdrawals: Number(shift.cashWithdrawals) || 0,
    cashDeposits: Number(shift.cashDeposits) || 0,
    cashRefunds: Number(shift.cashRefunds) || 0,
  };
  if (type === 'sale') sums.cashSales += amt;
  else if (type === 'withdrawal') sums.cashWithdrawals += amt;
  else if (type === 'deposit') sums.cashDeposits += amt;
  else if (type === 'refund') sums.cashRefunds += amt;
  else throw new Error('نوع حركة غير صالح');

  const expected = computeExpectedCash({
    openingBalance: shift.openingBalance,
    ...sums,
  });
  if (expected < -0.001) throw new Error('لا يمكن أن يصبح رصيد الصندوق سالباً');

  const mRef = doc(movementsCol(uid));
  tx.set(mRef, {
    shiftId,
    type,
    amount: amt,
    reason: String(reason || '').trim(),
    employeeId: actor?.role || null,
    createdBy: actor || null,
    orderId: orderId || null,
    orderNumber: orderNumber || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  tx.update(cashShiftRef(uid, shiftId), {
    ...sums,
    expectedClosingBalance: expected,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });
  return mRef.id;
}

export async function recordCashSale(uid, { shiftId, amount, orderId, orderNumber, actor }) {
  if (!(Number(amount) > 0)) return null;
  let targetShiftId = shiftId;
  if (!targetShiftId) {
    const open = await findOpenCashShift(uid);
    if (!open) return null;
    targetShiftId = open.id;
  }
  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, targetShiftId);
    const snap = await tx.get(sRef);
    await appendMovementInTx(tx, uid, targetShiftId, snap, {
      type: 'sale',
      amount,
      reason: orderNumber ? `بيع طلب #${orderNumber}` : 'بيع كاش',
      actor,
      orderId,
      orderNumber,
    });
  });
  return targetShiftId;
}

export async function recordCashWithdrawal(uid, { shiftId, amount, reason, actor }) {
  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    await appendMovementInTx(tx, uid, shiftId, snap, {
      type: 'withdrawal',
      amount,
      reason: reason || 'سحب من الصندوق',
      actor,
    });
  });
}

export async function recordCashDeposit(uid, { shiftId, amount, reason, actor }) {
  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    await appendMovementInTx(tx, uid, shiftId, snap, {
      type: 'deposit',
      amount,
      reason: reason || 'إيداع في الصندوق',
      actor,
    });
  });
}

/**
 * إغلاق الوردية:
 * actualClosingBalance = المبلغ المتبقي في الصندوق
 * withdrawal أثناء الإغلاق = expected - actual (إن كان موجباً)
 */
export async function closeCashShift(uid, { shiftId, actualClosingBalance, notes = '', actor }) {
  const actual = Math.max(0, Number(actualClosingBalance));
  if (!Number.isFinite(actual)) throw new Error('أدخل المبلغ الفعلي في الصندوق');

  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكاش غير موجودة');
    const shift = snap.data();
    if (shift.status !== 'open') throw new Error('تم إغلاق هذه الوردية مسبقاً');

    const expected = computeExpectedCash({
      openingBalance: shift.openingBalance,
      cashSales: shift.cashSales,
      cashDeposits: shift.cashDeposits,
      cashWithdrawals: shift.cashWithdrawals,
      cashRefunds: shift.cashRefunds,
    });

    const closingWithdrawal = Math.round(Math.max(0, expected - actual) * 100) / 100;
    let finalWithdrawals = Number(shift.cashWithdrawals) || 0;
    let finalExpected = expected;

    if (closingWithdrawal > 0) {
      finalWithdrawals += closingWithdrawal;
      finalExpected = computeExpectedCash({
        openingBalance: shift.openingBalance,
        cashSales: shift.cashSales,
        cashDeposits: shift.cashDeposits,
        cashWithdrawals: finalWithdrawals,
        cashRefunds: shift.cashRefunds,
      });
      const mRef = doc(movementsCol(uid));
      tx.set(mRef, {
        shiftId,
        type: 'withdrawal',
        amount: closingWithdrawal,
        reason: 'نقل إلى الخزنة عند إغلاق الكاش',
        employeeId: actor?.role || null,
        createdBy: actor || null,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        isClosingWithdrawal: true,
        toVault: true,
      });

      const vRef = vaultDocRef(uid);
      const vSnap = await tx.get(vRef);
      applyVaultCredit(tx, uid, vSnap, {
        amount: closingWithdrawal,
        type: 'from_cash_close',
        reason: 'إغلاق كاش — الفائض إلى الخزنة',
        actor,
        shiftId,
      });
    }

    if (actual > expected + 0.001) {
      // إبقاء الفرق كـ over — لا إيداع تلقائي بدون تأكيد صريح
    }

    const difference = Math.round((actual - finalExpected) * 100) / 100;
    tx.update(sRef, {
      status: 'closed',
      cashWithdrawals: finalWithdrawals,
      expectedClosingBalance: finalExpected,
      actualClosingBalance: actual,
      vaultTransferOnClose: closingWithdrawal,
      difference,
      closingNotes: String(notes || '').trim(),
      closedAt: serverTimestamp(),
      closedAtMs: Date.now(),
      closedBy: actor || null,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    });
  });
}
