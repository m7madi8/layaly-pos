import { orderStatusLabel, paymentTypeLabel, paymentMethodLabel } from '../i18n';

/** تواريخ عربية واضحة للكشوف */
export function formatStatementDateTime(date = new Date()) {
  return date.toLocaleString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOrderDateTime(order) {
  if (!order?.timestamp) {
    if (order?._syntheticFromTransaction) return '— (مسجّل كدين)';
    return '—';
  }
  const d = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function orderPaymentSummary(order) {
  const type = paymentTypeLabel(order.paymentType);
  const method = paymentMethodLabel(order.paymentMethod);
  const status = orderStatusLabel(order.status);
  const parts = [];
  if (type) parts.push(type);
  else if (method) parts.push(method);
  if (status && status !== type) parts.push(status);
  return parts.join(' · ') || '—';
}

/**
 * كل طلبات العميل بما فيها الدين والجزئي — مع دمج حركات الدين الناقصة كطلبات.
 */
export function resolveCustomerStatementOrders(customer, orders = []) {
  if (!customer?.id) return [];

  const cid = customer.id;
  const nameNorm = String(customer.name || '').trim();

  const belongsToCustomer = (o) => {
    if (o.customerId === cid) return true;
    if (nameNorm && String(o.customer || '').trim() === nameNorm) return true;
    return false;
  };

  const byKey = new Map();

  for (const o of orders) {
    if (!belongsToCustomer(o)) continue;
    if (o.status === 'cancelled') continue;
    const key = o.id || `num-${o.orderNumber}`;
    byKey.set(key, o);
  }

  for (const t of customer.transactions || []) {
    if (t.type !== 'order_debt') continue;
    const num = String(t.orderNumber ?? '').trim();
    if (!num) continue;

    const already = [...byKey.values()].some((o) => String(o.orderNumber) === num);
    if (already) continue;

    const debtAmount = Number(t.amount || 0);
    const cashPaid = Number(t.cashPaid || 0);
    const total = Number(t.total ?? debtAmount + cashPaid);

    byKey.set(`tx-${t.id || num}`, {
      id: `tx-${t.id || num}`,
      orderNumber: t.orderNumber,
      customer: customer.name,
      customerId: cid,
      items: [],
      subtotal: total,
      total,
      cashPaid,
      debtAmount,
      status: cashPaid > 0 && debtAmount > 0 ? 'partial' : 'unpaid',
      paymentType: cashPaid > 0 && debtAmount > 0 ? 'mixed' : 'debt',
      paymentMethod: cashPaid > 0 && debtAmount > 0 ? 'Mixed' : 'Debt',
      timestamp: null,
      notes: '',
      _syntheticFromTransaction: true,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const ta = a.timestamp?.toDate
      ? a.timestamp.toDate().getTime()
      : a.timestamp
        ? new Date(a.timestamp).getTime()
        : 0;
    const tb = b.timestamp?.toDate
      ? b.timestamp.toDate().getTime()
      : b.timestamp
        ? new Date(b.timestamp).getTime()
        : 0;
    return tb - ta;
  });
}

export function computeStatementTotals(statementOrders) {
  const orderCount = statementOrders.length;
  const totalPurchases = statementOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalCash = statementOrders.reduce((s, o) => s + Number(o.cashPaid || 0), 0);
  const totalDebtOnOrders = statementOrders.reduce((s, o) => s + Number(o.debtAmount || 0), 0);
  const debtOrderCount = statementOrders.filter((o) => Number(o.debtAmount || 0) > 0).length;

  return {
    orderCount,
    debtOrderCount,
    totalPurchases,
    totalCash,
    totalDebtOnOrders,
  };
}
