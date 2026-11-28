import {
  db,
  doc,
  collection,
  setDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from '../firebaseClient';
import { getCashDayKey } from '../utils/cashDayPeriod';

const daysCol = (uid) => collection(db, 'users', uid, 'businessDays');
const summariesCol = (uid) => collection(db, 'users', uid, 'businessDaySummaries');
const adjustmentsCol = (uid) => collection(db, 'users', uid, 'businessDayAdjustments');

export function buildBusinessDayId(closedAtMs = Date.now()) {
  return `bd_${getCashDayKey(new Date(closedAtMs))}_${closedAtMs}`;
}

/** Called when shift 2 closes — linkage فقط (قابلة للتحقق في القواعد؛ التفاصيل المالية تُحسب من الطلبات). */
export async function closeBusinessDay(uid, { shift1Id, shift2Id, closedAtMs = Date.now(), summary = null }) {
  const id = buildBusinessDayId(closedAtMs);
  const dayKey = getCashDayKey(new Date(closedAtMs));
  const s1 = shift1Id || null;
  const s2 = shift2Id || null;
  if (!s1 || !s2) throw new Error('إغلاق يوم العمل يتطلب شفتين مغلقتين');
  const payload = {
    businessDayKey: dayKey,
    shiftIds: [s1, s2],
    shift1Id: s1,
    shift2Id: s2,
    closedAtMs,
    status: 'closed',
    updatedAt: serverTimestamp(),
  };
  if (summary && typeof summary === 'object') {
    // للعرض المحلي فقط — لا يُخزَّن في Firestore لئلا تُصنع مجاميع غير موثوقة.
    void summary;
  }
  await setDoc(doc(daysCol(uid), id), { ...payload, createdAt: serverTimestamp() }, { merge: false });
  await setDoc(
    doc(summariesCol(uid), id),
    {
      businessDayKey: dayKey,
      closedAtMs,
      shift1Id: s1,
      shift2Id: s2,
      createdAt: serverTimestamp(),
    },
    { merge: false }
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

function shiftTotalsFromData(data) {
  if (!data) return { cashSales: 0, cardSales: 0 };
  return {
    cashSales: Number(data.cashSales) || 0,
    cardSales: Number(data.cardSales) || 0,
  };
}

/** عرض أرشيف: يحافظ على الملخصات القديمة ويُكمّل الجديدة من شفتين مغلقتين (قراءتان كحد أقصى). */
export async function hydrateBusinessDaySummaryForDisplay(uid, row) {
  if (!row || row.totalSales != null) return row;
  const s1 = row.shift1Id ? (await getDoc(doc(db, 'users', uid, 'cashShifts', row.shift1Id))).data() : null;
  const s2 = row.shift2Id ? (await getDoc(doc(db, 'users', uid, 'cashShifts', row.shift2Id))).data() : null;
  const a = shiftTotalsFromData(s1);
  const b = shiftTotalsFromData(s2);
  const cashSales = Math.round((a.cashSales + b.cashSales) * 100) / 100;
  const cardSales = Math.round((a.cardSales + b.cardSales) * 100) / 100;
  return {
    ...row,
    cashSales,
    cardSales,
    totalSales: Math.round((cashSales + cardSales) * 100) / 100,
    totalsSource: 'shifts',
  };
}

export async function listBusinessDaySummaries(uid, max = 60) {
  const snap = await getDocs(query(summariesCol(uid), orderBy('closedAtMs', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
