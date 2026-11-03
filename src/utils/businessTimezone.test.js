import { getBusinessCalendarDayStart, BUSINESS_TZ } from './businessTimezone';

describe('businessTimezone', () => {
  test('uses Asia/Hebron', () => {
    expect(BUSINESS_TZ).toBe('Asia/Hebron');
  });

  test('day start matches calendar day of reference in Hebron', () => {
    const ref = new Date('2026-03-15T10:00:00.000Z');
    const refYmd = ref.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
    const start = getBusinessCalendarDayStart(ref);
    const hour = Number(
      start.toLocaleString('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', hour12: false })
    );
    expect(hour).toBe(0);
    expect(start.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ })).toBe(refYmd);
  });
});
