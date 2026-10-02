/**
 * محاسبة أثر الطلب على رصيد العميل.
 * التعديل = عكس أثر النسخة القديمة بالكامل ثم تطبيق أثر النسخة الجديدة،
 * فيبقى الرصيد = مجموع ديون الطلبات الحالية − الدفعات، مهما تغيّر العميل أو طريقة الدفع.
 */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** الدين الذي يضيفه الطلب لحساب العميل — الطلب الملغى لا أثر له */
export function effectiveDebt(order) {
  if (!order || order.status === 'cancelled' || !order.customerId) return 0;
  return Math.max(0, money(order.debtAmount));
}

/** فروقات الرصيد لكل عميل عند استبدال oldOrder بـ newOrder (أي منهما قد يكون null) */
export function debtDeltasByCustomer(oldOrder, newOrder) {
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

/** يستبدل حركة «دين من طلب» لنفس رقم الطلب بدل إضافة حركة مكررة */
export function replaceOrderDebtEntry(transactions, orderNumber, entry) {
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

/** قائمة التغييرات بين نسختين من الطلب: [{ field, label, from, to, kind }] */
export function diffOrders(oldOrder, newOrder) {
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
    if (money(prev.price) !== money(item.price)) {
      changes.push({ field: 'item', label: `سعر ${itemLabel(item)}`, from: money(prev.price), to: money(item.price), kind: 'money' });
    }
  }
  for (const [key, item] of oldItems) {
    if (!newItems.has(key)) {
      changes.push({ field: 'item', label: `صنف محذوف: ${itemLabel(item)}`, from: item.quantity, to: 0, kind: 'qty' });
    }
  }
  return changes;
}
