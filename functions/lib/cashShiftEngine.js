const admin = require('firebase-admin');
const { computeExpectedCash } = require('./cashShiftMath');
const { applyVaultCreditInTx, roundMoney } = require('./vaultAccounting');

function buildWorkedStaffSnapshot(shift) {
  if (Array.isArray(shift?.onDutyStaffWorkedSnapshot) && shift.onDutyStaffWorkedSnapshot.length > 0) {
    return shift.onDutyStaffWorkedSnapshot;
  }
  const byId = new Map();
  for (const e of shift?.onDutyStaffRoster || []) {
    if (!e?.staffId) continue;
    byId.set(e.staffId, { staffId: e.staffId, name: e.nameSnapshot || '—' });
  }
  if (byId.size === 0) {
    for (const id of shift?.onDutyStaffIds || []) {
      if (id) byId.set(id, { staffId: id, name: '—' });
    }
  }
  return [...byId.values()];
}

function buildOnDutyRosterInitial(staffIds, actor, rosterFromClient) {
  if (Array.isArray(rosterFromClient) && rosterFromClient.length > 0) return rosterFromClient;
  const atMs = Date.now();
  return staffIds.map((staffId) => ({
    staffId,
    nameSnapshot: '—',
    addedAtMs: atMs,
    addedBy: actor || null,
    source: 'shift_open',
    removedAtMs: null,
    removedBy: null,
  }));
}

function serverTimestamp(db) {
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

function shiftSnapFromDoc(doc) {
  return {
    exists: doc.exists,
    data: () => doc.data(),
    id: doc.id,
    ref: doc.ref,
  };
}

/**
 * Append cash movement and update shift aggregates (open shift only).
 * @param shiftSnap — { exists, data(), id, ref } from Firestore doc
 */
function appendCashMovementInTx(tx, db, uid, shiftSnap, {
  type,
  amount,
  reason,
  actor,
  orderId,
  orderNumber,
  movementExtra = {},
}) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) return;
  if (!shiftSnap.exists) throw new Error('وردية الكاش غير موجودة');
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

  const mRef = db.collection(`users/${uid}/cashMovements`).doc();
  tx.set(mRef, {
    shiftId: shiftSnap.id,
    type,
    amount: amt,
    reason: String(reason || '').trim(),
    employeeId: actor?.role || null,
    createdBy: actor || null,
    orderId: orderId || null,
    orderNumber: orderNumber || null,
    createdAt: serverTimestamp(db),
    createdAtMs: Date.now(),
    ...movementExtra,
  });
  tx.update(shiftSnap.ref, {
    ...sums,
    expectedClosingBalance: expected,
    updatedAt: serverTimestamp(db),
    updatedAtMs: Date.now(),
  });
  return mRef.id;
}

function docExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists);
}

async function getOpenShiftDocInTx(tx, db, uid, preferredShiftId = null) {
  if (preferredShiftId) {
    const ref = db.doc(`users/${uid}/cashShifts/${preferredShiftId}`);
    const doc = await tx.get(ref);
    if (docExists(doc) && doc.data().status === 'open') return doc;
    return null;
  }
  const q = db.collection(`users/${uid}/cashShifts`).where('status', '==', 'open').limit(1);
  const snap = await tx.get(q);
  if (snap.empty) return null;
  return snap.docs[0];
}

async function executeOpenCashShift(db, uid, payload, { actor }) {
  const rawOpening = Number(payload.openingBalance);
  if (!Number.isFinite(rawOpening) || rawOpening < 0) throw new Error('رصيد فتح غير صالح');
  const opening = roundMoney(rawOpening);
  const rawExpected = payload.expectedOpeningBalance;
  const expected =
    rawExpected !== undefined && rawExpected !== null
      ? roundMoney(Math.max(0, Number(rawExpected) || 0))
      : opening;
  const openingDifference = roundMoney(opening - expected);
  const duty = Array.isArray(payload.onDutyStaffIds)
    ? [...new Set(payload.onDutyStaffIds.filter(Boolean))]
    : [];
  if (duty.length === 0) throw new Error('اختر موظفاً واحداً على الأقل مداوماً في الشفت');
  const notes = String(payload.notes || '').trim();
  const period = Number(payload.shiftPeriod) === 2 ? 2 : 1;
  const operatorName = String(payload.operatorName || '').trim();
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  const roster = buildOnDutyRosterInitial(duty, actor, payload.onDutyStaffRoster);

  let result = null;

  await db.runTransaction(async (tx) => {
    if (idempotencyKey) {
      const idemRef = db.doc(`users/${uid}/cashShiftIdempotency/${idempotencyKey}`);
      const idem = await tx.get(idemRef);
      if (idem.exists && idem.data().shiftId) {
        result = { shiftId: idem.data().shiftId, duplicate: true };
        return;
      }
    }

    const openDoc = await getOpenShiftDocInTx(tx, db, uid);
    if (openDoc) throw new Error('يوجد وردية كاش مفتوحة بالفعل — أغلقها أولاً');

    const nowMs = Date.now();
    const ref = db.collection(`users/${uid}/cashShifts`).doc();
    tx.set(ref, {
      status: 'open',
      shiftPeriod: period,
      operatorName,
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
      notes,
      openedAt: serverTimestamp(db),
      openedAtMs: nowMs,
      openedBy: actor || null,
      employeeId: actor?.role || null,
      closedAt: null,
      closedAtMs: null,
      closedBy: null,
    });

    if (idempotencyKey) {
      tx.set(db.doc(`users/${uid}/cashShiftIdempotency/${idempotencyKey}`), {
        op: 'open',
        shiftId: ref.id,
        createdAtMs: nowMs,
      });
    }

    result = { shiftId: ref.id, duplicate: false };
  });

  return result;
}

async function executeCloseCashShift(db, uid, { shiftId, actualClosingBalance, notes = '' }, { actor }) {
  const sid = String(shiftId || '').trim();
  if (!sid) throw new Error('معرّف الوردية مطلوب');
  const actual = Math.max(0, Number(actualClosingBalance));
  if (!Number.isFinite(actual)) throw new Error('أدخل المبلغ الفعلي في الصندوق');

  let meta = { shiftId: sid, shiftPeriod: 1, closedAtMs: Date.now(), closed: true };

  await db.runTransaction(async (tx) => {
    const sRef = db.doc(`users/${uid}/cashShifts/${sid}`);
    const snap = await tx.get(sRef);
    if (!snap.exists) throw new Error('وردية الكاش غير موجودة');
    const shift = snap.data();
    if (shift.status !== 'open') throw new Error('تم إغلاق هذه الوردية مسبقاً');

    const expected = computeExpectedCash({
      openingBalance: shift.openingBalance,
      cashSales: shift.cashSales,
      cashDeposits: shift.cashDeposits,
      cashWithdrawals: shift.cashWithdrawals,
      cashRefunds: shift.cashRefunds,
    });

    const closingWithdrawal = roundMoney(Math.max(0, expected - actual));
    const period = Number(shift.shiftPeriod) === 2 ? 2 : 1;
    const vaultLabel = period === 2 ? 'إغلاق الشفت النهائي — للخزنة' : 'إغلاق الشفت الأول — للخزنة';

    const vRef = db.doc(`users/${uid}/vault/main`);
    const vSnap = closingWithdrawal > 0 ? await tx.get(vRef) : null;

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

      appendCashMovementInTx(tx, db, uid, shiftSnapFromDoc(snap), {
        type: 'withdrawal',
        amount: closingWithdrawal,
        reason: vaultLabel,
        actor,
        movementExtra: { isClosingWithdrawal: true, toVault: true },
      });

      applyVaultCreditInTx(tx, db, uid, vSnap, {
        amount: closingWithdrawal,
        type: 'from_cash_close',
        reason: vaultLabel,
        actor,
        shiftId: sid,
      });
    }

    const difference = roundMoney(actual - finalExpected);
    const closedAtMs = Date.now();
    const workedSnapshot = buildWorkedStaffSnapshot(shift);
    meta = { shiftId: sid, shiftPeriod: period, closedAtMs, closed: true };
    tx.update(sRef, {
      status: 'closed',
      cashWithdrawals: finalWithdrawals,
      expectedClosingBalance: finalExpected,
      actualClosingBalance: actual,
      vaultTransferOnClose: closingWithdrawal,
      difference,
      closingNotes: String(notes || '').trim(),
      closedAt: serverTimestamp(db),
      closedAtMs,
      closedBy: actor || null,
      onDutyStaffWorkedSnapshot: workedSnapshot,
      dutyClosedAtMs: closedAtMs,
      updatedAt: serverTimestamp(db),
      updatedAtMs: Date.now(),
    });
  });

  return meta;
}

async function executeCashShiftMovement(
  db,
  uid,
  { shiftId, type, amount, reason, idempotencyKey },
  { actor }
) {
  const movementType = String(type || '').trim();
  if (movementType !== 'deposit' && movementType !== 'withdrawal') {
    throw new Error('نوع حركة غير مدعوم');
  }
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');
  const sid = String(shiftId || '').trim();
  if (!sid) throw new Error('معرّف الوردية مطلوب');
  const idemKey = String(idempotencyKey || '').trim();

  let movementId = null;
  let duplicate = false;

  await db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/cashShiftIdempotency/${idemKey}`);
      const idem = await tx.get(idemRef);
      if (idem.exists && idem.data().movementId) {
        movementId = idem.data().movementId;
        duplicate = true;
        return;
      }
    }

    const sRef = db.doc(`users/${uid}/cashShifts/${sid}`);
    const snap = await tx.get(sRef);
    movementId = appendCashMovementInTx(tx, db, uid, shiftSnapFromDoc(snap), {
      type: movementType,
      amount: amt,
      reason: reason || (movementType === 'deposit' ? 'إيداع في الصندوق' : 'سحب من الصندوق'),
      actor,
    });

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/cashShiftIdempotency/${idemKey}`), {
        op: 'movement',
        movementId,
        shiftId: sid,
        createdAtMs: Date.now(),
      });
    }
  });

  return { movementId, duplicate };
}

module.exports = {
  appendCashMovementInTx,
  shiftSnapFromDoc,
  getOpenShiftDocInTx,
  executeOpenCashShift,
  executeCloseCashShift,
  executeCashShiftMovement,
};
