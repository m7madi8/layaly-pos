const { roundMoney } = require('./productPricing');

async function recordEmployeePosDebtInTx(
  tx,
  db,
  uid,
  { staffMemberId, staffName, orderId, orderNumber, amount, itemsSummary, actor }
) {
  const amt = roundMoney(amount);
  const sid = String(staffMemberId || '').trim();
  if (!sid || !(amt > 0) || !orderId) return null;

  const idemKey = `pos_debt_${orderId}`;
  const idemRef = db.doc(`users/${uid}/employeePosDebtIdempotency/${idemKey}`);
  const idemSnap = await tx.get(idemRef);
  if (idemSnap.exists) {
    return { posDebtId: idemSnap.data().posDebtId, duplicate: true };
  }

  const debtRef = db.collection(`users/${uid}/employeePosDebts`).doc();
  tx.set(debtRef, {
    staffMemberId: sid,
    staffName: String(staffName || '').trim(),
    orderId: String(orderId),
    orderNumber: String(orderNumber || ''),
    amount: amt,
    amountRepaid: 0,
    status: 'open',
    itemsSummary: String(itemsSummary || '').slice(0, 500),
    createdAtMs: Date.now(),
    recordedBy: actor || null,
  });
  tx.set(idemRef, { posDebtId: debtRef.id, orderId, amount: amt, createdAtMs: Date.now() });
  return { posDebtId: debtRef.id, duplicate: false };
}

async function cancelEmployeePosDebtForOrderInTx(tx, db, uid, orderId, { actor, reason }) {
  const oid = String(orderId || '').trim();
  if (!oid) return;
  const q = db.collection(`users/${uid}/employeePosDebts`).where('orderId', '==', oid);
  const snap = await tx.get(q);
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.status === 'cancelled') return;
    tx.update(d.ref, {
      status: 'cancelled',
      cancelReason: String(reason || 'إلغاء طلب').trim(),
      cancelledAtMs: Date.now(),
      cancelledBy: actor || null,
    });
  });
}

module.exports = {
  recordEmployeePosDebtInTx,
  cancelEmployeePosDebtForOrderInTx,
};
