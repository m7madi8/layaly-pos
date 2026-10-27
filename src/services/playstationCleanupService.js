import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  db,
} from '../firebaseClient';
import { buildPlaystationCleanupPreview, sessionCleanupBlockReason } from '../utils/playstationOldSessionsLogic';

export async function loadPlaystationCleanupPreview(uid) {
  const [sessSnap, ordSnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'playstationSessions'), orderBy('startedAtMs', 'desc'))),
    getDocs(collection(db, 'users', uid, 'orders')),
  ]);
  const sessions = sessSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orders = ordSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return buildPlaystationCleanupPreview(sessions, orders);
}

export async function markPlaystationSessionsTestData(uid, sessionIds) {
  await Promise.all(
    (sessionIds || []).map((id) =>
      updateDoc(doc(db, 'users', uid, 'playstationSessions', id), {
        isTestData: true,
        testDataMarkedAt: serverTimestamp(),
      })
    )
  );
  return { updated: sessionIds.length };
}

export async function deletePlaystationSessions(uid, sessionIds, { sessionsById, orders }) {
  const orderIdSet = new Set((orders || []).map((o) => o.id));
  const result = { deleted: 0, skipped: [], errors: [] };

  for (const id of sessionIds || []) {
    let full = sessionsById.get(id);
    if (!full) {
      const snap = await getDoc(doc(db, 'users', uid, 'playstationSessions', id));
      if (!snap.exists()) {
        result.skipped.push({ id, reason: 'missing' });
        continue;
      }
      full = { id: snap.id, ...snap.data() };
    }
    const block = sessionCleanupBlockReason(full, orderIdSet);
    if (block) {
      result.skipped.push({ id, reason: block });
      continue;
    }
    try {
      await deleteDoc(doc(db, 'users', uid, 'playstationSessions', id));
      result.deleted += 1;
    } catch (e) {
      result.errors.push({ id, message: e.message || String(e) });
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}

export async function runPlaystationCleanup(uid, sessionIds) {
  const sessSnap = await getDocs(collection(db, 'users', uid, 'playstationSessions'));
  const sessionsById = new Map(sessSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const ordSnap = await getDocs(collection(db, 'users', uid, 'orders'));
  const orders = ordSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return deletePlaystationSessions(uid, sessionIds, { sessionsById, orders });
}
