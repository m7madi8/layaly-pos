const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function effectiveDebt(order) {
  if (!order || order.status === 'cancelled' || !order.customerId) return 0;
  return Math.max(0, money(order.debtAmount));
}

function debtDeltasByCustomer(oldOrder, newOrder) {
  const deltas = {};
  const add = (customerId, amount) => {
    if (!customerId || !amount) return;
    deltas[customerId] = money((deltas[customerId] || 0) + amount);
  };
  add(oldOrder?.customerId, -effectiveDebt(oldOrder));
  add(newOrder?.customerId, effectiveDebt(newOrder));
  for (const id of Object.keys(deltas)) {
    if (deltas[id] === 0) delete deltas[id];
  }
  return deltas;
}

function replaceOrderDebtEntry(transactions, orderNumber, entry) {
  const num = String(orderNumber ?? '');
  const kept = (transactions || []).filter(
    (t) => !(t.type === 'order_debt' && String(t.orderNumber ?? '') === num)
  );
  return (entry ? [...kept, entry] : kept).slice(-100);
}

const itemKey = (item) =>
  item.lineId ||
  (item.selectedAddons && item.selectedAddons.length
    ? `${item.id}-${JSON.stringify(item.selectedAddons.map((a) => a.name).sort())}`
    : item.id);

const itemLabel = (item) => {
  if (item.weightGrams) return `${item.name} (${item.weightGrams} غ)`;
  return item.name;
};

const ORDER_FIELDS = [
  ['customer', 'العميل'],
  ['paymentMethod', 'طريقة الدفع'],
  ['subtotal', 'المجموع قبل الخصم', 'money'],
  ['discountAmount', 'الخصم', 'money'],
  ['total', 'الإجمالي', 'money'],
  ['cashPaid', 'المدفوع نقداً', 'money'],
  ['debtAmount', 'الدين', 'money'],
  ['notes', 'الملاحظات'],
];

function diffOrders(oldOrder, newOrder) {
  const changes = [];
  for (const [field, label, kind] of ORDER_FIELDS) {
    const from = kind === 'money' ? money(oldOrder?.[field]) : String(oldOrder?.[field] ?? '');
    const to = kind === 'money' ? money(newOrder?.[field]) : String(newOrder?.[field] ?? '');
    if (from !== to) changes.push({ field, label, from, to, kind: kind || 'text' });
  }
  const oldItems = new Map((oldOrder?.items || []).map((i) => [itemKey(i), i]));
  const newItems = new Map((newOrder?.items || []).map((i) => [itemKey(i), i]));
  for (const [key, item] of newItems) {
    const prev = oldItems.get(key);
    if (!prev) {
      changes.push({ field: 'item', label: `صنف مضاف: ${itemLabel(item)}`, from: 0, to: item.quantity, kind: 'qty' });
      continue;
    }
    if (Number(prev.quantity) !== Number(item.quantity)) {
      changes.push({ field: 'item', label: `كمية ${itemLabel(item)}`, from: prev.quantity, to: item.quantity, kind: 'qty' });
    }
    if (Number(prev.price) !== Number(item.price)) {
      changes.push({ field: 'item', label: `سعر ${itemLabel(item)}`, from: prev.price, to: item.price, kind: 'money' });
    }
  }
  for (const [key, item] of oldItems) {
    if (!newItems.has(key)) {
      changes.push({ field: 'item', label: `صنف محذوف: ${itemLabel(item)}`, from: item.quantity, to: 0, kind: 'qty' });
    }
  }
  return changes;
}

module.exports = {
  money,
  effectiveDebt,
  debtDeltasByCustomer,
  replaceOrderDebtEntry,
  diffOrders,
};
