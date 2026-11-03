import {
  resolveOrdersQuerySpec,
  ORDERS_PAGE_SIZE,
  ORDERS_DASHBOARD_LIMIT,
} from './firestoreOrderQueries';
import { getLocalCalendarDayStart } from './dashboardCashSales';

const mockApis = () => ({
  uid: 'u1',
  userRole: 'admin',
  currentView: 'dashboard',
  orderFilter: 'today',
  customDateRange: {},
  Timestamp: {
    fromDate: (d) => ({ __ts: d.getTime() }),
  },
  db: {},
  collection: (_db, ...p) => ({ path: p.join('/') }),
  query: (...parts) => ({ parts }),
  orderBy: (f, d) => ({ type: 'orderBy', f, d }),
  where: (f, op, v) => ({ type: 'where', f, op, v }),
  limit: (n) => ({ type: 'limit', n }),
});

describe('resolveOrdersQuerySpec', () => {
  it('returns today-scoped dashboard query', () => {
    const spec = resolveOrdersQuerySpec({ ...mockApis(), currentView: 'dashboard' });
    expect(spec.mode).toBe('dashboard-today');
    const lim = spec.q.parts.find((p) => p.type === 'limit');
    expect(lim.n).toBe(ORDERS_DASHBOARD_LIMIT);
    const w = spec.q.parts.find((p) => p.type === 'where');
    expect(w.f).toBe('timestamp');
    expect(w.op).toBe('>=');
    expect(w.v.__ts).toBe(getLocalCalendarDayStart().getTime());
  });

  it('returns paginated query for orders-all', () => {
    const spec = resolveOrdersQuerySpec({
      ...mockApis(),
      currentView: 'orders',
      orderFilter: 'all',
    });
    expect(spec.mode).toBe('orders-page');
    expect(spec.q.parts.find((p) => p.type === 'limit').n).toBe(ORDERS_PAGE_SIZE);
  });

  it('skips settings view', () => {
    const spec = resolveOrdersQuerySpec({
      ...mockApis(),
      currentView: 'settings',
    });
    expect(spec).toBeNull();
  });
});
