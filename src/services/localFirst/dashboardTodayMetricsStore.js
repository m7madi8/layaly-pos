import { Timestamp } from 'firebase/firestore';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from '../../firebaseClient';
import { getLocalCalendarDayStart } from '../../utils/dashboardCashSales';
import {
  computeTodayCashSales,
  computeTodayCardSales,
  computeTodayDebtSales,
  isOrderOnOrAfterDayStart,
  orderCardCollected,
} from '../../utils/dashboardCashSales';
import { mapOrderSnapshot } from '../../utils/firestoreOrderQueries';
import { getCashDayKey } from '../../utils/cashDayPeriod';

const PAGE = 150;
const HARD_CAP = 6000;

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function ordersCol(uid) {
  return collection(db, 'users', uid, 'orders');
}

export function aggregateDashboardTodayMetrics(orders, dayStart = getLocalCalendarDayStart()) {
  const today = (orders || []).filter((o) => isOrderOnOrAfterDayStart(o, dayStart));
  const paid = today.filter((o) => o.status === 'paid');
  const unpaid = today.filter((o) => o.status !== 'paid' && o.status !== 'cancelled');
  const cancelled = today.filter((o) => o.status === 'cancelled');

  const paymentStats = paid.reduce((acc, order) => {
    const method = order.paymentMethod || 'Cash';
    acc[method] = (acc[method] || 0) + (parseFloat(order.total) || 0);
    return acc;
  }, {});

  return {
    orderCount: today.length,
    paidOrderCount: paid.length,
    unpaidOrderCount: unpaid.length,
    cancelledCount: cancelled.length,
    salesTotalPaid: money(paid.reduce((s, o) => s + (Number(o.total) || 0), 0)),
    pendingTotal: money(unpaid.reduce((s, o) => s + (Number(o.total) || 0), 0)),
    cashSales: computeTodayCashSales(today, dayStart),
    cardSales: computeTodayCardSales(today, dayStart),
    cardSaleCount: today.filter((o) => orderCardCollected(o) > 0).length,
    debtSales: computeTodayDebtSales(today, dayStart),
    paymentStats,
    profitTotal: money(paid.reduce((s, o) => s + (Number(o.profit) || 0), 0)),
  };
}

/**
 * Authoritative today totals for dashboard KPIs — paginates through all calendar-today orders.
 */
export async function loadDashboardTodayMetrics(uid, dayStart = getLocalCalendarDayStart()) {
  if (!uid) {
    return {
      metrics: aggregateDashboardTodayMetrics([], dayStart),
      complete: true,
      truncated: false,
      loadedCount: 0,
      dayKey: getCashDayKey(dayStart),
    };
  }

  const dayKey = getCashDayKey(dayStart);
  const cacheHit = loadDashboardTodayMetrics._cache;
  if (cacheHit?.uid === uid && cacheHit.dayKey === dayKey && Date.now() - cacheHit.at < 30_000) {
    return cacheHit.payload;
  }

  const startTs = Timestamp.fromDate(dayStart);
  const acc = [];
  let cursor = null;
  let complete = true;
  let truncated = false;

  while (acc.length < HARD_CAP) {
    let q = query(
      ordersCol(uid),
      where('timestamp', '>=', startTs),
      orderBy('timestamp', 'desc'),
      limit(PAGE)
    );
    if (cursor) {
      q = query(
        ordersCol(uid),
        where('timestamp', '>=', startTs),
        orderBy('timestamp', 'desc'),
        startAfter(cursor),
        limit(PAGE)
      );
    }

    const snap = await getDocs(q);
    acc.push(...mapOrderSnapshot(snap));
    if (snap.docs.length < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (acc.length >= HARD_CAP) {
    truncated = true;
    complete = false;
  }

  const payload = {
    metrics: aggregateDashboardTodayMetrics(acc, dayStart),
    complete,
    truncated,
    loadedCount: acc.length,
    dayKey,
  };

  loadDashboardTodayMetrics._cache = { uid, dayKey, at: Date.now(), payload };
  return payload;
}

export function invalidateDashboardTodayMetrics(uid) {
  if (loadDashboardTodayMetrics._cache?.uid === uid) {
    loadDashboardTodayMetrics._cache = null;
  }
}

export function clearDashboardTodayMetricsCache() {
  loadDashboardTodayMetrics._cache = null;
}