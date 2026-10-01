export const FINANCE_TABS = [
  { id: 'operating', label: 'المصروفات' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'traders', label: 'التجار' },
];

export const OPERATING_EXPENSE_CATEGORIES = [
  { id: 'Salaries', label: 'رواتب' },
  { id: 'Rent', label: 'إيجار' },
  { id: 'Food', label: 'أكل' },
  { id: 'Advance', label: 'سلف' },
];

export const PURCHASE_CATEGORY = 'Purchase';

const PURCHASE_LEGACY_CATEGORIES = new Set(['Inventory', 'Purchase']);

export function resolveExpenseSection(expense) {
  if (expense?.section === 'purchase' || expense?.section === 'operating') {
    return expense.section;
  }
  if (PURCHASE_LEGACY_CATEGORIES.has(expense?.category)) {
    return 'purchase';
  }
  return 'operating';
}

export function defaultExpenseForm(section = 'operating') {
  const today = new Date().toISOString().split('T')[0];
  const base = {
    amount: '',
    date: today,
    description: '',
    supplierId: '',
    linkedIngredientId: '',
    linkedProductId: '',
    quantityBought: 0,
    section,
  };
  if (section === 'purchase') {
    return { ...base, category: PURCHASE_CATEGORY };
  }
  return { ...base, category: 'Salaries' };
}
