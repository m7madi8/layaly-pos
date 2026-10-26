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

module.exports = {
  money,
  effectiveDebt,
  debtDeltasByCustomer,
  replaceOrderDebtEntry,
};
