import { getReportPeriodBounds } from './reportPeriodBounds';
import { shouldWarnReportsPartialTotals, describeReportDataCoverage } from './reportsOrdersCoverage';

describe('reportPeriodBounds', () => {
  const ref = new Date(2026, 2, 15, 14, 0, 0);

  test('lastWeek is 7 calendar days including today', () => {
    const { start } = getReportPeriodBounds('lastWeek', {}, ref);
    expect(start.getDate()).toBe(9);
    expect(start.getMonth()).toBe(2);
  });
});

describe('reportsOrdersCoverage', () => {
  test('warns on all-time filter', () => {
    expect(shouldWarnReportsPartialTotals({ reportFilter: 'all', ordersLoadedCount: 10 })).toBe(true);
  });

  test('describeReportDataCoverage flags cap', () => {
    const d = describeReportDataCoverage({
      reportFilter: 'lastMonth',
      reportCustomDates: {},
      ordersLoadedCount: 400,
      ordersQueryLimit: 400,
      expensesLoadedCount: 50,
      expensesQueryLimit: 800,
    });
    expect(d.partial).toBe(true);
    expect(d.ordersCapped).toBe(true);
    expect(d.message).toMatch(/400/);
  });

  test('today under cap is not partial', () => {
    const d = describeReportDataCoverage({
      reportFilter: 'today',
      ordersLoadedCount: 12,
      expensesLoadedCount: 5,
    });
    expect(d.partial).toBe(false);
  });
});
