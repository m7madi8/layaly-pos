import { suggestedLineRefundAmount } from './partialReturnRefund';

describe('partialReturnRefund', () => {
  test('pro-rata from unit price', () => {
    expect(suggestedLineRefundAmount({ price: 10, quantity: 2 }, 1)).toBe(10);
  });

  test('pro-rata from lineTotal', () => {
    expect(suggestedLineRefundAmount({ lineTotal: 30, quantity: 3 }, 1)).toBe(10);
  });
});
