import { getLocalCalendarDayStart } from './dashboardCashSales';

/** Align report UI filters and Firestore order queries. */
export function getReportPeriodBounds(reportFilter, reportCustomDates = {}, reference = new Date()) {
  const todayStart = getLocalCalendarDayStart(reference);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayStart);
  yesterdayEnd.setMilliseconds(-1);
  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 6);
  const lastMonthStart = new Date(todayStart);
  lastMonthStart.setDate(lastMonthStart.getDate() - 29);

  switch (reportFilter) {
    case 'today':
      return { start: todayStart, end: null, label: 'اليوم (تقويم Hebron)' };
    case 'yesterday':
      return { start: yesterdayStart, end: yesterdayEnd, label: 'أمس (تقويم Hebron)' };
    case 'lastWeek':
      return { start: lastWeekStart, end: null, label: 'آخر 7 أيام (تقويم Hebron)' };
    case 'lastMonth':
      return { start: lastMonthStart, end: null, label: 'آخر 30 يوماً (تقويم Hebron)' };
    case 'custom': {
      if (reportCustomDates?.start && reportCustomDates?.end) {
        const [sY, sM, sD] = reportCustomDates.start.split('-').map(Number);
        const [eY, eM, eD] = reportCustomDates.end.split('-').map(Number);
        const start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
        const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
        return { start, end, label: 'فترة مخصصة (تقويم Hebron)' };
      }
      return { start: lastWeekStart, end: null, label: 'فترة مخصصة — حدّد التاريخين' };
    }
    case 'all':
    default:
      return { start: null, end: null, label: 'كل السجل (غير محمّل بالكامل)' };
  }
}

export function orderTimestampInReportPeriod(order, bounds) {
  if (!order?.timestamp || !bounds?.start) return bounds?.start == null;
  const d = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
  if (bounds.end) return d >= bounds.start && d <= bounds.end;
  return d >= bounds.start;
}
