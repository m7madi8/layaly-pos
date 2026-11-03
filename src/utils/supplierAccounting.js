import { resolveExpenseSection } from '../expenseConfig';
import { purchaseIncreasesSupplierDebt } from './purchasePayment';

export const SUPPLIER_PAYMENT_CATEGORY = 'SupplierPayment';
export const SUPPLIER_PAYMENT_SECTION = 'supplier_payment';

export const SUPPLIER_PAYMENT_METHODS = [
  { id: 'Cash', label: 'نقداً من الصندوق' },
  { id: 'Vault', label: 'من الخزنة' },
  { id: 'Transfer Bank', label: 'تحويل بنكي' },
];

export const SUPPLIER_PAYMENT_CASH = 'Cash';
export const SUPPLIER_PAYMENT_VAULT = 'Vault';
export const SUPPLIER_PAYMENT_TRANSFER = 'Transfer Bank';

export function normalizeSupplierPaymentMethod(method) {
  const m = String(method || '').trim();
  if (m === SUPPLIER_PAYMENT_CASH) return SUPPLIER_PAYMENT_CASH;
  if (m === SUPPLIER_PAYMENT_VAULT || m === 'Vault') return SUPPLIER_PAYMENT_VAULT;
  if (m === SUPPLIER_PAYMENT_TRANSFER || m === 'Transfer') return SUPPLIER_PAYMENT_TRANSFER;
  return SUPPLIER_PAYMENT_CASH;
}

export function supplierPaymentMethodLabel(method) {
  const id = normalizeSupplierPaymentMethod(method);
  return SUPPLIER_PAYMENT_METHODS.find((row) => row.id === id)?.label || id;
}

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function isSupplierPaymentExpense(expense) {
  if (!expense) return false;
  if (expense.section === SUPPLIER_PAYMENT_SECTION) return true;
  return expense.category === SUPPLIER_PAYMENT_CATEGORY;
}

/** Purchases and supplier payments affect payable; other expenses do not. */
export function computeSupplierPayableFromExpenses(expenses, supplierId) {
  if (!supplierId || !Array.isArray(expenses)) return 0;
  let purchases = 0;
  let payments = 0;
  for (const e of expenses) {
    if (String(e.supplierId || '') !== String(supplierId)) continue;
    const amt = roundMoney(e.amount);
    if (!(amt > 0)) continue;
    if (isSupplierPaymentExpense(e)) payments += amt;
    else if (resolveExpenseSection(e) === 'purchase' && purchaseIncreasesSupplierDebt(e)) purchases += amt;
  }
  return roundMoney(purchases - payments);
}

/** Opening balance (if any) + net purchases/payments from expense history. */
export function computeSupplierTotalPayable(supplier, expenses, supplierId) {
  const activity = computeSupplierPayableFromExpenses(expenses, supplierId);
  if (supplier?.openingBalanceRecorded && supplier.openingBalanceAmount != null && supplier.openingBalanceAmount !== '') {
    return roundMoney(Number(supplier.openingBalanceAmount) + activity);
  }
  return activity;
}

export function resolveSupplierOutstandingBalance(supplier, expenses, supplierId) {
  const stored = supplier?.balance;
  const fromFormula = computeSupplierTotalPayable(supplier, expenses, supplierId);
  if (supplier?.openingBalanceRecorded) {
    return fromFormula;
  }
  if (stored != null && stored !== '' && Number.isFinite(Number(stored))) {
    return roundMoney(stored);
  }
  return fromFormula;
}

export function expenseCountsInReportTotals(expense) {
  if (isSupplierPaymentExpense(expense)) return false;
  if (expense?.cancelled) return false;
  return true;
}

export function sumReportExpenses(expenses) {
  if (!Array.isArray(expenses)) return 0;
  return roundMoney(
    expenses.reduce((sum, e) => {
      if (!expenseCountsInReportTotals(e)) return sum;
      return sum + (parseFloat(e.amount) || 0);
    }, 0)
  );
}

export function validateSupplierPaymentInput({ amount, supplierId, suppliers }) {
  const errors = [];
  const parsed = roundMoney(amount);
  if (!supplierId) errors.push('اختر التاجر');
  if (!Number.isFinite(parsed) || parsed <= 0) errors.push('أدخل مبلغ دفعة أكبر من صفر');
  const supplier = (suppliers || []).find((s) => s.id === supplierId);
  if (supplierId && !supplier) errors.push('التاجر غير موجود');
  return { ok: errors.length === 0, errors, amount: parsed, supplier };
}

export function buildPaymentReference(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SP-${y}${m}${day}-${suffix}`;
}

export function supplierLedgerEntries(expenses, supplierId, supplier = null) {
  if (!supplierId) return [];
  const rows = [];
  if (
    supplier?.openingBalanceRecorded &&
    supplier.openingBalanceAmount != null &&
    supplier.openingBalanceAmount !== ''
  ) {
    const signed = roundMoney(supplier.openingBalanceAmount);
    if (Math.abs(signed) > 0.009) {
      rows.push({
        id: `opening_${supplierId}`,
        kind: 'opening_balance',
        date: supplier.openingBalanceAtMs ? new Date(supplier.openingBalanceAtMs) : null,
        amount: Math.abs(signed),
        signedAmount: signed,
        nature: supplier.openingBalanceNature || (signed >= 0 ? 'payable' : 'receivable'),
        notes: supplier.openingBalanceNote || 'رصيد افتتاحي',
        paymentRef: null,
        recordedBy: supplier.openingBalanceBy || null,
      });
    }
  }
  for (const e of expenses || []) {
    if (String(e.supplierId || '') !== String(supplierId)) continue;
    const amt = roundMoney(e.amount);
    if (!(amt > 0)) continue;
    if (isSupplierPaymentExpense(e)) {
      rows.push({
        id: e.id,
        kind: 'payment',
        date: e.date,
        amount: amt,
        paymentMethod: e.paymentMethod || 'Cash',
        paymentRef: e.paymentRef || e.id,
        notes: e.notes || e.description || '',
        recordedBy: e.recordedBy || null,
        expenseId: e.id,
      });
    } else if (resolveExpenseSection(e) === 'purchase') {
      rows.push({
        id: e.id,
        kind: 'purchase',
        date: e.date,
        amount: amt,
        paymentMethod: e.paymentMethod || 'Debt',
        paymentRef: null,
        notes: e.description || '',
        recordedBy: e.recordedBy || null,
        expenseId: e.id,
        linkedProductName: e.linkedProductName || '',
      });
    }
  }
  rows.sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const db = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return db - da;
  });
  return rows;
}

export function nextBalanceAfterPayment(currentBalance, paymentAmount) {
  return roundMoney((Number(currentBalance) || 0) - roundMoney(paymentAmount));
}

export function balanceDeltaForPurchase(amount) {
  return roundMoney(amount);
}

export function balanceDeltaForPaymentReversal(amount) {
  return roundMoney(amount);
}

export function balanceDeltaForPurchaseReversal(amount) {
  return roundMoney(-amount);
}
