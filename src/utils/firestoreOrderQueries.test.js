import {
  resolveOrdersQuerySpec,
  resolveEmployeePosOpenOrdersSpec,
  mergeOrdersById,
  ORDERS_PAGE_SIZE,
  ORDERS_DASHBOARD_LIMIT,
  ORDERS_EMPLOYEE_OPEN_PAGE,
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

  it('scopes employee POS orders to today', () => {
    const spec = resolveOrdersQuerySpec({
      ...mockApis(),
      userRole: 'employee',
      currentView: 'pos',
    });
    expect(spec.mode).toBe('employee-pos-today');
    const w = spec.q.parts.find((p) => p.type === 'where');
    expect(w.f).toBe('timestamp');
    expect(w.op).toBe('>=');
  });

  it('adds supplemental open-order listener for employee POS', () => {
    const spec = resolveEmployeePosOpenOrdersSpec({
      ...mockApis(),
      userRole: 'employee',
      currentView: 'pos',
    });
    expect(spec.mode).toBe('employee-pos-open');
    expect(spec.q.parts.find((p) => p.type === 'limit')).toBeUndefined();
    const w = spec.q.parts.find((p) => p.type === 'where' && p.f === 'status');
    expect(w.op).toBe('in');
  });
});

describe('mergeOrdersById', () => {
  it('dedupes and prefers primary snapshot rows', () => {
    const merged = mergeOrdersById(
      [{ id: 'a', total: 2, timestamp: { toDate: () => new Date(2000) } }],
      [{ id: 'a', total: 1, timestamp: { toDate: () => new Date(1000) } }, { id: 'b', total: 3, timestamp: { toDate: () => new Date(3000) } }]
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((o) => o.id === 'a').total).toBe(2);
  });
});
