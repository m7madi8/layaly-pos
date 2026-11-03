import { getDashboardPeriodLabels } from './dashboardPeriodLabels';
import { CASH_DAY_START_HOUR } from './cashDayGate';

describe('dashboardPeriodLabels', () => {
  test('includes calendar and cash day notes', () => {
    const info = getDashboardPeriodLabels(new Date(2026, 2, 15, 10, 0, 0));
    expect(info.cashDayStartHour).toBe(CASH_DAY_START_HOUR);
    expect(info.calendarNote).toMatch(/Hebron|Asia/);
    expect(info.cashDayNote).toMatch(/يوم الكاش/);
    expect(info.cashDayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
