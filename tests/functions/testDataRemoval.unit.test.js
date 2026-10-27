const {
  isOrderMarkedAsTest,
  isSessionMarkedAsTest,
  buildTestRemovalPreview,
  TEST_DATA_NOTES_MARKER,
} = require('../../functions/lib/testDataRemovalLogic');

describe('testDataRemovalLogic', () => {
  test('marks order via isTestData, registry, or notes marker', () => {
    const reg = new Set(['o2']);
    expect(isOrderMarkedAsTest({ id: 'o1', isTestData: true }, reg)).toBe(true);
    expect(isOrderMarkedAsTest({ id: 'o2' }, reg)).toBe(true);
    expect(isOrderMarkedAsTest({ id: 'o3', notes: `بيع ${TEST_DATA_NOTES_MARKER}` }, reg)).toBe(true);
    expect(isOrderMarkedAsTest({ id: 'o4', notes: 'حقيقي' }, reg)).toBe(false);
    expect(isOrderMarkedAsTest({ id: 'o1', isTestData: true, testDataPurgedAt: 1 }, reg)).toBe(false);
  });

  test('preview excludes orders on closed shift cash', () => {
    const orders = [
      { id: 't1', orderNumber: '0001', total: 50, status: 'paid', cashPaid: 50, items: [] },
      { id: 'real', orderNumber: '0002', total: 10, status: 'paid', items: [] },
    ];
    orders[0].isTestData = true;
    const preview = buildTestRemovalPreview({
      orders,
      sessions: [],
      customersById: new Map(),
      cashMovements: [{ id: 'm1', orderId: 't1', shiftId: 's1', type: 'sale', amount: 50 }],
      shiftsById: new Map([['s1', { id: 's1', status: 'closed' }]]),
      registryOrderIds: new Set(),
      registrySessionIds: new Set(),
    });
    expect(preview.eligibleOrderIds).not.toContain('t1');
    expect(preview.conflicts.some((c) => c.code === 'cash_on_closed_shift')).toBe(true);
  });

  test('preview includes test order with open shift and no stock fields touched', () => {
    const orders = [{ id: 't1', isTestData: true, orderNumber: '0003', total: 20, status: 'paid', cashPaid: 20, items: [] }];
    const preview = buildTestRemovalPreview({
      orders,
      sessions: [],
      customersById: new Map(),
      cashMovements: [{ id: 'm1', orderId: 't1', shiftId: 's1', type: 'sale', amount: 20 }],
      shiftsById: new Map([['s1', { id: 's1', status: 'open' }]]),
      registryOrderIds: new Set(),
      registrySessionIds: new Set(),
    });
    expect(preview.eligibleOrderIds).toEqual(['t1']);
    expect(preview.counts.productOrders).toBe(1);
  });

  test('session marked isTestData appears in eligible sessions when not active', () => {
    const preview = buildTestRemovalPreview({
      orders: [],
      sessions: [{ id: 'ps1', isTestData: true, status: 'ended', billed: false }],
      customersById: new Map(),
      cashMovements: [],
      shiftsById: new Map(),
      registryOrderIds: new Set(),
      registrySessionIds: new Set(),
    });
    expect(preview.eligibleSessionIds).toContain('ps1');
  });

  test('active test session is conflict not eligible', () => {
    const preview = buildTestRemovalPreview({
      orders: [],
      sessions: [{ id: 'ps1', isTestData: true, status: 'active' }],
      customersById: new Map(),
      cashMovements: [],
      shiftsById: new Map(),
      registryOrderIds: new Set(),
      registrySessionIds: new Set(),
    });
    expect(preview.eligibleSessionIds).not.toContain('ps1');
    expect(preview.conflicts.some((c) => c.code === 'ps_session_active')).toBe(true);
  });
});
