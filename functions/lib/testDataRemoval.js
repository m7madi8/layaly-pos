const { effectiveDebt, replaceOrderDebtEntry, money } = require('./orderAccounting');
const { computeExpectedCash } = require('./cashShiftMath');
const { roundMoney } = require('./vaultAccounting');

const REGISTRY_PATH = (uid) => `users/${uid}/maintenance/testDataRegistry`;
const LOCK_PATH = (uid) => `users/${uid}/maintenance/testDataRemovalLock`;
const AUDIT_COL = (uid) => `users/${uid}/auditLog`;

const {
  isOrderMarkedAsTest,
  isSessionMarkedAsTest,
  customerHasDebtEntryForOrder,
  buildTestRemovalPreview,
  TEST_DATA_NOTES_MARKER,
} = require('./testDataRemovalLogic');

function serverTimestamp(db) {
  const FV = db.constructor.FieldValue || require('firebase-admin').firestore.FieldValue;
  return FV.serverTimestamp();
}

async function loadRegistry(db, uid) {
  const snap = await db.doc(REGISTRY_PATH(uid)).get();
  const data = snap.exists ? snap.data() : {};
  return {
    orderIds: Array.isArray(data.orderIds) ? data.orderIds.map(String) : [],
    sessionIds: Array.isArray(data.sessionIds) ? data.sessionIds.map(String) : [],
  };
}

async function saveRegistry(db, uid, patch, actor) {
  await db.doc(REGISTRY_PATH(uid)).set(
    {
      ...patch,
      updatedAt: serverTimestamp(db),
      updatedBy: actor || null,
    },
    { merge: true }
  );
}

async function fetchMarkedOrders(db, uid, registryOrderIds) {
  const byId = new Map();
  const flaggedSnap = await db.collection(`users/${uid}/orders`).where('isTestData', '==', true).get();
  flaggedSnap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));

  for (const id of registryOrderIds) {
    if (byId.has(id)) continue;
    const snap = await db.doc(`users/${uid}/orders/${id}`).get();
    if (snap.exists) byId.set(id, { id: snap.id, ...snap.data() });
  }

  return [...byId.values()];
}

async function fetchMarkedSessions(db, uid, registrySessionIds) {
  const byId = new Map();
  const flaggedSnap = await db.collection(`users/${uid}/playstationSessions`).where('isTestData', '==', true).get();
  flaggedSnap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));

  for (const id of registrySessionIds) {
    if (byId.has(id)) continue;
    const snap = await db.doc(`users/${uid}/playstationSessions/${id}`).get();
    if (snap.exists) byId.set(id, { id: snap.id, ...snap.data() });
  }
  return [...byId.values()];
}

async function loadCashContext(db, uid, orderIds) {
  if (orderIds.length === 0) return { movements: [], shiftsById: new Map() };
  const movements = [];
  const shiftsById = new Map();

  for (const orderId of orderIds) {
    const snap = await db
      .collection(`users/${uid}/cashMovements`)
      .where('orderId', '==', orderId)
      .get();
    snap.docs.forEach((d) => movements.push({ id: d.id, ...d.data() }));
  }

  const shiftIds = [...new Set(movements.map((m) => m.shiftId).filter(Boolean))];
  for (const shiftId of shiftIds) {
    const s = await db.doc(`users/${uid}/cashShifts/${shiftId}`).get();
    if (s.exists) shiftsById.set(shiftId, { id: s.id, ...s.data() });
  }
  return { movements, shiftsById };
}

async function loadCustomersForOrders(db, uid, orders) {
  const ids = [...new Set(orders.map((o) => o.customerId).filter(Boolean))];
  const map = new Map();
  for (const cid of ids) {
    const snap = await db.doc(`users/${uid}/customers/${cid}`).get();
    if (snap.exists) map.set(cid, { id: snap.id, ...snap.data() });
  }
  return map;
}

async function previewTestDataRemoval(db, uid) {
  const registry = await loadRegistry(db, uid);
  const registryOrderIds = new Set(registry.orderIds);
  const registrySessionIds = new Set(registry.sessionIds);
  const orders = await fetchMarkedOrders(db, uid, registry.orderIds);
  const sessions = await fetchMarkedSessions(db, uid, registry.sessionIds);
  const customersById = await loadCustomersForOrders(db, uid, orders);
  const { movements, shiftsById } = await loadCashContext(db, uid, orders.map((o) => o.id));

  const preview = buildTestRemovalPreview({
    orders,
    sessions,
    customersById,
    cashMovements: movements,
    shiftsById,
    registryOrderIds,
    registrySessionIds,
  });

  return {
    ...preview,
    markerHint: `علّم الطلبات بـ isTestData أو أضف «${TEST_DATA_NOTES_MARKER}» في الملاحظات أو سجّل المعرّفات في السجل`,
    registry,
  };
}

function reverseOpenShiftCashMovementInTx(tx, db, uid, shiftRef, shiftData, movement) {
  const amt = roundMoney(movement.amount);
  if (!(amt > 0)) return;
  const type = movement.type;
  const sums = {
    cashSales: Number(shiftData.cashSales) || 0,
    cashWithdrawals: Number(shiftData.cashWithdrawals) || 0,
    cashDeposits: Number(shiftData.cashDeposits) || 0,
    cashRefunds: Number(shiftData.cashRefunds) || 0,
  };
  if (type === 'sale') sums.cashSales = roundMoney(sums.cashSales - amt);
  else if (type === 'refund') sums.cashRefunds = roundMoney(sums.cashRefunds - amt);
  else throw new Error(`لا يُعكس نوع حركة ${type} تلقائياً في إزالة الاختبار`);

  const expected = computeExpectedCash({
    openingBalance: shiftData.openingBalance,
    ...sums,
  });
  tx.update(shiftRef, {
    ...sums,
    expectedClosingBalance: expected,
    updatedAt: serverTimestamp(db),
    updatedAtMs: Date.now(),
  });
  tx.delete(db.doc(`users/${uid}/cashMovements/${movement.id}`));
}

async function purgeSingleOrderInTx(tx, db, uid, orderId, registryOrderIds, movements, actor) {
  const orderRef = db.doc(`users/${uid}/orders/${orderId}`);
  const orderSnap = await tx.get(orderRef);
  if (!orderSnap.exists) return { skipped: true, reason: 'missing' };
  const order = { id: orderSnap.id, ...orderSnap.data() };
  if (!isOrderMarkedAsTest(order, registryOrderIds)) {
    throw new Error(`الطلب ${orderId} غير معلَّم كوهمي`);
  }
  if (order.testDataPurgedAt) return { skipped: true, reason: 'already_purged' };

  for (const m of movements) {
    const shiftRef = db.doc(`users/${uid}/cashShifts/${m.shiftId}`);
    const shiftSnap = await tx.get(shiftRef);
    if (!shiftSnap.exists) throw new Error('وردية الصندوق غير موجودة لحركة مرتبطة');
    const shiftData = shiftSnap.data();
    if (shiftData.status !== 'open') {
      throw new Error(`طلب #${order.orderNumber}: نقد على وردية مغلقة`);
    }
    reverseOpenShiftCashMovementInTx(tx, db, uid, shiftRef, shiftData, m);
  }

  const debt = effectiveDebt(order);
  if (debt > 0 && order.customerId) {
    const cRef = db.doc(`users/${uid}/customers/${order.customerId}`);
    const cSnap = await tx.get(cRef);
    if (cSnap.exists) {
      const cData = cSnap.data();
      if (customerHasDebtEntryForOrder({ transactions: cData.transactions }, order.orderNumber)) {
        tx.update(cRef, {
          balance: money((Number(cData.balance) || 0) - debt),
          transactions: replaceOrderDebtEntry(cData.transactions, order.orderNumber, null),
          updatedAt: serverTimestamp(db),
        });
      }
    }
  }

  for (const item of order.items || []) {
    if (item.sessionId) {
      const sRef = db.doc(`users/${uid}/playstationSessions/${item.sessionId}`);
      const sSnap = await tx.get(sRef);
      if (sSnap.exists) {
        tx.update(sRef, {
          billed: false,
          orderId: null,
          orderNumber: null,
          testDataPurgedAt: serverTimestamp(db),
          updatedAt: serverTimestamp(db),
        });
      }
    }
  }

  tx.delete(orderRef);
  return { skipped: false, orderNumber: order.orderNumber };
}

async function purgeSessionInTx(tx, db, uid, sessionId, registrySessionIds) {
  const ref = db.doc(`users/${uid}/playstationSessions/${sessionId}`);
  const snap = await tx.get(ref);
  if (!snap.exists) return { skipped: true };
  const session = { id: snap.id, ...snap.data() };
  if (!isSessionMarkedAsTest(session, registrySessionIds)) {
    throw new Error(`جلسة ${sessionId} غير معلَّمة كوهمية`);
  }
  if (session.status === 'active') throw new Error('جلسة نشطة');
  if (session.billed && session.orderId) {
    const oSnap = await tx.get(db.doc(`users/${uid}/orders/${session.orderId}`));
    if (oSnap.exists) throw new Error('جلسة مفوترة بطلب ما زال موجوداً');
  }
  tx.delete(ref);
  return { skipped: false };
}

async function executeTestDataRemoval(db, uid, { orderIds, sessionIds, actor, runId }) {
  const lockRef = db.doc(LOCK_PATH(uid));
  const registry = await loadRegistry(db, uid);
  const registryOrderIds = new Set(registry.orderIds);
  const registrySessionIds = new Set(registry.sessionIds);

  const preview = await previewTestDataRemoval(db, uid);
  const allowedOrders = new Set(preview.eligibleOrderIds);
  const allowedSessions = new Set(preview.eligibleSessionIds);

  const targetOrders = (orderIds || []).map(String).filter((id) => allowedOrders.has(id));
  const targetSessions = (sessionIds || []).map(String).filter((id) => allowedSessions.has(id));

  if (targetOrders.length === 0 && targetSessions.length === 0) {
    return { ok: false, message: 'لا توجد سجلات معتمدة للإزالة', errors: preview.conflicts };
  }

  if (preview.conflicts.some((c) => c.code === 'cash_on_closed_shift' && targetOrders.includes(c.orderId))) {
    throw new Error('تعذّر التنفيذ: طلبات محجوبة بسبب نقد على وردية مغلقة');
  }

  const result = {
    runId: runId || `run_${Date.now()}`,
    ordersRemoved: 0,
    sessionsRemoved: 0,
    skipped: [],
    errors: [],
  };

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists && lockSnap.data().inProgress) {
      throw new Error('عملية إزالة قيد التنفيذ — انتظر اكتمالها');
    }
    tx.set(
      lockRef,
      {
        inProgress: true,
        runId: result.runId,
        startedAtMs: Date.now(),
        startedBy: actor || null,
      },
      { merge: true }
    );
  });

  try {
    for (const orderId of targetOrders) {
      try {
        const movSnap = await db
          .collection(`users/${uid}/cashMovements`)
          .where('orderId', '==', orderId)
          .get();
        const movements = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await db.runTransaction(async (tx) => {
          const r = await purgeSingleOrderInTx(tx, db, uid, orderId, registryOrderIds, movements, actor);
          if (!r.skipped) result.ordersRemoved += 1;
          else result.skipped.push({ orderId, reason: r.reason });
        });
      } catch (err) {
        result.errors.push({ orderId, message: err.message || String(err) });
      }
    }

    for (const sessionId of targetSessions) {
      try {
        await db.runTransaction(async (tx) => {
          const r = await purgeSessionInTx(tx, db, uid, sessionId, registrySessionIds);
          if (!r.skipped) result.sessionsRemoved += 1;
        });
      } catch (err) {
        result.errors.push({ sessionId, message: err.message || String(err) });
      }
    }

    await db.collection(AUDIT_COL(uid)).add({
      type: 'test_data_removal',
      runId: result.runId,
      actor: actor || null,
      ordersRemoved: result.ordersRemoved,
      sessionsRemoved: result.sessionsRemoved,
      orderIds: targetOrders,
      sessionIds: targetSessions,
      errors: result.errors,
      createdAt: serverTimestamp(db),
      createdAtMs: Date.now(),
    });

    await lockRef.set(
      {
        inProgress: false,
        lastRunId: result.runId,
        lastRunAtMs: Date.now(),
        lastRunBy: actor || null,
        lastRunResult: {
          ordersRemoved: result.ordersRemoved,
          sessionsRemoved: result.sessionsRemoved,
          errorCount: result.errors.length,
        },
      },
      { merge: true }
    );

    result.ok = result.errors.length === 0;
    return result;
  } catch (err) {
    await lockRef.set({ inProgress: false, lastError: err.message || String(err) }, { merge: true });
    throw err;
  }
}

async function updateTestDataRegistry(db, uid, { addOrderIds = [], addSessionIds = [], removeOrderIds = [], removeSessionIds = [] }, actor) {
  const current = await loadRegistry(db, uid);
  const orderIds = new Set(current.orderIds);
  const sessionIds = new Set(current.sessionIds);
  addOrderIds.forEach((id) => orderIds.add(String(id)));
  addSessionIds.forEach((id) => sessionIds.add(String(id)));
  removeOrderIds.forEach((id) => orderIds.delete(String(id)));
  removeSessionIds.forEach((id) => sessionIds.delete(String(id)));
  await saveRegistry(
    db,
    uid,
    { orderIds: [...orderIds], sessionIds: [...sessionIds] },
    actor
  );
  return { orderIds: [...orderIds], sessionIds: [...sessionIds] };
}

async function markOrdersAsTestData(db, uid, { orderIds, mark = true }, actor) {
  const batch = db.batch();
  let updated = 0;
  for (const id of orderIds || []) {
    const ref = db.doc(`users/${uid}/orders/${id}`);
    batch.update(ref, {
      isTestData: Boolean(mark),
      testDataMarkedAt: serverTimestamp(db),
      testDataMarkedBy: actor || null,
    });
    updated += 1;
  }
  if (updated) await batch.commit();
  return { updated };
}

module.exports = {
  previewTestDataRemoval,
  executeTestDataRemoval,
  updateTestDataRegistry,
  markOrdersAsTestData,
  loadRegistry,
  TEST_DATA_NOTES_MARKER,
};
