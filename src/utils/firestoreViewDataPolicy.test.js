import {
  needsProductsListener,
  needsExpensesListener,
  needsCustomersListener,
} from './firestoreViewDataPolicy';

describe('firestoreViewDataPolicy', () => {
  it('does not load products on traders screen for admin', () => {
    expect(needsProductsListener('admin', 'traders')).toBe(false);
    expect(needsProductsListener('admin', 'pos')).toBe(true);
  });

  it('does not load expenses on dashboard', () => {
    expect(needsExpensesListener('admin', 'dashboard')).toBe(false);
    expect(needsExpensesListener('admin', 'cash')).toBe(true);
  });

  it('loads customers only on pos/customers/orders', () => {
    expect(needsCustomersListener('dashboard')).toBe(false);
    expect(needsCustomersListener('pos')).toBe(true);
  });
});
