import {
  computeTotalOutstandingCustomerDebt,
  countCustomersWithOutstandingDebt,
} from './customerAccounting';

describe('customerAccounting', () => {
  test('sums only customers with open debt', () => {
    const customers = [
      { id: 'a', balance: 100 },
      { id: 'b', balance: 200 },
      { id: 'c', balance: 50 },
      { id: 'd', balance: 0 },
      { id: 'e', balance: -10 },
    ];
    expect(computeTotalOutstandingCustomerDebt(customers)).toBe(350);
    expect(countCustomersWithOutstandingDebt(customers)).toBe(3);
  });

  test('user expected example balances 100, 150, 0, 0, 0 => 250', () => {
    const customers = [
      { id: '1', balance: 100 },
      { id: '2', balance: 150 },
      { id: '3', balance: 0 },
      { id: '4', balance: 0 },
      { id: '5', balance: 0 },
    ];
    expect(computeTotalOutstandingCustomerDebt(customers)).toBe(250);
    expect(countCustomersWithOutstandingDebt(customers)).toBe(2);
  });

  test('ignores zero and negative balances', () => {
    expect(computeTotalOutstandingCustomerDebt([])).toBe(0);
    expect(
      computeTotalOutstandingCustomerDebt([
        { balance: 0 },
        { balance: null },
        { balance: -5 },
      ])
    ).toBe(0);
  });

  test('rounds to two decimals', () => {
    expect(
      computeTotalOutstandingCustomerDebt([
        { balance: 10.005 },
        { balance: 20.004 },
      ])
    ).toBe(30.01);
  });
});
