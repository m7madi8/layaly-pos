export function computeExpectedCash({
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

export function summarizeMovements(movements = []) {
  let cashSales = 0;
  let cashWithdrawals = 0;
  let cashDeposits = 0;
  let cashRefunds = 0;
  for (const m of movements) {
    const amount = Number(m.amount) || 0;
    if (m.type === 'sale') cashSales += amount;
    else if (m.type === 'withdrawal') cashWithdrawals += amount;
    else if (m.type === 'deposit') cashDeposits += amount;
    else if (m.type === 'refund') cashRefunds += amount;
  }
  return {
    cashSales: Math.round(cashSales * 100) / 100,
    cashWithdrawals: Math.round(cashWithdrawals * 100) / 100,
    cashDeposits: Math.round(cashDeposits * 100) / 100,
    cashRefunds: Math.round(cashRefunds * 100) / 100,
  };
}
