const { roundMoney } = require('./productPricing');

function serverTimestamp(db) {
  const admin = require('firebase-admin');
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

async function recordSupplierOpeningBalance(db, uid, supplierId, input, { actor }) {
  const amt = roundMoney(Math.abs(Number(input.amount) || 0));
  if (!(amt > 0)) throw new Error('أدخل مبلغ الرصيد');
  if (!supplierId) throw new Error('اختر التاجر');
  const nature = input.nature === 'receivable' ? 'receivable' : 'payable';
  const signed = nature === 'receivable' ? -amt : amt;
  const idemKey = String(input.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    const sRef = db.doc(`users/${uid}/suppliers/${supplierId}`);
    const snap = await tx.get(sRef);
    if (!snap.exists) throw new Error('التاجر غير موجود');
    if (snap.data().openingBalanceRecorded && !input.forceReplace) {
      throw new Error('تم تسجيل رصيد افتتاحي لهذا التاجر — لا يمكن التكرار');
    }

    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/opening_bal_${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) return { duplicate: true, openingBalanceId: idemSnap.data().openingBalanceId };
    }

    const prev = roundMoney(snap.data().balance);
    const obRef = db.collection(`users/${uid}/supplierOpeningBalances`).doc();

    tx.update(sRef, {
      balance: roundMoney(prev + signed),
      openingBalanceRecorded: true,
      openingBalanceAmount: signed,
      openingBalanceNature: nature,
      updatedAt: serverTimestamp(db),
    });

    tx.set(obRef, {
      supplierId,
      amount: signed,
      nature,
      note: String(input.note || '').trim(),
      asOfDateMs: input.asOfDateMs || Date.now(),
      createdBy: actor || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/opening_bal_${idemKey}`), {
        openingBalanceId: obRef.id,
        createdAtMs: Date.now(),
      });
    }

    return { duplicate: false, openingBalanceId: obRef.id };
  });
}

module.exports = { recordSupplierOpeningBalance };
