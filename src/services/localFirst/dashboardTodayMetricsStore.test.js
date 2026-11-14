import { aggregateDashboardTodayMetrics } from './dashboardTodayMetricsStore';
import { getLocalCalendarDayStart } from '../../utils/dashboardCashSales';

describe('aggregateDashboardTodayMetrics', () => {
  const dayStart = getLocalCalendarDayStart();

  it('sums more than 150 paid orders for authoritative KPIs', () => {
    const orders = Array.from({ length: 200 }, (_, i) => ({
      id: `p${i}`,
      status: 'paid',
      total: 10,
      cashPaid: 10,
      debtAmount: 0,
      paymentMethod: 'Cash',
      timestamp: { toDate: () => new Date(dayStart.getTime() + 1000) },
    }));
    const m = aggregateDashboardTodayMetrics(orders, dayStart);
    expect(m.orderCount).toBe(200);
    expect(m.salesTotalPaid).toBe(2000);
    expect(m.cashSales).toBe(2000);
  });
});