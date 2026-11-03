import { ORDERS_REPORTS_LIMIT } from './firestoreOrderQueries';
import { getReportPeriodBounds } from './reportPeriodBounds';

export function reportsPeriodExceedsLoadedWindow(reportFilter) {
  return reportFilter === 'all';
}

export function shouldWarnReportsPartialTotals({
  reportFilter,
  ordersLoadedCount,
  ordersQueryLimit = ORDERS_REPORTS_LIMIT,
}) {
  if (reportFilter === 'all') return true;
  if (ordersLoadedCount >= ordersQueryLimit) return true;
  return false;
}

/** User-facing coverage summary for the reports screen. */
export function describeReportDataCoverage({
  reportFilter,
  reportCustomDates,
  ordersLoadedCount,
  ordersQueryLimit = ORDERS_REPORTS_LIMIT,
  expensesLoadedCount,
  expensesQueryLimit = 800,
}) {
  const bounds = getReportPeriodBounds(reportFilter, reportCustomDates);
  const ordersCapped = ordersLoadedCount >= ordersQueryLimit;
  const expensesCapped = expensesLoadedCount >= expensesQueryLimit;
  const partial = shouldWarnReportsPartialTotals({
    reportFilter,
    ordersLoadedCount,
    ordersQueryLimit,
  });

  return {
    bounds,
    partial,
    ordersCapped,
    expensesCapped,
    ordersLoadedCount,
    ordersQueryLimit,
    message: partial
      ? reportFilter === 'all'
        ? 'فلتر «الكل» لا يحمّل السجل الكامل — الأرقام جزئية حتى تُقيّد الفترة أو تُحمَّل المزيد من الطلبات.'
        : ordersCapped
          ? `تم بلوغ حد ${ordersQueryLimit} طلباً للفترة «${bounds.label}» — الإجماليات قد تكون ناقصة.`
          : 'قد تكون بعض الإجماليات جزئية — راجع عدد الطلبات المحمّلة.'
      : null,
    expensesNote:
      expensesCapped && reportFilter !== 'today'
        ? `المصروفات: ${expensesLoadedCount} سجل (حد ${expensesQueryLimit}) — قد لا تشمل كامل الفترة.`
        : null,
  };
}
