const { computeExpectedCash } = require('../../functions/lib/cashShiftMath');

describe('cashShiftMath (functions)', () => {
  test('expected = opening + sales + deposits - withdrawals - refunds', () => {
    expect(
      computeExpectedCash({
        openingBalance: 100,
        cashSales: 40,
        cashDeposits: 10,
        cashWithdrawals: 15,
        cashRefunds: 5,
      })
    ).toBe(130);
  });
});
