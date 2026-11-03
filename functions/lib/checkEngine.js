const { roundMoney } = require('./productPricing');
const { appendCashMovementInTx, shiftSnapFromDoc, getOpenShiftDocInTx } = require('./cashShiftEngine');

function serverTimestamp(db) {
  const admin = require('firebase-admin');
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

const CHECK_PENDING = 'pending_collection';
const CHECK_COLLECTED = 'collected';
const CHECK_PAID_OUT = 'paid_out';
const CHECK_RETURNED = 'returned';

async function registerCheck(db, uid, input, { actor }) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error('أدخل مبلغ الشيك');
  const idemKey = String(input.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/check_${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) return { duplicate: true, checkId: idemSnap.data().checkId };
    }

    const ref = db.collection(`users/${uid}/checks`).doc();
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
      statusHistory: [
        { status: CHECK_PENDING, atMs: Date.now(), by: actor || null, note: 'registered' },
      ],
      createdBy: actor || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/check_${idemKey}`), {
        checkId: ref.id,
        createdAtMs: Date.now(),
      });
    }
    return { duplicate: false, checkId: ref.id };
  });
}

async function collectCheck(db, uid, checkId, { actor, shiftId }) {
  const ref = db.doc(`users/${uid}/checks/${checkId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('الشيك غير موجود');
    const data = snap.data();
    if (data.status === CHECK_COLLECTED || data.status === CHECK_PAID_OUT) {
      throw new Error('تم تنفيذ الشيك مسبقاً');
    }
    if (data.status === CHECK_RETURNED) throw new Error('الشيك مرتجع — لا يمكن تنفيذه');

    const amount = roundMoney(data.amount);
    const directionIn = (data.direction || 'in') === 'in';
    let shiftSnap = null;
    if (amount > 0) {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل حركة الشيك');
      shiftSnap = shiftSnapFromDoc(openDoc);
    }

    const label = data.checkNumber ? `شيك ${data.checkNumber}` : 'شيك';
    if (shiftSnap && amount > 0) {
      if (directionIn) {
        appendCashMovementInTx(tx, db, uid, shiftSnap, {
          type: 'deposit',
          amount,
          reason: `تحصيل ${label}`,
          actor,
        });
      } else {
        appendCashMovementInTx(tx, db, uid, shiftSnap, {
          type: 'withdrawal',
          amount,
          reason: `صرف ${label}`,
          actor,
        });
      }
    }

    const nextStatus = directionIn ? CHECK_COLLECTED : CHECK_PAID_OUT;
    const history = [...(data.statusHistory || []), { status: nextStatus, atMs: Date.now(), by: actor || null }];

    tx.update(ref, {
      status: nextStatus,
      collectedAtMs: Date.now(),
      collectedBy: actor || null,
      shiftId: shiftSnap?.id || shiftId || null,
      statusHistory: history,
      updatedAt: serverTimestamp(db),
    });
    return { ok: true, status: nextStatus };
  });
}

async function returnCheck(db, uid, checkId, { actor, reason, shiftId }) {
  const ref = db.doc(`users/${uid}/checks/${checkId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('الشيك غير موجود');
    const data = snap.data();
    if (data.status === CHECK_RETURNED) throw new Error('تم إرجاع الشيك مسبقاً');

    let shiftSnap = null;
    const amount = roundMoney(data.amount);
    if (
      amount > 0 &&
      (data.status === CHECK_COLLECTED || data.status === CHECK_PAID_OUT)
    ) {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لعكس حركة الشيك');
      shiftSnap = shiftSnapFromDoc(openDoc);
      const directionIn = (data.direction || 'in') === 'in';
      if (directionIn) {
        appendCashMovementInTx(tx, db, uid, shiftSnap, {
          type: 'withdrawal',
          amount,
          reason: `إرجاع شيك محصّل ${data.checkNumber || ''}`,
          actor,
        });
      } else {
        appendCashMovementInTx(tx, db, uid, shiftSnap, {
          type: 'deposit',
          amount,
          reason: `إرجاع شيك مصروف ${data.checkNumber || ''}`,
          actor,
        });
      }
    }

    const history = [
      ...(data.statusHistory || []),
      { status: CHECK_RETURNED, atMs: Date.now(), by: actor || null, note: String(reason || '').trim() },
    ];

    tx.update(ref, {
      status: CHECK_RETURNED,
      returnedAtMs: Date.now(),
      returnReason: String(reason || '').trim(),
      returnedBy: actor || null,
      statusHistory: history,
      updatedAt: serverTimestamp(db),
    });
    return { ok: true };
  });
}

module.exports = {
  registerCheck,
  collectCheck,
  returnCheck,
  CHECK_PENDING,
  CHECK_COLLECTED,
  CHECK_PAID_OUT,
  CHECK_RETURNED,
};
