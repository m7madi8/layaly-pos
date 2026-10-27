import {
  isOrderMarkedAsTest,
  buildTestRemovalPreview,
  TEST_DATA_NOTES_MARKER,
} from './testDataRemovalLogic';

describe('testDataRemovalLogic (client)', () => {
  test('real sales never appear without marker', () => {
    const preview = buildTestRemovalPreview({
      orders: [
        { id: 'r1', orderNumber: '0100', total: 100, status: 'paid', items: [] },
        { id: 'r2', orderNumber: '0101', total: 50, status: 'paid', items: [] },
      ],
      sessions: [],
      customersById: new Map(),
      cashMovements: [],
      shiftsById: new Map(),
      registryOrderIds: new Set(),
      registrySessionIds: new Set(),
    });
    expect(preview.eligibleOrderIds).toHaveLength(0);
  });

  test('notes marker qualifies order', () => {
    expect(
      isOrderMarkedAsTest({ id: 'x', notes: `اختبار ${TEST_DATA_NOTES_MARKER}` }, new Set())
    ).toBe(true);
  });
});
