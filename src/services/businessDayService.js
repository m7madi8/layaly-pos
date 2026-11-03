import { db, doc, collection, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from '../firebaseClient';
import { getCashDayKey } from '../utils/cashDayPeriod';

const daysCol = (uid) => collection(db, 'users', uid, 'businessDays');
const summariesCol = (uid) => collection(db, 'users', uid, 'businessDaySummaries');
const adjustmentsCol = (uid) => collection(db, 'users', uid, 'businessDayAdjustments');

export function buildBusinessDayId(closedAtMs = Date.now()) {
  return `bd_${getCashDayKey(new Date(closedAtMs))}_${closedAtMs}`;
}

/** Called when shift 2 closes — archive business day + summary stub. */
export async function closeBusinessDay(uid, { shift1Id, shift2Id, closedAtMs = Date.now(), summary = {} }) {
  const id = buildBusinessDayId(closedAtMs);
  const dayKey = getCashDayKey(new Date(closedAtMs));
  const payload = {
    businessDayKey: dayKey,
    shiftIds: [shift1Id, shift2Id].filter(Boolean),
    shift1Id: shift1Id || null,
    shift2Id: shift2Id || null,
    closedAtMs,
    status: 'closed',
    summary,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(daysCol(uid), id), { ...payload, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(
    doc(summariesCol(uid), id),
    {
      businessDayKey: dayKey,
      closedAtMs,
      ...summary,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return id;
}

export async function recordBusinessDayAdjustment(uid, { businessDayId, orderId, reason, deltaSummary }) {
  const ref = doc(adjustmentsCol(uid));
  await setDoc(ref, {
    businessDayId,
    orderId: orderId || null,
    reason: String(reason || '').trim(),
    deltaSummary: deltaSummary || {},
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return ref.id;
}

export async function listBusinessDays(uid, max = 60) {
  const snap = await getDocs(query(daysCol(uid), orderBy('closedAtMs', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listBusinessDaySummaries(uid, max = 60) {
  const snap = await getDocs(query(summariesCol(uid), orderBy('closedAtMs', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
