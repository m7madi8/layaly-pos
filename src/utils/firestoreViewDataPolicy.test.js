import {
  needsProductsListener,
  needsExpensesListener,
  needsCustomersListener,
  expensesListenerLimit,
} from './firestoreViewDataPolicy';

describe('firestoreViewDataPolicy', () => {
  it('does not load products on traders screen for admin', () => {
    expect(needsProductsListener('admin', 'traders')).toBe(false);
    expect(needsProductsListener('admin', 'pos')).toBe(true);
  });

  it('does not load expenses on dashboard or traders', () => {
    expect(needsExpensesListener('admin', 'dashboard')).toBe(false);
    expect(needsExpensesListener('admin', 'traders')).toBe(false);
    expect(needsExpensesListener('admin', 'purchases')).toBe(true);
    expect(needsExpensesListener('admin', 'cash')).toBe(true);
  });

  it('loads customers on pos, customers, and orders (not full list on reports)', () => {
    expect(needsCustomersListener('dashboard')).toBe(false);
    expect(needsCustomersListener('pos')).toBe(true);
    expect(needsCustomersListener('reports')).toBe(false);
    expect(needsCustomersListener('orders')).toBe(true);
  });

  it('loads enough expenses on traders for ledgers', () => {
    expect(expensesListenerLimit('traders')).toBe(800);
    expect(expensesListenerLimit('purchases')).toBe(800);
  });

  it('caps cash view expense listener below full ledger', () => {
    expect(expensesListenerLimit('cash')).toBe(350);
  });
});
