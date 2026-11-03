import { ORDERS_REPORTS_LIMIT } from './firestoreOrderQueries';

/** Whether the active report period may exceed the Firestore orders window loaded in memory. */
export function reportsPeriodExceedsLoadedWindow(reportFilter) {
  switch (reportFilter) {
    case 'today':
    case 'yesterday':
    case 'lastWeek':
      return false;
    case 'lastMonth':
    case 'all':
    case 'custom':
      return true;
    default:
      return false;
  }
}

export function shouldWarnReportsPartialTotals({
  reportFilter,
  ordersLoadedCount,
  ordersQueryLimit = ORDERS_REPORTS_LIMIT,
}) {
  if (reportFilter === 'all') return true;
  if (ordersLoadedCount >= ordersQueryLimit) return true;
  if (reportsPeriodExceedsLoadedWindow(reportFilter) && ordersLoadedCount >= ordersQueryLimit * 0.95) {
    return true;
  }
  if (reportFilter === 'lastMonth' || reportFilter === 'custom') {
    return ordersLoadedCount >= ordersQueryLimit;
  }
  return false;
}
