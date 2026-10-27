export const PURCHASE_PAYMENT_CASH = 'Cash';
export const PURCHASE_PAYMENT_VAULT = 'Vault';
export const PURCHASE_PAYMENT_DEBT = 'Debt';

export const PURCHASE_PAYMENT_METHODS = [
  { id: PURCHASE_PAYMENT_CASH, label: 'نقداً من الصندوق' },
  { id: PURCHASE_PAYMENT_VAULT, label: 'من الخزنة' },
  { id: PURCHASE_PAYMENT_DEBT, label: 'تسجيل دين على التاجر' },
];

export function normalizePurchasePaymentMethod(method) {
  const m = String(method || '').trim();
  if (m === PURCHASE_PAYMENT_CASH) return PURCHASE_PAYMENT_CASH;
  if (m === PURCHASE_PAYMENT_VAULT) return PURCHASE_PAYMENT_VAULT;
  if (m === PURCHASE_PAYMENT_DEBT || m === 'Debt') return PURCHASE_PAYMENT_DEBT;
  if (!m) return PURCHASE_PAYMENT_DEBT;
  return PURCHASE_PAYMENT_DEBT;
}

/** مشتريات بدون طريقة دفع (قديمة) تُحسب ديناً على التاجر */
export function purchaseIncreasesSupplierDebt(expense) {
  if (!expense) return false;
  const pm = normalizePurchasePaymentMethod(expense.paymentMethod);
  return pm === PURCHASE_PAYMENT_DEBT;
}

export function purchasePaymentMethodLabel(method) {
  const id = normalizePurchasePaymentMethod(method);
  const row = PURCHASE_PAYMENT_METHODS.find((m) => m.id === id);
  return row?.label || 'دين على التاجر';
}
