import {
  computeSupplierPayableFromExpenses,
  expenseCountsInReportTotals,
  isSupplierPaymentExpense,
  nextBalanceAfterPayment,
  sumReportExpenses,
  SUPPLIER_PAYMENT_CATEGORY,
  SUPPLIER_PAYMENT_SECTION,
  validateSupplierPaymentInput,
} from './supplierAccounting';
import { PURCHASE_CATEGORY } from '../expenseConfig';

describe('supplierAccounting', () => {
  const suppliers = [{ id: 's1', name: 'تاجر 1', balance: 100 }];

  test('computes payable from purchases minus payments', () => {
    const expenses = [
      { supplierId: 's1', section: 'purchase', category: PURCHASE_CATEGORY, amount: 200 },
      { supplierId: 's1', section: SUPPLIER_PAYMENT_SECTION, category: SUPPLIER_PAYMENT_CATEGORY, amount: 50 },
      { supplierId: 's1', section: 'operating', category: 'Salaries', amount: 999 },
    ];
    expect(computeSupplierPayableFromExpenses(expenses, 's1')).toBe(150);
  });

  test('supplier payment excluded from report expense totals', () => {
    const expenses = [
      { section: 'purchase', category: PURCHASE_CATEGORY, amount: 100 },
      { section: SUPPLIER_PAYMENT_SECTION, category: SUPPLIER_PAYMENT_CATEGORY, amount: 40 },
      { section: 'operating', category: 'Rent', amount: 10 },
    ];
    expect(sumReportExpenses(expenses)).toBe(110);
    expect(expenseCountsInReportTotals(expenses[1])).toBe(false);
    expect(isSupplierPaymentExpense(expenses[1])).toBe(true);
  });

  test('validates payment input', () => {
    expect(validateSupplierPaymentInput({ amount: 0, supplierId: 's1', suppliers }).ok).toBe(false);
    expect(validateSupplierPaymentInput({ amount: 10, supplierId: '', suppliers }).ok).toBe(false);
    expect(validateSupplierPaymentInput({ amount: 10, supplierId: 'missing', suppliers }).ok).toBe(false);
    const ok = validateSupplierPaymentInput({ amount: 25.5, supplierId: 's1', suppliers });
    expect(ok.ok).toBe(true);
    expect(ok.amount).toBe(25.5);
  });

  test('next balance after payment', () => {
    expect(nextBalanceAfterPayment(100, 30)).toBe(70);
  });
});
