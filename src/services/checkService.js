import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import { roundMoney } from '../utils/employeeBenefitAccounting';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';

const checksCol = (uid) => collection(db, 'users', uid, 'checks');

export const CHECK_PENDING = 'pending_collection';
export const CHECK_COLLECTED = 'collected';
export const CHECK_PAID_OUT = 'paid_out';
export const CHECK_RETURNED = 'returned';

export async function registerCheck(uid, input, { actor, idempotencyKey }) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('أدخل مبلغ الشيك');
  const idemKey = String(idempotencyKey || '').trim();
  const ref = doc(checksCol(uid));

  return runTransaction(db, async (tx) => {
    if (idemKey) {
      const prior = await tx.get(doc(db, 'users', uid, 'idempotency', `check_${idemKey}`));
      if (prior.exists()) return { duplicate: true, checkId: prior.data().checkId };
    }

    tx.set(ref, {
      checkNumber: String(input.checkNumber || '').trim(),
      bankName: String(input.bankName || '').trim(),
      amount,
      issueDateMs: input.issueDateMs || Date.now(),
      dueDateMs: input.dueDateMs || null,
      partyId: input.partyId || null,
      partyType: input.partyType || 'supplier',
      direction: input.direction === 'out' ? 'out' : 'in',
      notes: String(input.notes || '').trim(),
      status: CHECK_PENDING,
      statusHistory: [{ status: CHECK_PENDING, atMs: Date.now(), by: actor || null }],
      createdBy: actor || null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    if (idemKey) {
      tx.set(doc(db, 'users', uid, 'idempotency', `check_${idemKey}`), {
        checkId: ref.id,
        createdAtMs: Date.now(),
      });
    }
    return { duplicate: false, checkId: ref.id };
  });
}

export async function collectCheck(uid, checkId, { actor, shiftId }) {
  const ref = doc(checksCol(uid), checkId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الشيك غير موجود');
    const data = snap.data();
    if (data.status === CHECK_COLLECTED || data.status === CHECK_PAID_OUT) {
      throw new Error('تم تنفيذ الشيك مسبقاً');
    }
    if (data.status === CHECK_RETURNED) throw new Error('الشيك مرتجع — لا يمكن تنفيذه');

    const amount = roundMoney(data.amount);
    const directionIn = (data.direction || 'in') === 'in';
    let shiftCtx = null;
    if (amount > 0) {
      shiftCtx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
      if (!shiftCtx) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل حركة الشيك');
    }

    const label = data.checkNumber ? `شيك ${data.checkNumber}` : 'شيك';
    if (shiftCtx && amount > 0) {
      const type = directionIn ? 'deposit' : 'withdrawal';
      await appendCashMovementInTransaction(tx, uid, shiftCtx.shiftId, shiftCtx.shiftSnap, {
        type,
        amount,
        reason: directionIn ? `تحصيل ${label}` : `صرف ${label}`,
        actor,
      });
    }

    const nextStatus = directionIn ? CHECK_COLLECTED : CHECK_PAID_OUT;
    tx.update(ref, {
      status: nextStatus,
      collectedAtMs: Date.now(),
      collectedBy: actor || null,
      shiftId: shiftCtx?.shiftId || shiftId || null,
      statusHistory: [...(data.statusHistory || []), { status: nextStatus, atMs: Date.now(), by: actor || null }],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function returnCheck(uid, checkId, { actor, reason, shiftId }) {
  const ref = doc(checksCol(uid), checkId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الشيك غير موجود');
    const data = snap.data();
    if (data.status === CHECK_RETURNED) throw new Error('تم إرجاع الشيك مسبقاً');

    const amount = roundMoney(data.amount);
    if (amount > 0 && (data.status === CHECK_COLLECTED || data.status === CHECK_PAID_OUT)) {
      const shiftCtx = await readOpenCashShiftInTransaction(tx, uid, shiftId || data.shiftId || null);
      if (!shiftCtx) throw new Error('لا توجد وردية كاش مفتوحة لعكس حركة الشيك');
      const directionIn = (data.direction || 'in') === 'in';
      await appendCashMovementInTransaction(tx, uid, shiftCtx.shiftId, shiftCtx.shiftSnap, {
        type: directionIn ? 'withdrawal' : 'deposit',
        amount,
        reason: `إرجاع شيك ${data.checkNumber || ''}`,
        actor,
      });
    }

    tx.update(ref, {
      status: CHECK_RETURNED,
      returnedAtMs: Date.now(),
      returnReason: String(reason || '').trim(),
      returnedBy: actor || null,
      statusHistory: [
        ...(data.statusHistory || []),
        { status: CHECK_RETURNED, atMs: Date.now(), by: actor || null, note: String(reason || '').trim() },
      ],
      updatedAt: serverTimestamp(),
    });
  });
}
