import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import { billableMinutes, durationMinutesBetween, timePrice, roundMoney } from '../utils/productPricing';

export const DEFAULT_PLAYSTATION_SETTINGS = {
  electricityCostPerHour: 1.5,
  stations: [
    { id: 'ps1', name: 'جهاز 1' },
    { id: 'ps2', name: 'جهاز 2' },
    { id: 'ps3', name: 'جهاز 3' },
  ],
};

export function resolvePlaystationSettings(profile) {
  const saved = profile?.playstation || {};
  const stations =
    Array.isArray(saved.stations) && saved.stations.length > 0
      ? saved.stations.filter((s) => s && s.id && String(s.name || '').trim())
      : DEFAULT_PLAYSTATION_SETTINGS.stations;
  const rate = Number(saved.electricityCostPerHour);
  return {
    electricityCostPerHour: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_PLAYSTATION_SETTINGS.electricityCostPerHour,
    stations,
  };
}

const sessionsCol = (uid) => collection(db, 'users', uid, 'playstationSessions');
const sessionRef = (uid, id) => doc(db, 'users', uid, 'playstationSessions', id);
const stationLockRef = (uid, stationId) => doc(db, 'users', uid, 'playstationStations', stationId);

/** يبدأ جلسة — يفشل إذا كان الجهاز مشغولاً بجلسة أخرى (قفل لكل جهاز) */
export async function startPlaystationSession(uid, { station, product, customerId, customerName, actor }) {
  if (!station?.id) throw new Error('اختر الجهاز');
  if (!product?.id) throw new Error('لا يوجد صنف بالوقت مرتبط بالجلسة');
  const newRef = doc(sessionsCol(uid));
  const pricing = product.timePricing || {};

  await runTransaction(db, async (tx) => {
    const lockRef = stationLockRef(uid, station.id);
    const lock = await tx.get(lockRef);
    if (lock.exists() && lock.data().activeSessionId) {
      throw new Error(`«${station.name}» مشغول بجلسة أخرى. أنهِ الجلسة الحالية أولاً.`);
    }
    tx.set(newRef, {
      stationId: station.id,
      stationName: station.name,
      productId: product.id,
      productName: product.name,
      customerId: customerId || null,
      customerName: customerName || '',
      billingMinutes: Number(pricing.billingMinutes) || 0,
      billingPrice: Number(pricing.billingPrice) || 0,
      rounding: pricing.rounding || 'up',
      startedAtMs: Date.now(),
      endedAtMs: null,
      status: 'active',
      billed: false,
      startedBy: actor || null,
      createdAt: serverTimestamp(),
    });
    tx.set(lockRef, { activeSessionId: newRef.id, updatedAt: serverTimestamp() }, { merge: true });
  });
  return newRef.id;
}

/** ينهي الجلسة ويحسب المدة والسعر وتكلفة الكهرباء المرجعية */
export async function endPlaystationSession(uid, sessionId, { electricityCostPerHour, actor }) {
  let result = null;
  await runTransaction(db, async (tx) => {
    const ref = sessionRef(uid, sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة');
    const s = snap.data();
    if (s.status !== 'active') throw new Error('الجلسة منتهية مسبقاً');
    const lockRef = stationLockRef(uid, s.stationId);
    await tx.get(lockRef);

    const endedAtMs = Date.now();
    if (endedAtMs < s.startedAtMs) throw new Error('وقت النهاية قبل وقت البداية — تحقق من ساعة الجهاز');
    const durationMinutes = durationMinutesBetween(s.startedAtMs, endedAtMs);
    const pricing = { billingMinutes: s.billingMinutes, billingPrice: s.billingPrice, rounding: s.rounding };
    const billed = billableMinutes(durationMinutes, s.billingMinutes, s.rounding);
    const price = timePrice(pricing, durationMinutes);

    const update = {
      status: 'ended',
      endedAtMs,
      durationMinutes: roundMoney(durationMinutes),
      billableMinutes: billed,
      price,
      electricityCostPerHour: Number(electricityCostPerHour) || 0,
      endedBy: actor || null,
      updatedAt: serverTimestamp(),
    };
    tx.update(ref, update);
    tx.set(lockRef, { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true });
    result = { id: sessionId, ...s, ...update };
  });
  return result;
}

/** إلغاء جلسة بدأت بالخطأ — لا تُحتسب في الإيراد ولا الكهرباء */
export async function cancelPlaystationSession(uid, sessionId, { actor }) {
  await runTransaction(db, async (tx) => {
    const ref = sessionRef(uid, sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الجلسة غير موجودة');
    const s = snap.data();
    if (s.status !== 'active') throw new Error('لا يمكن إلغاء جلسة منتهية');
    const lockRef = stationLockRef(uid, s.stationId);
    await tx.get(lockRef);
    tx.update(ref, { status: 'cancelled', endedAtMs: Date.now(), cancelledBy: actor || null, updatedAt: serverTimestamp() });
    tx.set(lockRef, { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export function sessionCartItem(session) {
  return {
    id: session.productId,
    productType: 'time',
    name: `${session.productName} · ${session.stationName}`,
    price: session.price,
    originalPrice: session.price,
    cost: 0,
    quantity: 1,
    selectedAddons: [],
    cartItemId: `ps-${session.id}`,
    sessionId: session.id,
    durationMinutes: session.durationMinutes,
    billableMinutes: session.billableMinutes,
  };
}

export { sessionRef as playstationSessionRef };
