/** مصدر صرف المصروفات النقدية — الصندوق (وردية) أو الخزنة */

export const PAYMENT_SOURCE_DRAWER = 'drawer';
export const PAYMENT_SOURCE_VAULT = 'vault';

export const EXPENSE_PAYMENT_SOURCES = [
  { id: PAYMENT_SOURCE_DRAWER, label: 'الصندوق', sublabel: 'وردية الكاش المفتوحة' },
  { id: PAYMENT_SOURCE_VAULT, label: 'الخزنة', sublabel: 'رصيد الخزنة' },
];

/** يتوافق مع paymentMethod التاريخي Cash / Vault */
export function paymentSourceToLegacyMethod(source) {
  if (source === PAYMENT_SOURCE_VAULT) return 'Vault';
  if (source === PAYMENT_SOURCE_DRAWER) return 'Cash';
  return null;
}

export function legacyMethodToPaymentSource(method) {
  const m = String(method || '').trim();
  if (m === 'Vault') return PAYMENT_SOURCE_VAULT;
  if (m === 'Cash') return PAYMENT_SOURCE_DRAWER;
  return null;
}

/** من نموذج المصروف — paymentSource أولاً ثم paymentMethod */
export function resolvePaymentSourceFromForm(form) {
  const src = String(form?.paymentSource || '').trim();
  if (src === PAYMENT_SOURCE_DRAWER || src === PAYMENT_SOURCE_VAULT) return src;
  return legacyMethodToPaymentSource(form?.paymentMethod);
}

export function assertExpensePaymentSourceSelected(source) {
  if (source !== PAYMENT_SOURCE_DRAWER && source !== PAYMENT_SOURCE_VAULT) {
    throw new Error('اختر مصدر الصرف — الصندوق أو الخزنة');
  }
}

export function expensePaymentSourceLabel(expense) {
  const src =
    expense?.paymentSource || legacyMethodToPaymentSource(expense?.paymentMethod);
  if (src === PAYMENT_SOURCE_VAULT) return 'الخزنة';
  if (src === PAYMENT_SOURCE_DRAWER) return 'الصندوق';
  return '—';
}

export function isDrawerPaymentSource(source) {
  return source === PAYMENT_SOURCE_DRAWER;
}

export function isVaultPaymentSource(source) {
  return source === PAYMENT_SOURCE_VAULT;
}
