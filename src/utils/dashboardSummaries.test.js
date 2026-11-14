import { buildWeeklySalesChart, DAY_SUMMARY_STATE } from './dashboardSummaries';
import { getCashDayKey } from './cashDayPeriod';
import { getLocalCalendarDayStart } from './dashboardCashSales';

describe('buildWeeklySalesChart', () => {
  test('uses summary for closed days and live orders for today', () => {
    const dayStart = getLocalCalendarDayStart();
    const todayKey = getCashDayKey(dayStart);
    const summaries = [{ businessDayKey: todayKey, totalSales: 1 }];
    const yesterday = new Date(dayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = getCashDayKey(yesterday);
    summaries.push({ businessDayKey: yKey, totalSales: 500 });

    const chart = buildWeeklySalesChart(
      summaries,
      [{ status: 'paid', total: 120, timestamp: { toDate: () => new Date() } }],
      dayStart
    );
    expect(chart).toHaveLength(7);
    const todaySlot = chart.find((r) => r.sales === 120);
    expect(todaySlot).toBeTruthy();
    const closedDay = chart.find((r) => r.sales === 500);
    expect(closedDay).toBeTruthy();
    expect(closedDay.summaryState).toBe(DAY_SUMMARY_STATE.VERIFIED_SUMMARY);
  });

  test('marks days without summary as missing, not zero', () => {
    const dayStart = getLocalCalendarDayStart();
    const chart = buildWeeklySalesChart([], [], dayStart);
    const missing = chart.filter((r) => r.summaryState === DAY_SUMMARY_STATE.MISSING_SUMMARY);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((r) => r.sales === null)).toBe(true);
  });
});