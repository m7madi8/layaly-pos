import { getLocalCalendarDayStart } from './dashboardCashSales';
import { getCashDayKey } from './cashDayPeriod';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const DAY_SUMMARY_STATE = {
  VERIFIED_ZERO: 'VERIFIED_ZERO',
  VERIFIED_SUMMARY: 'VERIFIED_SUMMARY',
  MISSING_SUMMARY: 'MISSING_SUMMARY',
  INCOMPLETE_SUMMARY: 'INCOMPLETE_SUMMARY',
  LIVE_TODAY: 'LIVE_TODAY',
};

/**
 * Merge closed business-day summaries with live today orders for the 7-day chart.
 * Does not mix cash movements with sales — uses summary.totalSales / live paid order totals only.
 * Missing closed days are not shown as zero (MISSING_SUMMARY).
 */
export function buildWeeklySalesChart(businessSummaries = [], todayOrders = [], dayStart = getLocalCalendarDayStart()) {
  const salesByDay = new Map();
  const today = new Date(dayStart);
  today.setHours(0, 0, 0, 0);
  const summaryByKey = new Map();

  for (const row of businessSummaries || []) {
    const key = row.businessDayKey || (row.closedAtMs ? getCashDayKey(new Date(row.closedAtMs)) : null);
    if (key) summaryByKey.set(key, row);
  }

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = getCashDayKey(date);
    salesByDay.set(key, { sales: null, date, dayKey: key, summaryState: DAY_SUMMARY_STATE.MISSING_SUMMARY });
  }

  const todayKey = getCashDayKey(today);

  for (const [key, slot] of salesByDay.entries()) {
    if (key === todayKey) {
      const live = (todayOrders || [])
        .filter((o) => o.status === 'paid')
        .reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
      slot.sales = money(live);
      slot.summaryState = DAY_SUMMARY_STATE.LIVE_TODAY;
      continue;
    }

    const row = summaryByKey.get(key);
    if (!row) continue;

    const incomplete = Boolean(row.incomplete || row.partial);
    const totalSales = row.totalSales != null ? money(Number(row.totalSales)) : null;
    if (incomplete) {
      slot.sales = totalSales;
      slot.summaryState = DAY_SUMMARY_STATE.INCOMPLETE_SUMMARY;
    } else if (totalSales === 0) {
      slot.sales = 0;
      slot.summaryState = DAY_SUMMARY_STATE.VERIFIED_ZERO;
    } else if (totalSales != null) {
      slot.sales = totalSales;
      slot.summaryState = DAY_SUMMARY_STATE.VERIFIED_SUMMARY;
    }
  }

  return Array.from(salesByDay.values())
    .sort((a, b) => a.date - b.date)
    .map((data) => ({
      day: data.date.toLocaleDateString('ar', { weekday: 'short' }),
      sales: data.sales,
      summaryState: data.summaryState,
      dayKey: data.dayKey,
    }));
}

export function summarizeTodayFromOrders(dashboardOrders = []) {
  const paid = dashboardOrders.filter((o) => o.status === 'paid');
  const unpaid = dashboardOrders.filter((o) => o.status !== 'paid' && o.status !== 'cancelled');
  return {
    orderCount: dashboardOrders.length,
    paidOrderCount: paid.length,
    salesTotal: money(paid.reduce((s, o) => s + (Number(o.total) || 0), 0)),
    pendingTotal: money(unpaid.reduce((s, o) => s + (Number(o.total) || 0), 0)),
  };
}