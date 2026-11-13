import {
  resolvePaymentSourceFromForm,
  assertExpensePaymentSourceSelected,
  expensePaymentSourceLabel,
  PAYMENT_SOURCE_DRAWER,
  PAYMENT_SOURCE_VAULT,
  paymentSourceToLegacyMethod,
  legacyMethodToPaymentSource,
} from './expensePaymentSource';

describe('expensePaymentSource', () => {
  test('resolvePaymentSourceFromForm prefers paymentSource', () => {
    expect(
      resolvePaymentSourceFromForm({ paymentSource: PAYMENT_SOURCE_VAULT, paymentMethod: 'Cash' })
    ).toBe(PAYMENT_SOURCE_VAULT);
  });

  test('resolvePaymentSourceFromForm falls back to paymentMethod', () => {
    expect(resolvePaymentSourceFromForm({ paymentMethod: 'Vault' })).toBe(PAYMENT_SOURCE_VAULT);
    expect(resolvePaymentSourceFromForm({ paymentMethod: 'Cash' })).toBe(PAYMENT_SOURCE_DRAWER);
  });

  test('assertExpensePaymentSourceSelected rejects empty', () => {
    expect(() => assertExpensePaymentSourceSelected('')).toThrow(/مصدر الصرف/);
    expect(() => assertExpensePaymentSourceSelected('Debt')).toThrow();
  });

  test('legacy mapping roundtrip', () => {
    expect(paymentSourceToLegacyMethod(PAYMENT_SOURCE_VAULT)).toBe('Vault');
    expect(legacyMethodToPaymentSource('Vault')).toBe(PAYMENT_SOURCE_VAULT);
  });

  test('expensePaymentSourceLabel', () => {
    expect(expensePaymentSourceLabel({ paymentSource: PAYMENT_SOURCE_DRAWER })).toBe('الصندوق');
    expect(expensePaymentSourceLabel({ paymentMethod: 'Vault' })).toBe('الخزنة');
    expect(expensePaymentSourceLabel({ paymentMethod: 'Debt' })).toBe('—');
  });
});
