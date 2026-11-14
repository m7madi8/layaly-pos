import { loadRecentBusinessSummaries, invalidateReportSummaryCache } from './reportSummaryCache';
import { buildWeeklySalesChart } from '../../utils/dashboardSummaries';
import { getLocalCalendarDayStart } from '../../utils/dashboardCashSales';

let weekInflight = null;
/** @type {Map<string, { rows: object[], loadedAt: number }>} */
const weekCache = new Map();

export async function loadDashboardWeekSummaries(uid, { max = 14, force = false } = {}) {
  if (!uid) return [];
  const key = `week:${uid}:${max}`;
  const hit = weekCache.get(key);
  if (!force && hit && Date.now() - hit.loadedAt < 120_000) return hit.rows;
  if (!force && weekInflight) return weekInflight;
  weekInflight = loadRecentBusinessSummaries(uid, { max, force })
    .then((rows) => {
      weekCache.set(key, { rows, loadedAt: Date.now() });
      weekInflight = null;
      return rows;
    })
    .catch((e) => {
      weekInflight = null;
      throw e;
    });
  return weekInflight;
}

export function getWeeklySalesChartData(uid, summaries, todayOrders) {
  return buildWeeklySalesChart(summaries, todayOrders, getLocalCalendarDayStart());
}

export function invalidateDashboardWeekCache(uid) {
  for (const k of weekCache.keys()) {
    if (k.startsWith(`week:${uid}:`)) weekCache.delete(k);
  }
  invalidateReportSummaryCache(uid);
}

export function clearDashboardMetricsCache() {
  weekCache.clear();
  weekInflight = null;
}