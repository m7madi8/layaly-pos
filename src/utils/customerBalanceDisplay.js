/** عرض رصيد العميل — لا نُظهر صفراً صامتاً عند غياب البيانات. */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @typedef {'known_zero' | 'known_positive' | 'missing' | 'loading' | 'error'} CustomerBalanceKind
 */

/**
 * @param {object | null | undefined} customer
 * @param {{ loading?: boolean, error?: string }} [meta]
 */
export function resolveCustomerBalanceState(customer, meta = {}) {
  if (meta.loading) {
    return { kind: 'loading', label: '…' };
  }
  if (meta.error) {
    return { kind: 'error', label: '—', message: meta.error };
  }
  if (!customer) {
    return { kind: 'missing', label: '—' };
  }
  if (customer.balance === undefined || customer.balance === null || customer.balance === '') {
    return { kind: 'missing', label: 'غير متوفر' };
  }
  const n = Number(customer.balance);
  if (!Number.isFinite(n)) {
    return { kind: 'missing', label: 'غير متوفر' };
  }
  if (n <= 0) {
    return { kind: 'known_zero', value: money(n), label: String(money(n)) };
  }
  return { kind: 'known_positive', value: money(n), label: String(money(n)) };
}

/**
 * @param {(n: number) => string} fmtMoney
 * @param {ReturnType<typeof resolveCustomerBalanceState>} state
 */
export function formatCustomerBalanceDisplay(fmtMoney, state) {
  if (state.kind === 'loading') return '…';
  if (state.kind === 'error') return '—';
  if (state.kind === 'missing') return 'غير متوفر';
  return fmtMoney(state.value ?? 0);
}

export function customerBalanceTone(state) {
  if (state.kind === 'known_positive') return 'text-red-600';
  if (state.kind === 'known_zero') return 'text-green-600';
  if (state.kind === 'error') return 'text-amber-700';
  return 'text-gray-500';
}