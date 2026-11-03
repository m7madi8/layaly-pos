import { db, doc, collection, addDoc, getDocs, query, orderBy, where, limit, runTransaction, serverTimestamp } from '../firebaseClient';
import { computeExpectedCash } from '../utils/cashShiftMath';
import { assertDocId, assertFirestoreDocRef } from '../utils/firestoreIds';
import { vaultDocRef, applyVaultCredit } from './vaultService';
import {
  appendOnDutyRosterEntry,
  buildOnDutyRosterInitial,
  buildWorkedStaffSnapshot,
  ensureRosterFromShift,
  getActiveOnDutyIdsFromShift,
  markOnDutyRosterRemoved,
  rosterFromLegacyIds,
} from '../utils/shiftOnDutyRoster';

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

/** كل حركات وردية واحدة (لتفاصيل سجل الورديات). */
export async function listCashMovementsForShift(uid, shiftId) {
  if (!shiftId) return [];
  const snap = await getDocs(query(movementsCol(uid), where('shiftId', '==', shiftId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
}

export async function openCashShift(uid, {
  openingBalance,
  expectedOpeningBalance,
  onDutyStaffIds = [],
  onDutyStaffRoster = null,
  actor,
  notes = '',
  shiftPeriod = 1,
  operatorName = '',
  staffMembersForSnapshot = [],
}) {
  const existing = await findOpenCashShift(uid);
  if (existing) throw new Error('يوجد وردية كاش مفتوحة بالفعل — أغلقها أولاً');

  const expected = Math.max(0, Number(expectedOpeningBalance ?? openingBalance) || 0);
  const opening = Math.max(0, Number(openingBalance) || 0);
  const openingDifference = Math.round((opening - expected) * 100) / 100;
  const duty = Array.isArray(onDutyStaffIds) ? [...new Set(onDutyStaffIds.filter(Boolean))] : [];
  if (duty.length === 0) throw new Error('اختر موظفاً واحداً على الأقل مداوماً في الشفت');

  const roster =
    Array.isArray(onDutyStaffRoster) && onDutyStaffRoster.length > 0
      ? onDutyStaffRoster
      : buildOnDutyRosterInitial(staffMembersForSnapshot, duty, actor);

  const nowMs = Date.now();
  const period = Number(shiftPeriod) === 2 ? 2 : 1;
  const ref = await addDoc(shiftsCol(uid), {
    status: 'open',
    shiftPeriod: period,
    operatorName: String(operatorName || '').trim(),
    openingBalance: opening,
    expectedOpeningBalance: expected,
    openingDifference,
    onDutyStaffIds: duty,
    onDutyStaffRoster: roster,
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

/** Assign on-duty staff to legacy open shift only (does not touch closed shifts). */
export async function assignOnDutyStaffToOpenShift(uid, { shiftId, onDutyStaffIds, actor, staffMembers = [] }) {
  const duty = Array.isArray(onDutyStaffIds) ? [...new Set(onDutyStaffIds.filter(Boolean))] : [];
  if (duty.length === 0) throw new Error('اختر موظفاً واحداً على الأقل');

  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكاش غير موجودة');
    const shift = snap.data();
    if (shift.status !== 'open') throw new Error('يمكن تعيين المداومين للوردية المفتوحة فقط');
    const roster = rosterFromLegacyIds(staffMembers, duty, actor, 'legacy_assign');
    tx.update(sRef, {
      onDutyStaffIds: duty,
      onDutyStaffRoster: roster,
      onDutyAssignedAtMs: Date.now(),
      onDutyAssignedBy: actor || null,
      updatedAt: serverTimestamp(),
    });
  });
}

function updateOpenShiftOnDutyInTx(tx, sRef, shift, nextRoster) {
  const activeIds = getActiveOnDutyIdsFromShift({ ...shift, onDutyStaffRoster: nextRoster });
  if (activeIds.length === 0) throw new Error('يجب أن يبقى موظف واحد على الأقل مداوماً');
  tx.update(sRef, {
    onDutyStaffRoster: nextRoster,
    onDutyStaffIds: activeIds,
    onDutyUpdatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/** Add one staff member to open shift (no cash / new shift). */
export async function addOnDutyStaffToOpenShift(uid, { shiftId, staffId, staffName, actor, staffMembers = [] }) {
  const id = String(staffId || '').trim();
  if (!id) throw new Error('معرف الموظف غير صالح');

  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكاش غير موجودة');
    const shift = snap.data();
    if (shift.status !== 'open') throw new Error('يمكن إضافة مداومين للوردية المفتوحة فقط');
    let roster = ensureRosterFromShift(shift, staffMembers, actor);
    roster = appendOnDutyRosterEntry(roster, {
      staffId: id,
      staffName,
      actor,
      source: 'mid_shift_add',
    });
    updateOpenShiftOnDutyInTx(tx, sRef, shift, roster);
  });
}

/** Remove staff from active on-duty list (keeps historical roster entry). */
export async function removeOnDutyStaffFromOpenShift(uid, { shiftId, staffId, actor, staffMembers = [] }) {
  const id = String(staffId || '').trim();
  if (!id) throw new Error('معرف الموظف غير صالح');

  await runTransaction(db, async (tx) => {
    const sRef = cashShiftRef(uid, shiftId);
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error('وردية الكاش غير موجودة');
    const shift = snap.data();
    if (shift.status !== 'open') throw new Error('يمكن تعديل المداومين للوردية المفتوحة فقط');
    let roster = ensureRosterFromShift(shift, staffMembers, actor);
    roster = markOnDutyRosterRemoved(roster, id, actor);
    updateOpenShiftOnDutyInTx(tx, sRef, shift, roster);
  });
}

/** Read open shift inside a transaction — must run before any writes in the same transaction. */
export async function readOpenCashShiftInTransaction(
  tx,
  uid,
  preferredShiftId = null,
  { allowQueryFallback = true } = {}
) {
  const safeUid = assertDocId(uid, 'معرّف المستخدم غير صالح');
  if (preferredShiftId) {
    const shiftId = assertDocId(preferredShiftId, 'معرّف وردية الكاش غير صالح');
    const ref = assertFirestoreDocRef(
      cashShiftRef(safeUid, shiftId),
      'مرجع وردية الكاش غير صالح — حدّث الصفحة وافتح الوردية من شاشة الكاش'
    );
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== 'open') return null;
    return { shiftId, shiftSnap: snap };
  }
  if (!allowQueryFallback) return null;
  const q = query(shiftsCol(safeUid), where('status', '==', 'open'), limit(1));
  const qSnap = await tx.get(q);
  if (qSnap.empty) return null;
  const shiftSnap = qSnap.docs[0];
  return { shiftId: shiftSnap.id, shiftSnap };
}

/** Append cash movement when shift was already read (no further reads). */
export async function appendCashMovementInTransaction(tx, uid, shiftId, shiftSnap, movement) {
  return appendMovementInTx(tx, uid, shiftId, shiftSnap, movement);
}

async function appendMovementInTx(
  tx,
  uid,
  shiftId,
  shiftSnap,
  { type, amount, reason, actor, orderId, orderNumber, expenseId }
) {
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
    expenseId: expenseId || null,
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

/** Record cash sale inside an existing Firestore transaction (order + shift atomicity). */
export async function recordCashSaleInTransaction(tx, uid, { amount, orderId, orderNumber, actor, shiftId, shiftSnap }) {
  if (!(Number(amount) > 0)) return null;
  const snap = shiftSnap;
  if (!snap?.exists?.()) {
    throw new Error(
      'وردية الكاش غير محمّلة داخل معاملة الطلب — أغلق نافذة الدفع، تأكد من فتح الوردية، ثم أعد المحاولة'
    );
  }
  const shiftDocId = shiftId || snap.id;
  await appendMovementInTx(tx, uid, shiftDocId, snap, {
    type: 'sale',
    amount,
    reason: orderNumber ? `بيع طلب #${orderNumber}` : 'بيع كاش',
    actor,
    orderId,
    orderNumber,
  });
  return shiftDocId;
}

export async function recordCashWithdrawalInTransaction(tx, uid, { amount, reason, actor, shiftId, expenseId, shiftSnap }) {
  if (!(Number(amount) > 0)) return null;
  let shiftDocId = shiftId;
  let snap = shiftSnap;
  if (!snap) {
    const ctx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
    if (!ctx) return null;
    shiftDocId = ctx.shiftId;
    snap = ctx.shiftSnap;
  }
  await appendMovementInTx(tx, uid, shiftDocId, snap, {
    type: 'withdrawal',
    amount,
    reason: reason || 'سحب من الصندوق',
    actor,
    expenseId,
  });
  return shiftDocId;
}

export async function recordCashRefundInTransaction(tx, uid, { amount, orderId, orderNumber, actor, shiftId, shiftSnap }) {
  if (!(Number(amount) > 0)) return null;
  let shiftDocId = shiftId;
  let snap = shiftSnap;
  if (!snap) {
    const ctx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
    if (!ctx) return null;
    shiftDocId = ctx.shiftId;
    snap = ctx.shiftSnap;
  }
  await appendMovementInTx(tx, uid, shiftDocId, snap, {
    type: 'refund',
    amount,
    reason: orderNumber ? `مرتجع طلب #${orderNumber}` : 'مرتجع كاش',
    actor,
    orderId,
    orderNumber,
  });
  return shiftDocId;
}

export async function recordCashDepositInTransaction(tx, uid, { amount, reason, actor, shiftId, shiftSnap }) {
  if (!(Number(amount) > 0)) return null;
  let shiftDocId = shiftId;
  let snap = shiftSnap;
  if (!snap) {
    const ctx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
    if (!ctx) return null;
    shiftDocId = ctx.shiftId;
    snap = ctx.shiftSnap;
  }
  await appendMovementInTx(tx, uid, shiftDocId, snap, {
    type: 'deposit',
    amount,
    reason: reason || 'إيداع في الصندوق',
    actor,
  });
  return shiftDocId;
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
    await recordCashDepositInTransaction(tx, uid, {
      amount,
      reason,
      actor,
      shiftId,
      shiftSnap: snap,
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

  let meta = { shiftId, shiftPeriod: 1, closedAtMs: Date.now() };

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
    const period = Number(shift.shiftPeriod) === 2 ? 2 : 1;
    const vaultLabel = period === 2 ? 'إغلاق الشفت النهائي — للخزنة' : 'إغلاق الشفت الأول — للخزنة';
    let finalWithdrawals = Number(shift.cashWithdrawals) || 0;
    let finalExpected = expected;

    const vRef = vaultDocRef(uid);
    const vSnap = closingWithdrawal > 0 ? await tx.get(vRef) : null;

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
        reason: vaultLabel,
        employeeId: actor?.role || null,
        createdBy: actor || null,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        isClosingWithdrawal: true,
        toVault: true,
      });

      applyVaultCredit(tx, uid, vSnap, {
        amount: closingWithdrawal,
        type: 'from_cash_close',
        reason: vaultLabel,
        actor,
        shiftId,
      });
    }

    if (actual > expected + 0.001) {
      // إبقاء الفرق كـ over — لا إيداع تلقائي بدون تأكيد صريح
    }

    const difference = Math.round((actual - finalExpected) * 100) / 100;
    const closedAtMs = Date.now();
    const workedSnapshot = buildWorkedStaffSnapshot({ ...shift, onDutyStaffRoster: shift.onDutyStaffRoster });
    meta = { shiftId, shiftPeriod: period, closedAtMs };
    tx.update(sRef, {
      status: 'closed',
      cashWithdrawals: finalWithdrawals,
      expectedClosingBalance: finalExpected,
      actualClosingBalance: actual,
      vaultTransferOnClose: closingWithdrawal,
      difference,
      closingNotes: String(notes || '').trim(),
      closedAt: serverTimestamp(),
      closedAtMs,
      closedBy: actor || null,
      onDutyStaffWorkedSnapshot: workedSnapshot,
      dutyClosedAtMs: closedAtMs,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    });
  });
  return meta;
}
