import { computeExpectedCash, summarizeMovements } from './cashShiftMath';
import { serializeCartItem } from './openBillCart';

describe('cashShiftMath', () => {
  test('expected cash formula', () => {
    expect(
      computeExpectedCash({
        openingBalance: 1000,
        cashSales: 500,
        cashDeposits: 0,
        cashWithdrawals: 0,
        cashRefunds: 0,
      })
    ).toBe(1500);

    expect(
      computeExpectedCash({
        openingBalance: 1500,
        cashSales: 0,
        cashWithdrawals: 500,
      })
    ).toBe(1000);
  });

  test('mixed payment only counts cash portion via sale movement', () => {
    const summary = summarizeMovements([
      { type: 'sale', amount: 40 },
      { type: 'withdrawal', amount: 10 },
    ]);
    expect(summary.cashSales).toBe(40);
    expect(summary.cashWithdrawals).toBe(10);
    expect(
      computeExpectedCash({
        openingBalance: 100,
        ...summary,
      })
    ).toBe(130);
  });
});

describe('openBillCart serializeCartItem', () => {
  test('keeps weight and price snapshot', () => {
    const line = serializeCartItem({
      id: 'p1',
      name: 'معسل',
      productType: 'weight',
      pricingType: 'weight',
      weightGrams: 20,
      price: 10,
      cost: 2,
      quantity: 1,
      cartItemId: 'w-1',
    });
    expect(line.weightGrams).toBe(20);
    expect(line.price).toBe(10);
    expect(line.cartItemId).toBe('w-1');
  });

  test('keeps sessionId for playstation', () => {
    const line = serializeCartItem({
      id: 'ps',
      name: 'بلايستيشن',
      productType: 'time',
      sessionId: 's1',
      durationMinutes: 30,
      billableMinutes: 30,
      price: 6,
      quantity: 1,
      cartItemId: 't-1',
    });
    expect(line.sessionId).toBe('s1');
    expect(line.durationMinutes).toBe(30);
  });
});
