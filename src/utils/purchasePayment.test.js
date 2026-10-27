import {
  normalizePurchasePaymentMethod,
  purchaseIncreasesSupplierDebt,
  PURCHASE_PAYMENT_CASH,
  PURCHASE_PAYMENT_DEBT,
} from './purchasePayment';
import { computeSupplierPayableFromExpenses } from './supplierAccounting';
import { PURCHASE_CATEGORY } from '../expenseConfig';

describe('purchasePayment', () => {
  test('cash purchase does not increase supplier payable', () => {
    const expenses = [
      {
        supplierId: 's1',
        section: 'purchase',
        category: PURCHASE_CATEGORY,
        amount: 100,
        paymentMethod: PURCHASE_PAYMENT_CASH,
      },
      {
        supplierId: 's1',
        section: 'purchase',
        category: PURCHASE_CATEGORY,
        amount: 50,
        paymentMethod: PURCHASE_PAYMENT_DEBT,
      },
    ];
    expect(computeSupplierPayableFromExpenses(expenses, 's1')).toBe(50);
    expect(purchaseIncreasesSupplierDebt(expenses[0])).toBe(false);
    expect(purchaseIncreasesSupplierDebt(expenses[1])).toBe(true);
  });

  test('legacy purchase without method counts as debt', () => {
    const e = { section: 'purchase', category: PURCHASE_CATEGORY, amount: 80 };
    expect(normalizePurchasePaymentMethod(undefined)).toBe(PURCHASE_PAYMENT_DEBT);
    expect(purchaseIncreasesSupplierDebt(e)).toBe(true);
  });
});
