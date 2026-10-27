/**
 * Layali POS — Phase 1 Cloud Functions scaffold.
 * Deploy intentionally blocked via package.json script until migration checklist is complete.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOrderCaller, requireAdminClaim } = require('./lib/authz');
const { isAdminTokenRole } = require('./lib/authzPolicy');
const { actorFromAuth, rejectClientSuppliedRole } = require('./lib/callableActor');
const { executeCompleteOrder, executeCancelOrder } = require('./lib/orderEngine');
const {
  executeOpenCashShift,
  executeCloseCashShift,
  executeCashShiftMovement,
} = require('./lib/cashShiftEngine');
const {
  previewTestDataRemoval,
  executeTestDataRemoval,
  updateTestDataRegistry,
  markOrdersAsTestData,
} = require('./lib/testDataRemoval');

initializeApp();

const region = 'europe-west1';

const BATCH_SIZE = 450;

function assertNoClientRoleFields(data) {
  if (rejectClientSuppliedRole(data || {})) {
    throw new HttpsError('invalid-argument', 'لا ترسل حقول دور أو موظف في الطلب');
  }
}

function buildCallableActor(request, policyRole) {
  const fromAuth = actorFromAuth(request);
  return {
    uid: fromAuth.uid,
    role: fromAuth.role || policyRole || 'unknown',
  };
}

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  }
  return request.auth.uid;
}

function employeePin() {
  return String(process.env.EMPLOYEE_PIN || '').trim();
}

function vaultPin() {
  return String(process.env.VAULT_PIN || '').trim();
}

/** One-time: attach admin custom claim to the signed-in Firebase user (manager account). */
exports.bootstrapAdminClaim = onCall({ region }, async (request) => {
  const uid = requireAuth(request);
  if (request.auth.token.role) {
    throw new HttpsError('failed-precondition', 'الدور مضبوط مسبقاً');
  }
  await getAuth().setCustomUserClaims(uid, { role: 'admin' });
  return { ok: true, message: 'تم تعيين دور المدير — أعد تسجيل الدخول لتحديث الرمز' };
});

/** Server-side employee PIN check (secret lives in Functions env, not in the web bundle). */
exports.verifyEmployeePin = onCall({ region }, async (request) => {
  requireAuth(request);
  const pin = String(request.data?.pin || '').trim();
  const expected = employeePin();
  if (!expected) {
    throw new HttpsError('failed-precondition', 'EMPLOYEE_PIN غير مضبوط على الخادم');
  }
  if (!pin || pin !== expected) {
    throw new HttpsError('permission-denied', 'رمز الموظف غير صحيح');
  }
  return { ok: true };
});

/** Server-side vault PIN check — use before vault mutations in Phase 2. */
exports.verifyVaultPin = onCall({ region }, async (request) => {
  requireAdminClaim(request);
  const pin = String(request.data?.pin || '').trim();
  const expected = vaultPin();
  if (!expected) {
    throw new HttpsError('failed-precondition', 'VAULT_PIN غير مضبوط على الخادم');
  }
  if (!pin || pin !== expected) {
    throw new HttpsError('permission-denied', 'رمز الخزنة غير صحيح');
  }
  return { ok: true };
});

async function deleteSubcollection(db, uid, subcollection) {
  const colRef = db.collection('users').doc(uid).collection(subcollection);
  const snap = await colRef.get();
  let deleted = 0;
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    ids.slice(i, i + BATCH_SIZE).forEach((id) => {
      batch.delete(colRef.doc(id));
    });
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, ids.length - i);
  }
  return deleted;
}

/** Destructive reset — admin claim only; mirrors client resetSalesAndLedgers. */
exports.resetSalesAndCustomerLedgers = onCall({ region }, async (request) => {
  const uid = requireAdminClaim(request);
  if (request.data?.confirm !== true) {
    throw new HttpsError('invalid-argument', 'يلزم confirm: true');
  }

  const db = getFirestore();
  const ordersDeleted = await deleteSubcollection(db, uid, 'orders');
  const openBillsDeleted = await deleteSubcollection(db, uid, 'openBills');
  const orderEditsDeleted = await deleteSubcollection(db, uid, 'orderEdits');

  await db.doc(`users/${uid}/counters/orders`).set({ count: 0 }, { merge: true });

  const preserveCustomerLedgers = request.data?.preserveCustomerLedgers !== false;
  const custSnap = await db.collection('users').doc(uid).collection('customers').get();
  let customersReset = 0;
  const customersPreserved = custSnap.docs.length;

  if (!preserveCustomerLedgers) {
    for (let i = 0; i < custSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      custSnap.docs.slice(i, i + BATCH_SIZE).forEach((d) => {
        batch.update(d.ref, {
          balance: 0,
          transactions: [],
          updatedAt: FieldValue.serverTimestamp(),
        });
        customersReset += 1;
      });
      await batch.commit();
    }
  }

  return {
    ordersDeleted,
    openBillsDeleted,
    orderEditsDeleted,
    customersReset,
    customersPreserved: preserveCustomerLedgers ? customersPreserved : 0,
    preserveCustomerLedgers,
  };
});

/** Trusted order completion — server-side pricing and inventory. */
exports.completeOrder = onCall({ region }, async (request) => {
  const db = getFirestore();
  const { uid, role } = await requireOrderCaller(request, db);
  const data = request.data || {};
  assertNoClientRoleFields(data);
  const isAdmin = isAdminTokenRole(request.auth.token.role);
  const actor = buildCallableActor(request, role);
  try {
    const result = await executeCompleteOrder(db, uid, data, { isAdmin, actor });
    return result;
  } catch (err) {
    const msg = err?.message || 'تعذّر إتمام الطلب';
    if (/غير كافٍ|غير صالح|مطلوب|مدعومة|مدير/.test(msg)) {
      throw new HttpsError('failed-precondition', msg);
    }
    throw new HttpsError('internal', msg);
  }
});

function mapPrecondition(err, fallback) {
  const msg = err?.message || fallback;
  if (/غير كافٍ|غير صالح|مطلوب|مدعومة|مدير|وردية|مفتوحة|مغلقة|صفر/.test(msg)) {
    throw new HttpsError('failed-precondition', msg);
  }
  throw new HttpsError('internal', msg);
}

/** Open cash shift (transactional — one open shift per tenant). */
exports.openCashShift = onCall({ region }, async (request) => {
  const db = getFirestore();
  const { uid, role } = await requireOrderCaller(request, db);
  const data = request.data || {};
  assertNoClientRoleFields(data);
  const actor = buildCallableActor(request, role);
  try {
    return await executeOpenCashShift(db, uid, data, { actor });
  } catch (err) {
    mapPrecondition(err, 'تعذّر فتح الوردية');
  }
});

/** Close cash shift — mirrors client close + vault transfer. */
exports.closeCashShift = onCall({ region }, async (request) => {
  const db = getFirestore();
  const { uid, role } = await requireOrderCaller(request, db);
  const data = request.data || {};
  assertNoClientRoleFields(data);
  const actor = buildCallableActor(request, role);
  try {
    return await executeCloseCashShift(
      db,
      uid,
      {
        shiftId: data.shiftId,
        actualClosingBalance: data.actualClosingBalance,
        notes: data.notes,
      },
      { actor }
    );
  } catch (err) {
    mapPrecondition(err, 'تعذّر إغلاق الوردية');
  }
});

/** Deposit or withdrawal on an open shift. */
exports.recordCashShiftMovement = onCall({ region }, async (request) => {
  const db = getFirestore();
  const { uid, role } = await requireOrderCaller(request, db);
  const data = request.data || {};
  assertNoClientRoleFields(data);
  const actor = buildCallableActor(request, role);
  try {
    return await executeCashShiftMovement(
      db,
      uid,
      {
        shiftId: data.shiftId,
        type: data.type,
        amount: data.amount,
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
      },
      { actor }
    );
  } catch (err) {
    mapPrecondition(err, 'تعذّر تسجيل الحركة');
  }
});

/** Preview dummy / test sales marked for removal (admin only). */
exports.previewRemoveTestSales = onCall({ region }, async (request) => {
  const uid = requireAdminClaim(request);
  const db = getFirestore();
  try {
    return await previewTestDataRemoval(db, uid);
  } catch (err) {
    throw new HttpsError('internal', err?.message || 'تعذّر تجهيز المعاينة');
  }
});

/** Execute approved test-data removal (admin only, no stock reversal). */
exports.executeRemoveTestSales = onCall({ region }, async (request) => {
  const uid = requireAdminClaim(request);
  if (request.data?.confirm !== true) {
    throw new HttpsError('invalid-argument', 'يلزم confirm: true');
  }
  const db = getFirestore();
  const actor = buildCallableActor(request, 'admin');
  const orderIds = Array.isArray(request.data?.orderIds) ? request.data.orderIds.map(String) : [];
  const sessionIds = Array.isArray(request.data?.sessionIds) ? request.data.sessionIds.map(String) : [];
  const runId = String(request.data?.runId || `run_${Date.now()}`);
  try {
    return await executeTestDataRemoval(db, uid, { orderIds, sessionIds, actor, runId });
  } catch (err) {
    const msg = err?.message || 'تعذّر تنفيذ الإزالة';
    if (/وردية|مغلقة|قيد التنفيذ|غير معل/.test(msg)) {
      throw new HttpsError('failed-precondition', msg);
    }
    throw new HttpsError('internal', msg);
  }
});

exports.updateTestDataRegistry = onCall({ region }, async (request) => {
  const uid = requireAdminClaim(request);
  const db = getFirestore();
  const actor = buildCallableActor(request, 'admin');
  const data = request.data || {};
  try {
    return await updateTestDataRegistry(
      db,
      uid,
      {
        addOrderIds: data.addOrderIds,
        addSessionIds: data.addSessionIds,
        removeOrderIds: data.removeOrderIds,
        removeSessionIds: data.removeSessionIds,
      },
      actor
    );
  } catch (err) {
    throw new HttpsError('internal', err?.message || 'تعذّر تحديث السجل');
  }
});

exports.markOrdersAsTestData = onCall({ region }, async (request) => {
  const uid = requireAdminClaim(request);
  const db = getFirestore();
  const actor = buildCallableActor(request, 'admin');
  const orderIds = Array.isArray(request.data?.orderIds) ? request.data.orderIds.map(String) : [];
  if (!orderIds.length) {
    throw new HttpsError('invalid-argument', 'حدد طلبات للتعليم');
  }
  try {
    return await markOrdersAsTestData(db, uid, { orderIds, mark: request.data?.mark !== false }, actor);
  } catch (err) {
    throw new HttpsError('internal', err?.message || 'تعذّر التعليم');
  }
});

/** Trusted order cancellation. */
exports.cancelOrder = onCall({ region }, async (request) => {
  const db = getFirestore();
  const { uid, role } = await requireOrderCaller(request, db);
  const orderId = String(request.data?.orderId || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'معرّف الطلب مطلوب');
  const data = request.data || {};
  assertNoClientRoleFields(data);
  const actor = buildCallableActor(request, role);
  try {
    return await executeCancelOrder(db, uid, { orderId }, { actor });
  } catch (err) {
    const msg = err?.message || 'تعذّر إلغاء الطلب';
    throw new HttpsError('failed-precondition', msg);
  }
});
