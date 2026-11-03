import { getLocalCalendarDayStart } from './dashboardCashSales';

export const ORDERS_PAGE_SIZE = 30;
export const ORDERS_DASHBOARD_LIMIT = 250;
export const ORDERS_REPORTS_LIMIT = 400;
export const ORDERS_EMPLOYEE_POS_LIMIT = 80;

function startOfYesterday(reference = new Date()) {
  const today = getLocalCalendarDayStart(reference);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  return y;
}

function startOfLastWeek(reference = new Date()) {
  const today = getLocalCalendarDayStart(reference);
  const w = new Date(today);
  w.setDate(w.getDate() - 7);
  return w;
}

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
    const todayStart = getLocalCalendarDayStart();
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 29);

    if (reportFilter === 'lastMonth' || reportFilter === 'all') {
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
    if (reportFilter === 'custom' && reportCustomDates?.start && reportCustomDates?.end) {
      const startDate = new Date(reportCustomDates.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(reportCustomDates.end);
      endDate.setHours(23, 59, 59, 999);
      return {
        mode: 'reports-custom',
        queryLimit: ORDERS_REPORTS_LIMIT,
        q: query(
          col,
          where('timestamp', '>=', toTimestamp(Timestamp, startDate)),
          where('timestamp', '<=', toTimestamp(Timestamp, endDate)),
          orderBy('timestamp', 'desc'),
          limit(ORDERS_REPORTS_LIMIT)
        ),
      };
    }
    const weekStart = startOfLastWeek();
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
    const weekStart = startOfLastWeek();
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
      const yStart = startOfYesterday();
      const yEnd = new Date(todayStart);
      yEnd.setMilliseconds(-1);
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
      const weekStart = startOfLastWeek();
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
