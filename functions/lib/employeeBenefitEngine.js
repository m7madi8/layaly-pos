const admin = require('firebase-admin');
const {
  BENEFIT_TYPE_CASH,
  BENEFIT_TYPE_INVENTORY,
  BENEFIT_TYPE_PERSONAL,
  BENEFIT_STATUS_APPROVED,
  BENEFIT_STATUS_CANCELLED,
  buildBenefitReference,
  buildEmployeeBenefitExpenseFields,
  dailyUsageDocId,
  validateBenefitInput,
  assertBenefitPermission,
  roundMoney,
} = require('./employeeBenefitAccounting');
const { getProductType, stockUnitsForItem } = require('./productPricing');
const {
  consumeInventoryLayersFifo,
  restoreInventoryLayersLifo,
  legacyProductCogs,
  docExists,
  serverTimestamp,
} = require('./inventoryLayerEngine');
const { appendCashMovementInTx, shiftSnapFromDoc, getOpenShiftDocInTx } = require('./cashShiftEngine');
const { assertStaffOnDutyForShift } = require('./shiftOnDuty');

function collectIngredientIds(productDocs, lines) {
  const ids = new Set();
  for (const line of lines) {
    const pData = productDocs[line.productId]?.data;
    for (const ing of pData?.ingredients || []) {
      if (ing.ingredientId) ids.add(ing.ingredientId);
    }
  }
  return ids;
}

async function executeEmployeeBenefit(db, uid, input, { actor }) {
  assertBenefitPermission(actor, { allowOverride: input.override });
  const staffMemberId = String(input.staffMemberId || '').trim();
  if (!staffMemberId) throw new Error('اختر الموظف');

  const staffSnap = await db.doc(`users/${uid}/staffMembers/${staffMemberId}`).get();
  if (!staffSnap.exists) throw new Error('سجل الموظف غير موجود');
  const staffData = staffSnap.data();
  const staffMember = {
    id: staffMemberId,
    name: staffData.name,
    benefitLimitILS: staffData.benefitLimitILS,
    active: staffData.active,
  };

  const productIds = new Set(
    (input.inventoryLines || []).map((l) => String(l.productId || '').trim()).filter(Boolean)
  );
  const productsById = {};
  for (const pid of productIds) {
    const pSnap = await db.doc(`users/${uid}/products/${pid}`).get();
    if (!pSnap.exists) throw new Error('صنف غير موجود');
    productsById[pid] = { id: pid, ...pSnap.data() };
  }

  const payDate = input.dateMs ? new Date(Number(input.dateMs)) : new Date();
  if (Number.isNaN(payDate.getTime())) throw new Error('تاريخ غير صالح');

  const idemKey = String(input.idempotencyKey || '').trim();

  return db.runTransaction(async (tx) => {
    if (idemKey) {
      const idemRef = db.doc(`users/${uid}/employeeBenefitIdempotency/${idemKey}`);
      const idemSnap = await tx.get(idemRef);
      if (docExists(idemSnap)) {
        const data = idemSnap.data();
        return {
          benefitId: data.benefitId,
          expenseId: data.expenseId,
          benefitRef: data.benefitNumber,
          cashRecorded: Boolean(data.cashRecorded),
          duplicate: true,
        };
      }
    }

    const validated = validateBenefitInput({
      staffMember,
      benefitType: input.benefitType,
      cashAmount: input.cashAmount,
      inventoryLines: input.inventoryLines,
      productsById,
      usedToday: 0,
      override: input.override,
      overrideReason: input.overrideReason,
      actor,
    });

    const benefitType = input.benefitType;
    const totalValue = validated.proposed;
    const cashDayKey = validated.cashDayKey;
    const notes = String(input.notes || '').trim();
    const benefitNumber = buildBenefitReference(payDate);

    const sRef = db.doc(`users/${uid}/staffMembers/${staffMemberId}`);
    const staffInTx = await tx.get(sRef);
    if (!docExists(staffInTx)) throw new Error('سجل الموظف غير موجود');

    const openDoc = await getOpenShiftDocInTx(tx, db, uid, input.shiftId || null);
    if (!openDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل الاستفادة');
    const shiftData = openDoc.data();
    assertStaffOnDutyForShift({ status: 'open', ...shiftData }, staffMemberId);
    const shiftSnap = shiftSnapFromDoc(openDoc);

    const dailyRef = db.doc(`users/${uid}/staffBenefitDaily/${dailyUsageDocId(staffMemberId, cashDayKey)}`);
    const dailySnap = await tx.get(dailyRef);
    const usedInTx = dailySnap.exists ? roundMoney(dailySnap.data().usedTotal) : 0;
    const limit = roundMoney(staffInTx.data().benefitLimitILS ?? staffMember.benefitLimitILS);

    if (
      benefitType !== BENEFIT_TYPE_PERSONAL &&
      roundMoney(usedInTx + totalValue) > limit + 0.001 &&
      !validated.override
    ) {
      throw new Error(
        `تجاوز حد الاستفادة (مستخدم اليوم ${usedInTx} ₪ — المتبقي ${roundMoney(limit - usedInTx)} ₪)`
      );
    }

    const lines = validated.lines || [];
    const lineProductIds = new Set(lines.map((l) => l.productId));
    const productDocs = {};
    for (const pid of lineProductIds) {
      const pRef = db.doc(`users/${uid}/products/${pid}`);
      const pDoc = await tx.get(pRef);
      if (!docExists(pDoc)) throw new Error('الصنف غير موجود');
      productDocs[pid] = { ref: pRef, data: { ...pDoc.data() } };
    }

    const ingredientIds = collectIngredientIds(productDocs, lines);
    const ingredientDocs = {};
    for (const ingId of ingredientIds) {
      const ingRef = db.doc(`users/${uid}/ingredients/${ingId}`);
      const ingDoc = await tx.get(ingRef);
      if (docExists(ingDoc)) ingredientDocs[ingId] = { ref: ingRef, data: { ...ingDoc.data() } };
    }

    let benefitCogs = 0;
    const stockBenefitTypes = [BENEFIT_TYPE_INVENTORY, BENEFIT_TYPE_PERSONAL];
    if (stockBenefitTypes.includes(benefitType)) {
      for (const line of lines) {
        const units = line.stockUnits;
        if (!(units > 0)) continue;
        const fifo = await consumeInventoryLayersFifo(tx, db, uid, line.productId, units);
        benefitCogs += fifo.cogs || 0;
        if (fifo.shortfall > 0) {
          benefitCogs += legacyProductCogs(productDocs[line.productId]?.data, fifo.shortfall);
        }
      }
      benefitCogs = roundMoney(benefitCogs);
    }

    if (stockBenefitTypes.includes(benefitType)) {
      for (const line of lines) {
        const p = productDocs[line.productId];
        if (!p) throw new Error(`الصنف «${line.name}» غير موجود`);
        const units = line.stockUnits;
        if (units > 0 && getProductType(p.data) !== 'time') {
          const stock = Number(p.data.stock) || 0;
          if (stock < units) throw new Error(`مخزون «${line.name}» غير كافٍ. المتاح: ${stock}`);
          p.data.stock = stock - units;
        }
      }
      for (const line of lines) {
        const pData = productDocs[line.productId]?.data;
        const qty = Number(line.quantity) || 0;
        for (const ing of pData?.ingredients || []) {
          if (!ing.ingredientId || !ingredientDocs[ing.ingredientId]) continue;
          const ingData = ingredientDocs[ing.ingredientId];
          const usage = (Number(ing.usageQty) || 0) * qty;
          const next = (Number(ingData.data.stock) || 0) - usage;
          if (next < -0.0001) throw new Error(`مكوّن «${ingData.data.name || ing.ingredientId}» غير كافٍ`);
          ingData.data.stock = next;
        }
      }
    }

    const benefitDocRef = db.collection(`users/${uid}/employeeBenefits`).doc();
    const expenseRef = db.collection(`users/${uid}/expenses`).doc();

    const benefitPayload = {
      benefitNumber,
      staffMemberId,
      staffName: staffInTx.data().name || staffMember.name,
      benefitType,
      cashAmount: benefitType === BENEFIT_TYPE_CASH ? totalValue : 0,
      inventoryLines:
        benefitType === BENEFIT_TYPE_INVENTORY || benefitType === BENEFIT_TYPE_PERSONAL ? lines : [],
      totalValue,
      cogsAmount: benefitCogs,
      cashDayKey,
      shiftId: shiftSnap.id,
      status: BENEFIT_STATUS_APPROVED,
      notes,
      recordedBy: actor || null,
      override: validated.override,
      overrideReason: validated.override ? validated.overrideReason : '',
      originalLimit: limit,
      expenseId: expenseRef.id,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(db),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: '',
    };

    const expenseFields = buildEmployeeBenefitExpenseFields(
      { ...benefitPayload, id: benefitDocRef.id, benefitNumber, benefitType, staffMemberId, recordedBy: actor },
      { payDate, uid, benefitId: benefitDocRef.id }
    );

    const Timestamp = admin.firestore.Timestamp;
    tx.set(benefitDocRef, benefitPayload);
    tx.set(expenseRef, {
      ...expenseFields,
      date: Timestamp.fromDate(payDate),
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(db),
    });

    if (benefitType !== BENEFIT_TYPE_PERSONAL) {
      tx.set(
        dailyRef,
        {
          staffMemberId,
          cashDayKey,
          usedTotal: roundMoney(usedInTx + totalValue),
          updatedAt: serverTimestamp(db),
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );
    }

    if (stockBenefitTypes.includes(benefitType)) {
      for (const pid of lineProductIds) {
        const p = productDocs[pid];
        if (p && getProductType(p.data) !== 'time') {
          tx.update(p.ref, { stock: p.data.stock, updatedAt: serverTimestamp(db) });
        }
      }
      for (const ingId of ingredientIds) {
        const ing = ingredientDocs[ingId];
        if (ing) tx.update(ing.ref, { stock: ing.data.stock, updatedAt: serverTimestamp(db) });
      }
    }

    let cashRecorded = false;
    if (benefitType === BENEFIT_TYPE_CASH) {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'withdrawal',
        amount: totalValue,
        reason: `استفادة موظف — ${benefitPayload.staffName} (${benefitNumber})`,
        actor,
        movementExtra: { expenseId: expenseRef.id },
      });
      cashRecorded = true;
    }

    if (idemKey) {
      tx.set(db.doc(`users/${uid}/employeeBenefitIdempotency/${idemKey}`), {
        benefitId: benefitDocRef.id,
        expenseId: expenseRef.id,
        benefitNumber,
        cashRecorded,
        staffMemberId,
        totalValue,
        createdAtMs: Date.now(),
      });
    }

    return {
      benefitId: benefitDocRef.id,
      expenseId: expenseRef.id,
      benefitRef: benefitNumber,
      cashRecorded,
      duplicate: false,
    };
  });
}

async function cancelEmployeeBenefit(db, uid, benefitId, { actor, reason }) {
  assertBenefitPermission(actor);
  const cancelReason = String(reason || '').trim();
  if (!cancelReason) throw new Error('سبب الإلغاء إلزامي');

  return db.runTransaction(async (tx) => {
    const bRef = db.doc(`users/${uid}/employeeBenefits/${benefitId}`);
    const bSnap = await tx.get(bRef);
    if (!docExists(bSnap)) throw new Error('عملية الاستفادة غير موجودة');
    const benefit = bSnap.data();
    if (benefit.status === BENEFIT_STATUS_CANCELLED) throw new Error('تم إلغاء هذه العملية مسبقاً');

    const dailyRef = db.doc(
      `users/${uid}/staffBenefitDaily/${dailyUsageDocId(benefit.staffMemberId, benefit.cashDayKey)}`
    );
    const dailySnap = await tx.get(dailyRef);
    const used = dailySnap.exists ? roundMoney(dailySnap.data().usedTotal) : 0;
    const totalValue = roundMoney(benefit.totalValue);
    const lines = benefit.inventoryLines || [];
    const stockBenefitTypes = [BENEFIT_TYPE_INVENTORY, BENEFIT_TYPE_PERSONAL];

    const productDocs = {};
    for (const line of lines) {
      const pid = line.productId;
      if (!pid || productDocs[pid]) continue;
      const pRef = db.doc(`users/${uid}/products/${pid}`);
      const pDoc = await tx.get(pRef);
      if (docExists(pDoc)) productDocs[pid] = { ref: pRef, data: { ...pDoc.data() } };
    }

    let shiftSnap = null;
    if (benefit.benefitType === BENEFIT_TYPE_CASH && totalValue > 0) {
      const openDoc = await getOpenShiftDocInTx(tx, db, uid, benefit.shiftId || null);
      if (openDoc) shiftSnap = shiftSnapFromDoc(openDoc);
    }

    if (stockBenefitTypes.includes(benefit.benefitType)) {
      for (const line of lines) {
        const units = line.stockUnits ?? stockUnitsForItem(line);
        if (units > 0) await restoreInventoryLayersLifo(tx, db, uid, line.productId, units);
      }
      for (const line of lines) {
        const p = productDocs[line.productId];
        if (!p) continue;
        const units = line.stockUnits ?? stockUnitsForItem(line);
        if (units > 0 && getProductType(p.data) !== 'time') {
          p.data.stock = (Number(p.data.stock) || 0) + units;
          tx.update(p.ref, { stock: p.data.stock, updatedAt: serverTimestamp(db) });
        }
      }
    }

    tx.update(bRef, {
      status: BENEFIT_STATUS_CANCELLED,
      cancelledAt: serverTimestamp(db),
      cancelledAtMs: Date.now(),
      cancelledBy: actor || null,
      cancelReason,
      updatedAt: serverTimestamp(db),
    });

    if (benefit.expenseId) {
      tx.update(db.doc(`users/${uid}/expenses/${benefit.expenseId}`), {
        cancelled: true,
        cancelReason,
        updatedAt: serverTimestamp(db),
      });
    }

    if (benefit.benefitType !== BENEFIT_TYPE_PERSONAL) {
      tx.set(
        dailyRef,
        {
          usedTotal: roundMoney(Math.max(0, used - totalValue)),
          updatedAt: serverTimestamp(db),
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );
    }

    let cashReversed = false;
    if (benefit.benefitType === BENEFIT_TYPE_CASH && totalValue > 0 && shiftSnap) {
      appendCashMovementInTx(tx, db, uid, shiftSnap, {
        type: 'deposit',
        amount: totalValue,
        reason: `إلغاء استفادة موظف — ${benefit.staffName} (${benefit.benefitNumber})`,
        actor,
        movementExtra: { expenseId: benefit.expenseId || null },
      });
      cashReversed = true;
    }

    return { benefitId, cashReversed, cancelled: true };
  });
}

module.exports = { executeEmployeeBenefit, cancelEmployeeBenefit };
