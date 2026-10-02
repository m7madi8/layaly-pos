import { effectiveDebt, debtDeltasByCustomer, replaceOrderDebtEntry, diffOrders } from './orderAccounting';

const debtOrder = (amount, extra = {}) => ({ customerId: 'c1', debtAmount: amount, status: 'unpaid', orderNumber: '0010', ...extra });

describe('effectiveDebt', () => {
  test('debt order', () => expect(effectiveDebt(debtOrder(50))).toBe(50));
  test('cancelled order has no effect', () => expect(effectiveDebt(debtOrder(50, { status: 'cancelled' }))).toBe(0));
  test('guest order has no effect', () => expect(effectiveDebt({ debtAmount: 50 })).toBe(0));
  test('null', () => expect(effectiveDebt(null)).toBe(0));
});

describe('debtDeltasByCustomer — edit reverses old then applies new', () => {
  test('editing 50 debt without change → no balance change (no duplicate debt)', () =>
    expect(debtDeltasByCustomer(debtOrder(50), debtOrder(50))).toEqual({}));
  test('debt 50 → 30', () => expect(debtDeltasByCustomer(debtOrder(50), debtOrder(30))).toEqual({ c1: -20 }));
  test('debt → cash', () =>
    expect(debtDeltasByCustomer(debtOrder(50), debtOrder(0, { status: 'paid' }))).toEqual({ c1: -50 }));
  test('cash → debt', () =>
    expect(debtDeltasByCustomer(debtOrder(0, { status: 'paid' }), debtOrder(40))).toEqual({ c1: 40 }));
  test('partial: debt part 30 → 10', () =>
    expect(debtDeltasByCustomer(debtOrder(30, { status: 'partial' }), debtOrder(10, { status: 'partial' }))).toEqual({ c1: -20 }));
  test('customer changed: old customer reversed, new customer charged', () =>
    expect(debtDeltasByCustomer(debtOrder(50), debtOrder(50, { customerId: 'c2' }))).toEqual({ c1: -50, c2: 50 }));
  test('cancel = old reversed', () => expect(debtDeltasByCustomer(debtOrder(50), null)).toEqual({ c1: -50 }));
  test('editing a cancelled order applies only the new debt', () =>
    expect(debtDeltasByCustomer(debtOrder(50, { status: 'cancelled' }), debtOrder(20))).toEqual({ c1: 20 }));
  test('new order', () => expect(debtDeltasByCustomer(null, debtOrder(25))).toEqual({ c1: 25 }));
});

describe('replaceOrderDebtEntry', () => {
  const txs = [
    { id: 'a', type: 'legacy_debt', amount: 100 },
    { id: 'b', type: 'order_debt', orderNumber: '0010', amount: 50 },
    { id: 'c', type: 'order_debt', orderNumber: '0011', amount: 5 },
  ];
  test('replaces entry of same order', () => {
    const out = replaceOrderDebtEntry(txs, '0010', { id: 'd', type: 'order_debt', orderNumber: '0010', amount: 30 });
    expect(out.map((t) => t.id)).toEqual(['a', 'c', 'd']);
  });
  test('removes entry when no debt remains', () =>
    expect(replaceOrderDebtEntry(txs, '0010', null).map((t) => t.id)).toEqual(['a', 'c']));
  test('keeps legacy debt untouched', () =>
    expect(replaceOrderDebtEntry(txs, '0011', null).some((t) => t.type === 'legacy_debt')).toBe(true));
});

describe('diffOrders', () => {
  const base = {
    customer: 'أحمد',
    paymentMethod: 'Debt',
    subtotal: 20,
    discountAmount: 0,
    total: 20,
    cashPaid: 0,
    debtAmount: 20,
    notes: '',
    items: [{ id: 'p1', name: 'قهوة', quantity: 2, price: 10 }],
  };
  test('quantity and total change', () => {
    const changes = diffOrders(base, {
      ...base,
      subtotal: 30,
      total: 30,
      debtAmount: 30,
      items: [{ id: 'p1', name: 'قهوة', quantity: 3, price: 10 }],
    });
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'كمية قهوة', from: 2, to: 3 }),
        expect.objectContaining({ field: 'total', from: 20, to: 30 }),
      ])
    );
  });
  test('added and removed items', () => {
    const changes = diffOrders(base, { ...base, items: [{ id: 'p2', name: 'شاي', quantity: 1, price: 5 }] });
    expect(changes.map((c) => c.label)).toEqual(expect.arrayContaining(['صنف مضاف: شاي', 'صنف محذوف: قهوة']));
  });
  test('no changes', () => expect(diffOrders(base, { ...base })).toEqual([]));
});
