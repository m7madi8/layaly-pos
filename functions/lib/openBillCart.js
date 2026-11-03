const { getProductType } = require('./productPricing');

function serializeCartItem(item) {
  const type = getProductType(item);
  const line = {
    id: item.id,
    cartItemId: item.cartItemId || item.lineId || item.id,
    name: item.name || 'صنف',
    price: Number(item.price) || 0,
    originalPrice: item.originalPrice != null ? Number(item.originalPrice) : Number(item.price) || 0,
    cost: Number(item.cost) || 0,
    quantity: Number(item.quantity) || 1,
    selectedAddons: Array.isArray(item.selectedAddons) ? item.selectedAddons : [],
    productType: type,
    category: item.category || '',
  };
  if (type === 'weight') {
    line.weightGrams = Number(item.weightGrams) || 0;
    line.unitPrice = Number(item.unitPrice) || 0;
  }
  if (type === 'time') {
    line.sessionId = item.sessionId || null;
    line.durationMinutes = Number(item.durationMinutes) || 0;
    line.billableMinutes = Number(item.billableMinutes) || 0;
  }
  return line;
}

function mergeLineKey(item) {
  if (item?.sessionId) return `session:${item.sessionId}`;
  const type = item?.productType || getProductType(item);
  if (type === 'weight') return `weight:${item.cartItemId || item.lineId || `${item.id}-${item.weightGrams}`}`;
  return String(item?.cartItemId || item?.lineId || item?.id || '');
}

function mergeOpenBillItems(prevItems = [], incomingItems = []) {
  const result = (Array.isArray(prevItems) ? prevItems : []).map((i) => ({ ...i }));
  const indexByKey = new Map();
  result.forEach((item, idx) => {
    const key = mergeLineKey(item);
    if (key) indexByKey.set(key, idx);
  });

  for (const raw of Array.isArray(incomingItems) ? incomingItems : []) {
    const inc = { ...raw };
    const key = mergeLineKey(inc);
    const type = inc.productType || getProductType(inc);

    if (inc.sessionId && indexByKey.has(key)) continue;

    if (type === 'weight' || type === 'time') {
      result.push(inc);
      if (key) indexByKey.set(key, result.length - 1);
      continue;
    }

    if (key && indexByKey.has(key)) {
      const idx = indexByKey.get(key);
      const prev = result[idx];
      result[idx] = {
        ...prev,
        ...inc,
        quantity: (Number(prev.quantity) || 0) + (Number(inc.quantity) || 0),
        selectedAddons: Array.isArray(prev.selectedAddons) ? prev.selectedAddons : inc.selectedAddons,
        price: Number(prev.price) || Number(inc.price) || 0,
      };
    } else {
      result.push(inc);
      if (key) indexByKey.set(key, result.length - 1);
    }
  }
  return result;
}

module.exports = { serializeCartItem, mergeOpenBillItems };
