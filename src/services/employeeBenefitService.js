import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import {
  readOpenCashShiftInTransaction,
  appendCashMovementInTransaction,
} from './cashShiftService';
import {
  EMPLOYEE_BENEFIT_SECTION,
  EMPLOYEE_BENEFIT_CATEGORY,
  BENEFIT_TYPE_CASH,
  BENEFIT_TYPE_INVENTORY,
  BENEFIT_STATUS_APPROVED,
  BENEFIT_STATUS_CANCELLED,
  buildBenefitReference,
  dailyUsageDocId,
  validateBenefitInput,
  assertBenefitPermission,
  roundMoney,
} from '../utils/employeeBenefitAccounting';
import { getProductType, stockUnitsForItem } from '../utils/productPricing';

const benefitsCol = (uid) => collection(db, 'users', uid, 'employeeBenefits');
const benefitRef = (uid, id) => doc(db, 'users', uid, 'employeeBenefits', id);
const staffRef = (uid, id) => doc(db, 'users', uid, 'staffMembers', id);
const dailyCol = (uid) => collection(db, 'users', uid, 'staffBenefitDaily');
const idempotencyCol = (uid) => collection(db, 'users', uid, 'employeeBenefitIdempotency');
const expensesCol = (uid) => collection(db, 'users', uid, 'expenses');

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

/**
 * @returns {Promise<{ benefitId, expenseId, benefitRef, duplicate, cashRecorded }>}
 */
export async function executeEmployeeBenefit(uid, input, { actor, idempotencyKey }) {
  const staffMember = input.staffMember;
  const productsById = input.productsById || {};
  const usedToday = roundMoney(input.usedToday || 0);

  const validated = validateBenefitInput({
    staffMember,
    benefitType: input.benefitType,
    cashAmount: input.cashAmount,
    inventoryLines: input.inventoryLines,
    productsById,
    usedToday,
    override: input.override,
    overrideReason: input.overrideReason,
    actor,
  });

  const benefitType = input.benefitType;
  const totalValue = validated.proposed;
  const cashDayKey = validated.cashDayKey;
  const payDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(payDate.getTime())) throw new Error('تاريخ غير صالح');

  const idemKey = String(idempotencyKey || '').trim();
  const benefitNumber = buildBenefitReference(payDate);
  const notes = String(input.notes || '').trim();

  return runTransaction(db, async (tx) => {
    let idemRef = null;
    if (idemKey) {
      idemRef = doc(idempotencyCol(uid), idemKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
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

    const sRef = staffRef(uid, staffMember.id);
    const staffSnap = await tx.get(sRef);
    if (!staffSnap.exists()) throw new Error('سجل الموظف غير موجود');

    const dailyRef = doc(dailyCol(uid), dailyUsageDocId(staffMember.id, cashDayKey));
    const dailySnap = await tx.get(dailyRef);
    const usedInTx = dailySnap.exists() ? roundMoney(dailySnap.data().usedTotal) : 0;
    const limit = roundMoney(staffSnap.data().benefitLimitILS ?? staffMember.benefitLimitILS);

    const quotaCheck = roundMoney(usedInTx + totalValue);
    if (quotaCheck > limit + 0.001 && !validated.override) {
      throw new Error(
        `تجاوز حد الاستفادة (مستخدم اليوم ${usedInTx} ₪ — المتبقي ${roundMoney(limit - usedInTx)} ₪)`
      );
    }

    let cashShiftCtx = null;
    if (benefitType === BENEFIT_TYPE_CASH) {
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, input.shiftId || null);
      if (!cashShiftCtx) {
        throw new Error('لا توجد وردية كاش مفتوحة لتسجيل الاستفادة النقدية');
      }
    }

    const lines = validated.lines || [];
    const productIds = new Set(lines.map((l) => l.productId));
    const productDocs = {};
    for (const pid of productIds) {
      const pRef = doc(db, 'users', uid, 'products', pid);
      const pDoc = await tx.get(pRef);
      if (!pDoc.exists()) throw new Error(`الصنف غير موجود`);
      productDocs[pid] = { ref: pRef, data: pDoc.data() };
    }

    const ingredientIds = collectIngredientIds(productDocs, lines);
    const ingredientDocs = {};
    for (const ingId of ingredientIds) {
      const ingRef = doc(db, 'users', uid, 'ingredients', ingId);
      const ingDoc = await tx.get(ingRef);
      if (ingDoc.exists()) {
        ingredientDocs[ingId] = { ref: ingRef, data: ingDoc.data() };
      }
    }

    if (benefitType === BENEFIT_TYPE_INVENTORY) {
      for (const line of lines) {
        const p = productDocs[line.productId];
        if (!p) throw new Error(`الصنف «${line.name}» غير موجود`);
        const units = line.stockUnits;
        if (units > 0 && getProductType(p.data) !== 'time') {
          const stock = Number(p.data.stock) || 0;
          if (stock < units) {
            throw new Error(`مخزون «${line.name}» غير كافٍ. المتاح: ${stock}`);
          }
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
          if (next < -0.0001) {
            throw new Error(`مكوّن «${ingData.data.name || ing.ingredientId}» غير كافٍ`);
          }
          ingData.data.stock = next;
        }
      }
    }

    const benefitDocRef = doc(benefitsCol(uid));
    const expenseRef = doc(expensesCol(uid));

    const benefitPayload = {
      benefitNumber,
      staffMemberId: staffMember.id,
      staffName: staffSnap.data().name || staffMember.name,
      benefitType,
      cashAmount: benefitType === BENEFIT_TYPE_CASH ? totalValue : 0,
      inventoryLines: benefitType === BENEFIT_TYPE_INVENTORY ? lines : [],
      totalValue,
      cashDayKey,
      shiftId: input.shiftId || cashShiftCtx?.shiftId || null,
      status: BENEFIT_STATUS_APPROVED,
      notes,
      recordedBy: actor || null,
      override: validated.override,
      overrideReason: validated.override ? validated.overrideReason : '',
      originalLimit: limit,
      expenseId: expenseRef.id,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: '',
    };

    const description =
      benefitType === BENEFIT_TYPE_CASH
        ? `استفادة موظف (كاش) — ${benefitPayload.staffName}`
        : `استفادة موظف (أصناف) — ${benefitPayload.staffName}`;

    const expenseData = {
      amount: totalValue,
      date: payDate,
      section: EMPLOYEE_BENEFIT_SECTION,
      category: EMPLOYEE_BENEFIT_CATEGORY,
      description,
      notes,
      staffMemberId: staffMember.id,
      staffName: benefitPayload.staffName,
      benefitId: benefitDocRef.id,
      benefitNumber,
      benefitType,
      paymentMethod: benefitType === BENEFIT_TYPE_CASH ? 'Cash' : 'Inventory',
      recordedBy: actor || null,
      userId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(benefitDocRef, benefitPayload);
    tx.set(expenseRef, expenseData);

    tx.set(
      dailyRef,
      {
        staffMemberId: staffMember.id,
        cashDayKey,
        usedTotal: roundMoney(usedInTx + totalValue),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );

    if (benefitType === BENEFIT_TYPE_INVENTORY) {
      for (const pid of productIds) {
        const p = productDocs[pid];
        if (p && getProductType(p.data) !== 'time') {
          tx.update(p.ref, { stock: p.data.stock, updatedAt: serverTimestamp() });
        }
      }
      for (const ingId of ingredientIds) {
        const ing = ingredientDocs[ingId];
        if (ing) {
          tx.update(ing.ref, { stock: ing.data.stock, updatedAt: serverTimestamp() });
        }
      }
    }

    let cashRecorded = false;
    if (benefitType === BENEFIT_TYPE_CASH && cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'withdrawal',
        amount: totalValue,
        reason: `استفادة موظف — ${benefitPayload.staffName} (${benefitNumber})`,
        actor,
        expenseId: expenseRef.id,
      });
      cashRecorded = true;
    }

    if (idemKey && idemRef) {
      tx.set(idemRef, {
        benefitId: benefitDocRef.id,
        expenseId: expenseRef.id,
        benefitNumber,
        cashRecorded,
        staffMemberId: staffMember.id,
        totalValue,
        createdAt: serverTimestamp(),
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

export async function cancelEmployeeBenefit(uid, benefitId, { actor, reason }) {
  assertBenefitPermission(actor);
  const cancelReason = String(reason || '').trim();
  if (!cancelReason) throw new Error('سبب الإلغاء إلزامي');

  return runTransaction(db, async (tx) => {
    const bRef = benefitRef(uid, benefitId);
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists()) throw new Error('عملية الاستفادة غير موجودة');
    const benefit = bSnap.data();
    if (benefit.status === BENEFIT_STATUS_CANCELLED) {
      throw new Error('تم إلغاء هذه العملية مسبقاً');
    }
    if (benefit.status !== BENEFIT_STATUS_APPROVED) {
      throw new Error('لا يمكن إلغاء هذه العملية');
    }

    const dailyRef = doc(dailyCol(uid), dailyUsageDocId(benefit.staffMemberId, benefit.cashDayKey));
    const dailySnap = await tx.get(dailyRef);
    const used = dailySnap.exists() ? roundMoney(dailySnap.data().usedTotal) : 0;
    const totalValue = roundMoney(benefit.totalValue);

    const lines = benefit.inventoryLines || [];
    const productIds = new Set(lines.map((l) => l.productId));
    const productDocs = {};
    for (const pid of productIds) {
      const pRef = doc(db, 'users', uid, 'products', pid);
      const pDoc = await tx.get(pRef);
      if (pDoc.exists()) productDocs[pid] = { ref: pRef, data: pDoc.data() };
    }

    const ingredientIds = new Set();
    for (const line of lines) {
      const pData = productDocs[line.productId]?.data;
      for (const ing of pData?.ingredients || []) {
        if (ing.ingredientId) ingredientIds.add(ing.ingredientId);
      }
    }
    const ingredientDocs = {};
    for (const ingId of ingredientIds) {
      const ingRef = doc(db, 'users', uid, 'ingredients', ingId);
      const ingDoc = await tx.get(ingRef);
      if (ingDoc.exists()) ingredientDocs[ingId] = { ref: ingRef, data: ingDoc.data() };
    }

    let cashShiftCtx = null;
    if (benefit.benefitType === BENEFIT_TYPE_CASH && totalValue > 0) {
      cashShiftCtx = await readOpenCashShiftInTransaction(tx, uid, benefit.shiftId || null);
    }

    if (benefit.benefitType === BENEFIT_TYPE_INVENTORY) {
      for (const line of lines) {
        const p = productDocs[line.productId];
        if (!p) continue;
        const units = line.stockUnits ?? stockUnitsForItem(line);
        if (units > 0 && getProductType(p.data) !== 'time') {
          p.data.stock = (Number(p.data.stock) || 0) + units;
        }
      }
      for (const line of lines) {
        const pData = productDocs[line.productId]?.data;
        const qty = Number(line.quantity) || 0;
        for (const ing of pData?.ingredients || []) {
          if (!ing.ingredientId || !ingredientDocs[ing.ingredientId]) continue;
          const ingData = ingredientDocs[ing.ingredientId];
          const usage = (Number(ing.usageQty) || 0) * qty;
          ingData.data.stock = (Number(ingData.data.stock) || 0) + usage;
        }
      }
      for (const pid of productIds) {
        const p = productDocs[pid];
        if (p && getProductType(p.data) !== 'time') {
          tx.update(p.ref, { stock: p.data.stock, updatedAt: serverTimestamp() });
        }
      }
      for (const ingId of ingredientIds) {
        const ing = ingredientDocs[ingId];
        if (ing) tx.update(ing.ref, { stock: ing.data.stock, updatedAt: serverTimestamp() });
      }
    }

    tx.update(bRef, {
      status: BENEFIT_STATUS_CANCELLED,
      cancelledAt: serverTimestamp(),
      cancelledAtMs: Date.now(),
      cancelledBy: actor || null,
      cancelReason,
      updatedAt: serverTimestamp(),
    });

    if (benefit.expenseId) {
      const eRef = doc(db, 'users', uid, 'expenses', benefit.expenseId);
      tx.update(eRef, {
        cancelled: true,
        cancelReason,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(
      dailyRef,
      {
        usedTotal: roundMoney(Math.max(0, used - totalValue)),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );

    let cashReversed = false;
    if (benefit.benefitType === BENEFIT_TYPE_CASH && totalValue > 0 && cashShiftCtx) {
      await appendCashMovementInTransaction(tx, uid, cashShiftCtx.shiftId, cashShiftCtx.shiftSnap, {
        type: 'deposit',
        amount: totalValue,
        reason: `إلغاء استفادة موظف — ${benefit.staffName} (${benefit.benefitNumber})`,
        actor,
        expenseId: benefit.expenseId || null,
      });
      cashReversed = true;
    }

    return { benefitId, cashReversed, cancelled: true };
  });
}
