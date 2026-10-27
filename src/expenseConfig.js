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
  { id: 'SupplierPayment', label: 'صرف للتاجر' },
  { id: 'EmployeeBenefit', label: 'استفادة الموظفين' },
];

export const PURCHASE_CATEGORY = 'Purchase';

const PURCHASE_LEGACY_CATEGORIES = new Set(['Inventory', 'Purchase']);

export function resolveExpenseSection(expense) {
  if (expense?.section === 'employee_benefit') return 'operating';
  if (expense?.section === 'supplier_payment') return 'operating';
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
    paymentMethod: 'Cash',
    notes: '',
    section,
  };
  if (section === 'purchase') {
    return { ...base, category: PURCHASE_CATEGORY };
  }
  if (section === 'supplier_payment') {
    return { ...base, section: 'supplier_payment', category: 'SupplierPayment' };
  }
  if (section === 'employee_benefit') {
    return {
      ...base,
      section: 'employee_benefit',
      category: 'EmployeeBenefit',
      staffMemberId: '',
      benefitType: 'cash',
      inventoryLines: [],
      override: false,
      overrideReason: '',
    };
  }
  return { ...base, category: 'Salaries' };
}

export function isEmployeeBenefitForm(form) {
  return form?.section === 'employee_benefit' || form?.category === 'EmployeeBenefit';
}

export function isSupplierPaymentForm(form) {
  return form?.section === 'supplier_payment' || form?.category === 'SupplierPayment';
}
