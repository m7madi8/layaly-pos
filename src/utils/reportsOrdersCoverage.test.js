import { shouldWarnReportsPartialTotals } from './reportsOrdersCoverage';

describe('reportsOrdersCoverage', () => {
  test('warns on all-time filter', () => {
    expect(shouldWarnReportsPartialTotals({ reportFilter: 'all', ordersLoadedCount: 10 })).toBe(true);
  });

  test('warns when loaded count hits query cap', () => {
    expect(shouldWarnReportsPartialTotals({ reportFilter: 'lastWeek', ordersLoadedCount: 400 })).toBe(true);
  });

  test('no warn for short lastWeek under cap', () => {
    expect(shouldWarnReportsPartialTotals({ reportFilter: 'lastWeek', ordersLoadedCount: 50 })).toBe(false);
  });
});
