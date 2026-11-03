import { getLocalCalendarDayStart } from './dashboardCashSales';
import { getReportPeriodBounds } from './reportPeriodBounds';

export const ORDERS_PAGE_SIZE = 30;
export const ORDERS_DASHBOARD_LIMIT = 250;
export const ORDERS_REPORTS_LIMIT = 400;
export const ORDERS_EMPLOYEE_POS_LIMIT = 80;

function toTimestamp(Timestamp, date) {
  if (!date) return null;
  return Timestamp.fromDate(date instanceof Date ? date : new Date(date));
}

/**
 * Returns Firestore query spec for orders listener, or null when orders should not load.
 */
export function resolveOrdersQuerySpec({
  uid,
  userRole,
  currentView,
  orderFilter = 'today',
  reportFilter = 'today',
  reportCustomDates = {},
  customDateRange = {},
  Timestamp,
  collection,
  query,
  orderBy,
  where,
  limit,
  db,
}) {
  if (!uid || !userRole || !Timestamp) return null;

  const col = collection(db, 'users', uid, 'orders');
  const todayStart = getLocalCalendarDayStart();

  const adminNeeds =
    userRole === 'admin' &&
    ['dashboard', 'orders', 'reports', 'customers'].includes(currentView);
  const employeeNeeds =
    userRole === 'employee' && ['orders', 'pos'].includes(currentView);

  if (!adminNeeds && !employeeNeeds) return null;

  if (userRole === 'admin' && currentView === 'dashboard') {
    return {
      mode: 'dashboard-today',
      queryLimit: ORDERS_DASHBOARD_LIMIT,
      q: query(
        col,
        where('timestamp', '>=', toTimestamp(Timestamp, todayStart)),
        orderBy('timestamp', 'desc'),
        limit(ORDERS_DASHBOARD_LIMIT)
      ),
    };
  }

  if (userRole === 'admin' && currentView === 'reports') {
    const bounds = getReportPeriodBounds(reportFilter, reportCustomDates);
    if (reportFilter === 'lastMonth' || reportFilter === 'all') {
      const monthStart = bounds.start || getLocalCalendarDayStart();
      return {
        mode: 'reports-month',
        queryLimit: ORDERS_REPORTS_LIMIT,
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, monthStart)),
          orderBy('timestamp', 'desc'),
          limit(ORDERS_REPORTS_LIMIT)
        ),
      };
    }
    if (reportFilter === 'custom' && bounds.start && bounds.end) {
      return {
        mode: 'reports-custom',
        queryLimit: ORDERS_REPORTS_LIMIT,
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, bounds.start)),
          where('timestamp', '<=', toTimestamp(Timestamp, bounds.end)),
          orderBy('timestamp', 'desc'),
          limit(ORDERS_REPORTS_LIMIT)
        ),
      };
    }
    const weekStart = bounds.start || getLocalCalendarDayStart();
    return {
      mode: 'reports-week',
      queryLimit: ORDERS_REPORTS_LIMIT,
      q: query(
        col,
        where('timestamp', '>=', toTimestamp(Timestamp, weekStart)),
        orderBy('timestamp', 'desc'),
        limit(ORDERS_REPORTS_LIMIT)
      ),
    };
  }

  if (currentView === 'customers') {
    const weekStart = getReportPeriodBounds('lastWeek').start;
    return {
      mode: 'customers-statements',
      q: query(
        col,
        where('timestamp', '>=', toTimestamp(Timestamp, weekStart)),
        orderBy('timestamp', 'desc'),
        limit(ORDERS_REPORTS_LIMIT)
      ),
    };
  }

  if (userRole === 'employee' && currentView === 'pos') {
    return {
      mode: 'employee-pos-recent',
      q: query(col, orderBy('timestamp', 'desc'), limit(ORDERS_EMPLOYEE_POS_LIMIT)),
    };
  }

  if (currentView !== 'orders') return null;

  switch (orderFilter) {
    case 'today':
      return {
        mode: 'orders-today',
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, todayStart)),
          orderBy('timestamp', 'desc'),
          limit(200)
        ),
      };
    case 'yesterday': {
      const bounds = getReportPeriodBounds('yesterday');
      const yStart = bounds.start;
      const yEnd = bounds.end;
      return {
        mode: 'orders-yesterday',
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, yStart)),
          where('timestamp', '<=', toTimestamp(Timestamp, yEnd)),
          orderBy('timestamp', 'desc'),
          limit(200)
        ),
      };
    }
    case 'lastWeek': {
      const weekStart = getReportPeriodBounds('lastWeek').start;
      return {
        mode: 'orders-week',
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, weekStart)),
          orderBy('timestamp', 'desc'),
          limit(ORDERS_REPORTS_LIMIT)
        ),
      };
    }
    case 'custom': {
      const { start, end } = customDateRange || {};
      if (start && end) {
        const startDate = new Date(start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        return {
          mode: 'orders-custom',
          q: query(
            col,
            where('timestamp', '>=', toTimestamp(Timestamp, startDate)),
            where('timestamp', '<=', toTimestamp(Timestamp, endDate)),
            orderBy('timestamp', 'desc'),
            limit(500)
          ),
        };
      }
      return {
        mode: 'orders-custom-open',
        q: query(col, orderBy('timestamp', 'desc'), limit(ORDERS_PAGE_SIZE)),
      };
    }
    case 'all':
    default:
      return {
        mode: 'orders-page',
        q: query(col, orderBy('timestamp', 'desc'), limit(ORDERS_PAGE_SIZE)),
      };
  }
}

export function mapOrderSnapshot(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
