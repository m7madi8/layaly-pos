import { CASH_DAY_START_HOUR } from './cashDayGate';
import { getCashDayKey, getCashDayRangeStart, isTimestampInCashDay } from './cashDayPeriod';

describe('getCashDayKey', () => {
  it('uses same calendar date after cash day start hour', () => {
    const d = new Date(2026, 9, 27, CASH_DAY_START_HOUR, 30, 0);
    expect(getCashDayKey(d)).toBe('2026-10-27');
  });

  it('assigns before-noon times to previous cash day', () => {
    const d = new Date(2026, 9, 27, CASH_DAY_START_HOUR - 1, 59, 0);
    expect(getCashDayKey(d)).toBe('2026-10-26');
  });
});

describe('isTimestampInCashDay', () => {
  it('includes afternoon on cash day', () => {
    const key = '2026-10-27';
    const ts = new Date(2026, 9, 27, 15, 0, 0);
    expect(isTimestampInCashDay(ts, key)).toBe(true);
  });

  it('excludes afternoon after cash day ends', () => {
    const key = '2026-10-27';
    const ts = new Date(2026, 9, 28, CASH_DAY_START_HOUR + 1, 0, 0);
    expect(isTimestampInCashDay(ts, key)).toBe(false);
  });
});

describe('getCashDayRangeStart', () => {
  it('starts at configured hour', () => {
    const start = getCashDayRangeStart('2026-10-27');
    expect(start.getHours()).toBe(CASH_DAY_START_HOUR);
    expect(start.getDate()).toBe(27);
  });
});
