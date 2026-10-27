/**
 * Test-sales removal — Cloud Functions when deployed, client Firestore in demo.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  db,
  isDemoMode,
  isFirebaseConfigured,
} from '../firebaseClient';
import { buildTestRemovalPreview } from '../utils/testDataRemovalLogic';
import {
  callPreviewRemoveTestSales,
  callExecuteRemoveTestSales,
  callUpdateTestDataRegistry,
  callMarkOrdersAsTestData,
  isTestDataRemovalCloudEnabled,
} from './secureFunctions';

async function loadRegistry(uid) {
  const ref = doc(db, 'users', uid, 'maintenance', 'testDataRegistry');
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  return {
    orderIds: Array.isArray(data.orderIds) ? data.orderIds.map(String) : [],
    sessionIds: Array.isArray(data.sessionIds) ? data.sessionIds.map(String) : [],
  };
}

async function fetchMarkedOrders(uid, registryOrderIds) {
  const byId = new Map();
  const flagged = await getDocs(query(collection(db, 'users', uid, 'orders'), where('isTestData', '==', true)));
  flagged.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
  for (const id of registryOrderIds) {
    if (byId.has(id)) continue;
    const snap = await getDoc(doc(db, 'users', uid, 'orders', id));
    if (snap.exists()) byId.set(id, { id: snap.id, ...snap.data() });
  }
  return [...byId.values()];
}

async function fetchMarkedSessions(uid, registrySessionIds) {
  const byId = new Map();
  const flagged = await getDocs(
    query(collection(db, 'users', uid, 'playstationSessions'), where('isTestData', '==', true))
  );
  flagged.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
  for (const id of registrySessionIds) {
    if (byId.has(id)) continue;
    const snap = await getDoc(doc(db, 'users', uid, 'playstationSessions', id));
    if (snap.exists()) byId.set(id, { id: snap.id, ...snap.data() });
  }
  return [...byId.values()];
}

async function loadCashContext(uid, orderIds) {
  const movements = [];
  const shiftsById = new Map();
  for (const orderId of orderIds) {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'cashMovements'), where('orderId', '==', orderId))
    );
    snap.docs.forEach((d) => movements.push({ id: d.id, ...d.data() }));
  }
  const shiftIds = [...new Set(movements.map((m) => m.shiftId).filter(Boolean))];
  for (const shiftId of shiftIds) {
    const s = await getDoc(doc(db, 'users', uid, 'cashShifts', shiftId));
    if (s.exists()) shiftsById.set(shiftId, { id: s.id, ...s.data() });
  }
  return { movements, shiftsById };
}

async function loadCustomersForOrders(uid, orders) {
  const ids = [...new Set(orders.map((o) => o.customerId).filter(Boolean))];
  const map = new Map();
  for (const cid of ids) {
    const snap = await getDoc(doc(db, 'users', uid, 'customers', cid));
    if (snap.exists()) map.set(cid, { id: snap.id, ...snap.data() });
  }
  return map;
}

async function previewRemoveTestSalesClient(uid) {
  const registry = await loadRegistry(uid);
  const registryOrderIds = new Set(registry.orderIds);
  const registrySessionIds = new Set(registry.sessionIds);
  const orders = await fetchMarkedOrders(uid, registry.orderIds);
  const sessions = await fetchMarkedSessions(uid, registry.sessionIds);
  const customersById = await loadCustomersForOrders(uid, orders);
  const { movements, shiftsById } = await loadCashContext(uid, orders.map((o) => o.id));
  const preview = buildTestRemovalPreview({
    orders,
    sessions,
    customersById,
    cashMovements: movements,
    shiftsById,
    registryOrderIds,
    registrySessionIds,
  });
  return { ...preview, registry };
}

export async function previewRemoveTestSales(uid) {
  if (isTestDataRemovalCloudEnabled()) {
    try {
      return await callPreviewRemoveTestSales();
    } catch (_) {
      /* fallback to client reads */
    }
  }
  if (isDemoMode || isFirebaseConfigured) {
    return previewRemoveTestSalesClient(uid);
  }
  throw new Error('إزالة المبيعات الوهمية غير متاحة');
}

export async function executeRemoveTestSales(uid, { orderIds, sessionIds, runId }) {
  if (isTestDataRemovalCloudEnabled()) {
    try {
      return await callExecuteRemoveTestSales({ orderIds, sessionIds, runId, confirm: true });
    } catch (_) {
      /* fallback when Functions not deployed yet */
    }
  }
  if (isDemoMode || isFirebaseConfigured) {
    return executeRemoveTestSalesLocal(uid, { orderIds, sessionIds, runId });
  }
  throw new Error('إزالة المبيعات الوهمية غير متاحة');
}

/** Local Firestore purge — no stock reversal; mirrors server rules */
async function executeRemoveTestSalesLocal(uid, { orderIds, sessionIds, runId }) {
  const { runTransaction, deleteDoc, updateDoc, serverTimestamp, writeBatch } = await import('../firebaseClient');
  const { effectiveDebt, replaceOrderDebtEntry, money } = await import('../utils/orderAccounting');
  const { computeExpectedCash } = await import('../utils/cashShiftMath');
  const { isOrderMarkedAsTest, isSessionMarkedAsTest, customerHasDebtEntryForOrder } = await import(
    '../utils/testDataRemovalLogic'
  );

  const registry = await loadRegistry(uid);
  const registryOrderIds = new Set(registry.orderIds);
  const registrySessionIds = new Set(registry.sessionIds);
  const result = { runId, ordersRemoved: 0, sessionsRemoved: 0, errors: [], ok: true };

  const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

  for (const orderId of orderIds || []) {
    try {
      const movSnap = await getDocs(
        query(collection(db, 'users', uid, 'cashMovements'), where('orderId', '==', orderId))
      );
      const movementDocs = movSnap.docs;
      await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'users', uid, 'orders', orderId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) return;
        const order = { id: orderSnap.id, ...orderSnap.data() };
        if (!isOrderMarkedAsTest(order, registryOrderIds)) throw new Error('غير معلَّم كوهمي');

        for (const mDoc of movementDocs) {
          const m = mDoc.data();
          const shiftRef = doc(db, 'users', uid, 'cashShifts', m.shiftId);
          const shiftSnap = await tx.get(shiftRef);
          if (!shiftSnap.exists()) throw new Error('وردية غير موجودة');
          const shift = shiftSnap.data();
          if (shift.status !== 'open') throw new Error('وردية مغلقة');
          const amt = roundMoney(m.amount);
          const sums = {
            cashSales: Number(shift.cashSales) || 0,
            cashWithdrawals: Number(shift.cashWithdrawals) || 0,
            cashDeposits: Number(shift.cashDeposits) || 0,
            cashRefunds: Number(shift.cashRefunds) || 0,
          };
          if (m.type === 'sale') sums.cashSales = roundMoney(sums.cashSales - amt);
          else if (m.type === 'refund') sums.cashRefunds = roundMoney(sums.cashRefunds - amt);
          tx.update(shiftRef, {
            ...sums,
            expectedClosingBalance: computeExpectedCash({ openingBalance: shift.openingBalance, ...sums }),
          });
          tx.delete(mDoc.ref);
        }

        const debt = effectiveDebt(order);
        if (debt > 0 && order.customerId) {
          const cRef = doc(db, 'users', uid, 'customers', order.customerId);
          const cSnap = await tx.get(cRef);
          if (cSnap.exists()) {
            const cData = cSnap.data();
            if (customerHasDebtEntryForOrder(cData, order.orderNumber)) {
              tx.update(cRef, {
                balance: money((Number(cData.balance) || 0) - debt),
                transactions: replaceOrderDebtEntry(cData.transactions, order.orderNumber, null),
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        for (const item of order.items || []) {
          if (item.sessionId) {
            const sRef = doc(db, 'users', uid, 'playstationSessions', item.sessionId);
            const sSnap = await tx.get(sRef);
            if (sSnap.exists()) {
              tx.update(sRef, { billed: false, orderId: null, orderNumber: null });
            }
          }
        }
        tx.delete(orderRef);
      });
      result.ordersRemoved += 1;
    } catch (e) {
      result.errors.push({ orderId, message: e.message || String(e) });
      result.ok = false;
    }
  }

  for (const sessionId of sessionIds || []) {
    try {
      const sRef = doc(db, 'users', uid, 'playstationSessions', sessionId);
      const snap = await getDoc(sRef);
      if (!snap.exists()) continue;
      const session = { id: snap.id, ...snap.data() };
      if (!isSessionMarkedAsTest(session, registrySessionIds)) throw new Error('جلسة غير معلَّمة');
      if (session.status === 'active') throw new Error('جلسة نشطة');
      await deleteDoc(sRef);
      result.sessionsRemoved += 1;
    } catch (e) {
      result.errors.push({ sessionId, message: e.message || String(e) });
      result.ok = false;
    }
  }

  return result;
}

export async function resolveOrderNumbersToIds(uid, orderNumbers) {
  const nums = new Set((orderNumbers || []).map((n) => String(n).trim().padStart(4, '0')).filter(Boolean));
  if (!nums.size) return [];
  const snap = await getDocs(collection(db, 'users', uid, 'orders'));
  const ids = [];
  snap.docs.forEach((d) => {
    const num = String(d.data().orderNumber || '').padStart(4, '0');
    if (nums.has(num) || nums.has(String(d.data().orderNumber))) ids.push(d.id);
  });
  return ids;
}

export async function addOrdersToTestRegistry(uid, orderIds) {
  if (isTestDataRemovalCloudEnabled()) {
    return callUpdateTestDataRegistry({ addOrderIds: orderIds });
  }
  const ref = doc(db, 'users', uid, 'maintenance', 'testDataRegistry');
  const current = await loadRegistry(uid);
  const set = new Set([...current.orderIds, ...orderIds.map(String)]);
  const { setDoc, serverTimestamp } = await import('../firebaseClient');
  await setDoc(ref, { orderIds: [...set], sessionIds: current.sessionIds, updatedAt: serverTimestamp() }, { merge: true });
  return { orderIds: [...set], sessionIds: current.sessionIds };
}

export async function markOrdersTestData(uid, orderIds) {
  if (isTestDataRemovalCloudEnabled()) {
    return callMarkOrdersAsTestData({ orderIds });
  }
  const { updateDoc, serverTimestamp } = await import('../firebaseClient');
  await Promise.all(
    orderIds.map((id) =>
      updateDoc(doc(db, 'users', uid, 'orders', id), {
        isTestData: true,
        testDataMarkedAt: serverTimestamp(),
      })
    )
  );
  return { updated: orderIds.length };
}
