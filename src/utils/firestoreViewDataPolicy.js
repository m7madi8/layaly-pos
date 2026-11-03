/** Centralized rules for when each collection should attach a realtime listener. */

export const ADMIN_PRODUCT_VIEWS = [
  'dashboard',
  'pos',
  'inventory',
  'reports',
  'settings',
  'expenses',
];

export const EMPLOYEE_PRODUCT_VIEWS = ['pos'];

export function needsProductsListener(userRole, currentView) {
  if (!userRole || !currentView) return false;
  if (userRole === 'employee') return EMPLOYEE_PRODUCT_VIEWS.includes(currentView);
  if (userRole === 'admin') return ADMIN_PRODUCT_VIEWS.includes(currentView);
  return false;
}

export function needsStaffListener(userRole, currentView) {
  if (!userRole || !currentView) return false;
  if (userRole === 'admin') {
    return ['settings', 'expenses', 'pos', 'dashboard', 'cash', 'purchases'].includes(currentView);
  }
  if (userRole === 'employee') {
    return ['expenses', 'pos', 'cash'].includes(currentView);
  }
  return false;
}

export const ADMIN_EXPENSE_VIEWS = ['expenses', 'purchases', 'traders', 'reports', 'cash'];

export function needsExpensesListener(userRole, currentView) {
  if (!isFinanceRole(userRole)) return false;
  if (userRole === 'admin') return ADMIN_EXPENSE_VIEWS.includes(currentView);
  return ['expenses', 'purchases', 'traders'].includes(currentView);
}

export function needsSuppliersListener(userRole, currentView) {
  if (!isFinanceRole(userRole)) return false;
  if (userRole === 'admin') {
    return ['purchases', 'traders', 'expenses', 'cash'].includes(currentView);
  }
  return ['purchases', 'traders', 'expenses'].includes(currentView);
}

/** Expense snapshot limit — traders/purchases need full ledger for merchant balances. */
export function expensesListenerLimit(currentView) {
  if (currentView === 'reports' || currentView === 'cash') return 800;
  if (currentView === 'expenses') return 400;
  if (currentView === 'purchases' || currentView === 'traders') return 800;
  return 120;
}

export const CUSTOMER_LIST_VIEWS = ['pos', 'customers', 'orders', 'reports'];

export function needsCustomersListener(currentView) {
  return CUSTOMER_LIST_VIEWS.includes(currentView);
}

function isFinanceRole(userRole) {
  return userRole === 'admin' || userRole === 'employee';
}
