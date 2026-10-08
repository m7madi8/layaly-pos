import {
  db,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from '../firebaseClient';

export const vaultDocRef = (uid) => doc(db, 'users', uid, 'vault', 'main');
const vaultMovementsCol = (uid) => collection(db, 'users', uid, 'vaultMovements');

/** داخل transaction بعد tx.get(vaultDocRef) */
export function applyVaultCredit(tx, uid, vaultSnap, { amount, type, reason, actor, shiftId = null }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return;

  const vRef = vaultDocRef(uid);
  const exists = vaultSnap && typeof vaultSnap.exists === 'function' ? vaultSnap.exists() : Boolean(vaultSnap?.exists);
  const prev = exists ? Number(vaultSnap.data().balance) || 0 : 0;
  const totalCapitalIn = exists ? Number(vaultSnap.data().totalCapitalIn) || 0 : 0;
  const capitalAdd = type === 'capital' ? amt : 0;

  tx.set(
    vRef,
    {
      balance: Math.round((prev + amt) * 100) / 100,
      totalCapitalIn: Math.round((totalCapitalIn + capitalAdd) * 100) / 100,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );

  const mRef = doc(vaultMovementsCol(uid));
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
