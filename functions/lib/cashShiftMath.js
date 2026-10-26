function computeExpectedCash({
  openingBalance = 0,
  cashSales = 0,
  cashDeposits = 0,
  cashWithdrawals = 0,
  cashRefunds = 0,
} = {}) {
  const expected =
    Number(openingBalance || 0) +
    Number(cashSales || 0) +
    Number(cashDeposits || 0) -
    Number(cashWithdrawals || 0) -
    Number(cashRefunds || 0);
  return Math.round(expected * 100) / 100;
}

module.exports = { computeExpectedCash };
