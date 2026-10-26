const admin = require('firebase-admin');

function serverTimestamp(db) {
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Mirror client `applyVaultCredit` — call only after tx.get(vault ref). */
function applyVaultCreditInTx(tx, db, uid, vaultSnap, { amount, type, reason, actor, shiftId = null }) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) return;

  const vRef = db.doc(`users/${uid}/vault/main`);
  const exists = vaultSnap && vaultSnap.exists;
  const prev = exists ? Number(vaultSnap.data().balance) || 0 : 0;
  const totalCapitalIn = exists ? Number(vaultSnap.data().totalCapitalIn) || 0 : 0;
  const capitalAdd = type === 'capital' ? amt : 0;

  tx.set(
    vRef,
    {
      balance: roundMoney(prev + amt),
      totalCapitalIn: roundMoney(totalCapitalIn + capitalAdd),
      updatedAt: serverTimestamp(db),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );

  const mRef = db.collection(`users/${uid}/vaultMovements`).doc();
  tx.set(mRef, {
    type,
    amount: amt,
    reason: String(reason || '').trim(),
    shiftId: shiftId || null,
    createdBy: actor || null,
    employeeId: actor?.role || null,
    createdAt: serverTimestamp(db),
    createdAtMs: Date.now(),
  });
}

module.exports = { applyVaultCreditInTx, roundMoney };
