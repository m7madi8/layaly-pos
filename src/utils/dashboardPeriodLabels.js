import { getCashDayKey } from './cashDayPeriod';
import { CASH_DAY_START_HOUR } from './cashDayGate';
import { getLocalCalendarDayStart } from './dashboardCashSales';
import { BUSINESS_TZ } from './businessTimezone';

/** Labels for dashboard — calendar day vs cash business day (no logic change to cash day). */
export function getDashboardPeriodLabels(reference = new Date()) {
  const calendarStart = getLocalCalendarDayStart(reference);
  const calendarYmd = calendarStart.toLocaleDateString('ar-EG', {
    timeZone: BUSINESS_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const cashDayKey = getCashDayKey(reference);
  return {
    calendarYmd,
    calendarStart,
    cashDayKey,
    cashDayStartHour: CASH_DAY_START_HOUR,
    calendarNote: `أرقام «كاش اليوم» و«دين اليوم» = طلبات من ${calendarYmd} (00:00–23:59 ${BUSINESS_TZ}).`,
    cashDayNote: `يوم الكاش المالي (إغلاق الشفت / الاستفادات): ${cashDayKey} — يبدأ الساعة ${CASH_DAY_START_HOUR}:00 ${BUSINESS_TZ}.`,
  };
}
