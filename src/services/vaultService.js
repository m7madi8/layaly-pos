import {
  db,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from '../firebaseClient';
import { closeVaultMovementId } from '../utils/vaultCloseIds';

export const vaultDocRef = (uid) => doc(db, 'users', uid, 'vault', 'main');
const vaultMovementsCol = (uid) => collection(db, 'users', uid, 'vaultMovements');

export function vaultCloseMovementRef(uid, shiftId) {
  const movId = closeVaultMovementId(shiftId);
  return movId ? doc(vaultMovementsCol(uid), movId) : null;
}

/** داخل transaction بعد tx.get(vaultDocRef) — إغلاق الشفت يستخدم معرّف حركة حتمي. */
export function applyVaultCredit(tx, uid, vaultSnap, { amount, type, reason, actor, shiftId = null }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return;

  const vRef = vaultDocRef(uid);
  const exists = vaultSnap && typeof vaultSnap.exists === 'function' ? vaultSnap.exists() : Boolean(vaultSnap?.exists);
  const prev = exists ? Number(vaultSnap.data().balance) || 0 : 0;
  const totalCapitalIn = exists ? Number(vaultSnap.data().totalCapitalIn) || 0 : 0;
  const capitalAdd = type === 'capital' ? amt : 0;
  const isShiftClose = type === 'from_cash_close' && shiftId;
  const movId = isShiftClose ? closeVaultMovementId(shiftId) : null;

  const vaultPatch = {
    balance: Math.round((prev + amt) * 100) / 100,
    totalCapitalIn: Math.round((totalCapitalIn + capitalAdd) * 100) / 100,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  };

  if (isShiftClose) {
    vaultPatch.lastVaultCloseShiftId = String(shiftId);
    vaultPatch.lastVaultCloseAmount = amt;
    vaultPatch.lastVaultCloseMovementId = movId;
  }

  tx.set(vRef, vaultPatch, { merge: true });

  const mRef = isShiftClose ? doc(vaultMovementsCol(uid), movId) : doc(vaultMovementsCol(uid));
  tx.set(mRef, {
    type,
    amount: amt,
    reason: String(reason || '').trim(),
    shiftId: shiftId || null,
    createdBy: actor || null,
    employeeId: actor?.role || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

export async function addVaultCapital(uid, { amount, note, actor }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) throw new Error('أدخل مبلغ رأس المال أكبر من صفر');

  await runTransaction(db, async (tx) => {
    const vRef = vaultDocRef(uid);
    const snap = await tx.get(vRef);
    applyVaultCredit(tx, uid, snap, {
      amount: amt,
      type: 'capital',
      reason: note || 'إضافة رأس مال للخزنة',
      actor,
    });
  });
}

export async function withdrawFromVault(uid, { amount, reason, actor, idempotencyKey }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) throw new Error('أدخل مبلغ السحب أكبر من صفر');

  const idemKey = String(idempotencyKey || '').trim();
  const reasonText = String(reason || '').trim() || 'سحب من الخزنة';

  return runTransaction(db, async (tx) => {
    if (idemKey) {
      const idemRef = doc(collection(db, 'users', uid, 'vaultWithdrawIdempotency'), idemKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        return { ok: true, duplicate: true, amount: idemSnap.data().amount };
      }
    }

    const vRef = vaultDocRef(uid);
    const snap = await tx.get(vRef);
    applyVaultDebit(tx, uid, snap, {
      amount: amt,
      type: 'safe_withdrawal',
      reason: reasonText,
      actor,
    });

    if (idemKey) {
      const idemRef = doc(collection(db, 'users', uid, 'vaultWithdrawIdempotency'), idemKey);
      tx.set(idemRef, {
        amount: amt,
        reason: reasonText,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
    }

    return { ok: true, duplicate: false, amount: amt };
  });
}

export async function depositVaultManual(uid, { amount, note, actor }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');

  await runTransaction(db, async (tx) => {
    const vRef = vaultDocRef(uid);
    const snap = await tx.get(vRef);
    applyVaultCredit(tx, uid, snap, {
      amount: amt,
      type: 'deposit',
      reason: note || 'إيداع نقدي في الخزنة',
      actor,
    });
  });
}

/** سحب من الخزنة داخل transaction (بعد tx.get على vault) */
export function applyVaultDebit(tx, uid, vaultSnap, { amount, type, reason, actor, expenseId = null }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return;

  const vRef = vaultDocRef(uid);
  const exists = vaultSnap && typeof vaultSnap.exists === 'function' ? vaultSnap.exists() : Boolean(vaultSnap?.exists);
  const prev = exists ? Number(vaultSnap.data().balance) || 0 : 0;
  if (prev < amt - 0.001) {
    throw new Error(`رصيد الخزنة غير كافٍ (المتاح ${prev} ₪)`);
  }

  tx.set(
    vRef,
    {
      balance: Math.round((prev - amt) * 100) / 100,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );

  const mRef = doc(vaultMovementsCol(uid));
  tx.set(mRef, {
    type: type || 'withdrawal',
    amount: amt,
    reason: String(reason || '').trim(),
    expenseId: expenseId || null,
    shiftId: null,
    createdBy: actor || null,
    employeeId: actor?.role || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}
