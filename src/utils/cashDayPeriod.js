import { CASH_DAY_START_HOUR } from './cashDayGate';

/**
 * مفتاح يوم الكاش المحلي: من CASH_DAY_START_HOUR حتى قبل نفس الساعة في اليوم التالي.
 * قبل ساعة البداية نُسند العملية ليوم الكاش السابق.
 */
export function getCashDayKey(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < CASH_DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** بداية فترة يوم الكاش (محلي) */
export function getCashDayRangeStart(cashDayKey) {
  const [y, m, d] = cashDayKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, CASH_DAY_START_HOUR, 0, 0, 0);
  return start;
}

/** نهاية فترة يوم الكاش = بداية اليوم التالي */
export function getCashDayRangeEnd(cashDayKey) {
  const start = getCashDayRangeStart(cashDayKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return end;
}

export function isTimestampInCashDay(ts, cashDayKey) {
  const ms = ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  if (!Number.isFinite(ms)) return false;
  const start = getCashDayRangeStart(cashDayKey).getTime();
  const end = getCashDayRangeEnd(cashDayKey).getTime();
  return ms >= start && ms < end;
}
