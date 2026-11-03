const admin = require('firebase-admin');
const { roundMoney } = require('./productPricing');
const { appendCashMovementInTx, shiftSnapFromDoc, getOpenShiftDocInTx } = require('./cashShiftEngine');
const { docExists } = require('./inventoryLayerEngine');

function serverTimestamp(db) {
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

const PAYROLL_STATUS_DUE = 'due';
const PAYROLL_STATUS_PARTIAL = 'partial';
const PAYROLL_STATUS_PAID = 'paid';

async function createPayrollAccrual(db, uid, data, { actor }) {
  const amt = roundMoney(data.amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغ الراتب');
  if (!data.staffMemberId) throw new Error('اختر الموظف');

  const ref = db.collection(`users/${uid}/payrollAccruals`).doc();
  await ref.set({
    staffMemberId: data.staffMemberId,
    staffName: String(data.staffName || '').trim(),
    amountDue: amt,
    amountPaid: 0,
    baseSalary: roundMoney(data.baseSalary ?? data.amount),
    periodLabel: String(data.periodLabel || '').trim() || 'راتب',
    periodStartMs: data.periodStartMs || null,
    periodEndMs: data.periodEndMs || null,
    dueDate: data.dueDate || new Date(),
    status: PAYROLL_STATUS_DUE,
    createdBy: actor || null,
    createdAt: serverTimestamp(db),
    createdAtMs: Date.now(),
  });
  return { accrualId: ref.id };
}

async function recordPayrollPayment(db, uid, data, { actor }) {
  const pay = roundMoney(data.amount);
  if (!(pay > 0)) throw new Error('أدخل مبلغ الدفعة');
  const idemKey = String(data.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/payroll_${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (docExists(idemSnap)) return { ...idemSnap.data(), duplicate: true };
    }

    const aRef = db.doc(`users/${uid}/payrollAccruals/${data.accrualId}`);
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists) throw new Error('سجل الراتب غير موجود');
    const acc = aSnap.data();
    const remaining = roundMoney((Number(acc.amountDue) || 0) - (Number(acc.amountPaid) || 0));
    if (pay > remaining + 0.009) throw new Error(`المتبقي على الراتب ${remaining} ₪ فقط`);

    const advanceDeduction = roundMoney(data.advanceDeduction || 0);
    const cashOut = roundMoney(Math.max(0, pay - advanceDeduction));

    const newPaid = roundMoney((Number(acc.amountPaid) || 0) + pay);
    const newStatus =
      newPaid >= (Number(acc.amountDue) || 0) - 0.009 ? PAYROLL_STATUS_PAID : PAYROLL_STATUS_PARTIAL;

    const paymentMethod = String(data.paymentMethod || 'Cash');
    let shiftSnap = null;
    if (cashOut > 0 && paymentMethod === 'Cash') {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, data.shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل دفع الراتب');
      shiftSnap = shiftSnapFromDoc(openDoc);
    }

    const expenseRef = db.collection(`users/${uid}/expenses`).doc();
    tx.set(expenseRef, {
      amount: pay,
      date: new Date(),
      category: 'Salaries',
      section: 'operating',
      description: `راتب — ${acc.staffName || ''} (${acc.periodLabel || ''})`,
      staffMemberId: acc.staffMemberId,
      payrollAccrualId: data.accrualId,
      paymentMethod,
      cashComponent: cashOut,
      advanceDeduction,
      notes: String(data.note || '').trim(),
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
      createdBy: actor || null,
    });

    const pRef = db.collection(`users/${uid}/payrollPayments`).doc();
    tx.set(pRef, {
      accrualId: data.accrualId,
      staffMemberId: acc.staffMemberId,
      amount: pay,
      cashComponent: cashOut,
      advanceDeduction,
      expenseId: expenseRef.id,
      paymentMethod,
      shiftId: shiftSnap?.id || data.shiftId || null,
      createdBy: actor || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });

    if (shiftSnap && cashOut > 0 && paymentMethod === 'Cash') {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'withdrawal',
        amount: cashOut,
        reason: `راتب — ${acc.staffName || ''}`,
        actor,
        expenseId: expenseRef.id,
      });
    }

    tx.update(aRef, {
      amountPaid: newPaid,
      status: newStatus,
      updatedAt: serverTimestamp(db),
      updatedAtMs: Date.now(),
    });

    const result = { duplicate: false, expenseId: expenseRef.id, paymentId: pRef.id, status: newStatus };
    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/payroll_${idemKey}`), {
        ...result,
        createdAtMs: Date.now(),
      });
    }
    return result;
  });
}

async function recordEmployeeAdvance(db, uid, data, { actor }) {
  const amt = roundMoney(data.amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغ السلفة');
  if (!data.staffMemberId) throw new Error('اختر الموظف');
  const idemKey = String(data.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/advance_${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (docExists(idemSnap)) return { duplicate: true, advanceId: idemSnap.data().advanceId };
    }

    const paymentMethod = String(data.paymentMethod || 'Cash');
    let shiftSnap = null;
    if (paymentMethod === 'Cash') {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, data.shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل السلفة');
      shiftSnap = shiftSnapFromDoc(openDoc);
    }

    const advRef = db.collection(`users/${uid}/employeeAdvances`).doc();
    const expenseRef = db.collection(`users/${uid}/expenses`).doc();
    tx.set(advRef, {
      staffMemberId: data.staffMemberId,
      staffName: String(data.staffName || '').trim(),
      amount: amt,
      balanceRemaining: amt,
      status: 'open',
      notes: String(data.note || '').trim(),
      createdBy: actor || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });
    tx.set(expenseRef, {
      amount: amt,
      date: new Date(),
      category: 'Advance',
      section: 'operating',
      description: `سلفة — ${data.staffName || ''}`,
      staffMemberId: data.staffMemberId,
      employeeAdvanceId: advRef.id,
      paymentMethod,
      notes: String(data.note || '').trim(),
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
      createdBy: actor || null,
    });

    if (shiftSnap && paymentMethod === 'Cash') {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'withdrawal',
        amount: amt,
        reason: `سلفة — ${data.staffName || ''}`,
        actor,
        expenseId: expenseRef.id,
      });
    }

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/advance_${idemKey}`), {
        advanceId: advRef.id,
        createdAtMs: Date.now(),
      });
    }
    return { duplicate: false, advanceId: advRef.id, expenseId: expenseRef.id };
  });
}

async function recordAdvanceRepayment(db, uid, data, { actor }) {
  const pay = roundMoney(data.amount);
  if (!(pay > 0)) throw new Error('أدخل مبلغ التسديد');
  const idemKey = String(data.idempotencyKey || '').trim();
  const method = String(data.paymentMethod || 'Cash');

  return db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/advance_repay_${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (docExists(idemSnap)) return { ...idemSnap.data(), duplicate: true };
    }

    const advRef = db.doc(`users/${uid}/employeeAdvances/${data.advanceId}`);
    const advSnap = await tx.get(advRef);
    if (!advSnap.exists) throw new Error('سجل السلفة غير موجود');
    const adv = advSnap.data();
    const rem = roundMoney(Number(adv.balanceRemaining) || 0);
    if (pay > rem + 0.009) throw new Error(`المتبقي على السلفة ${rem} ₪ فقط`);

    let shiftSnap = null;
    if (method === 'Cash') {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, data.shiftId || null);
      if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل التسديد');
      shiftSnap = shiftSnapFromDoc(openDoc);
    }

    const nextRem = roundMoney(rem - pay);
    const repayRef = db.collection(`users/${uid}/advanceRepayments`).doc();
    const expenseRef = db.collection(`users/${uid}/expenses`).doc();

    tx.set(repayRef, {
      advanceId: data.advanceId,
      staffMemberId: adv.staffMemberId,
      amount: pay,
      paymentMethod: method,
      payrollAccrualId: data.payrollAccrualId || null,
      notes: String(data.note || '').trim(),
      createdBy: actor || null,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });

    if (method !== 'payroll_deduct') {
      tx.set(expenseRef, {
        amount: pay,
        date: new Date(),
        category: 'Advance',
        section: 'operating',
        description: `تسديد سلفة — ${adv.staffName || ''}`,
        staffMemberId: adv.staffMemberId,
        employeeAdvanceId: data.advanceId,
        advanceRepaymentId: repayRef.id,
        paymentMethod: method,
        notes: String(data.note || '').trim(),
        isAdvanceRepayment: true,
        createdAt: serverTimestamp(db),
        createdAtMs: Date.now(),
        createdBy: actor || null,
      });
    }

    if (shiftSnap && method === 'Cash') {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'deposit',
        amount: pay,
        reason: `تسديد سلفة — ${adv.staffName || ''}`,
        actor,
        expenseId: expenseRef.id,
      });
    }

    tx.update(advRef, {
      balanceRemaining: nextRem,
      status: nextRem <= 0.009 ? 'closed' : 'open',
      updatedAt: serverTimestamp(db),
    });

    const result = {
      duplicate: false,
      repaymentId: repayRef.id,
      expenseId: method !== 'payroll_deduct' ? expenseRef.id : null,
      balanceRemaining: nextRem,
    };
    if (idemKey) {
      tx.set(db.doc(`users/${uid}/idempotency/advance_repay_${idemKey}`), {
        ...result,
        createdAtMs: Date.now(),
      });
    }
    return result;
  });
}

module.exports = {
  createPayrollAccrual,
  recordPayrollPayment,
  recordEmployeeAdvance,
  recordAdvanceRepayment,
};
