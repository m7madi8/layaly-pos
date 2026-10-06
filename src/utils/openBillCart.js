import { getProductType } from './productPricing';

/** Snapshot كامل لبند السلة — لا يعتمد على سعر المنتج الحالي لاحقاً */
export function serializeCartItem(item) {
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

export function restoreCartItem(item, productsById = {}) {
  const product = productsById[item.id];
  const restored = {
    ...item,
    name: item.name || product?.name || 'صنف (غير متاح حالياً)',
    cartItemId: item.cartItemId || item.lineId || item.id,
    quantity: Number(item.quantity) || 1,
    price: Number(item.price) || 0,
    cost: Number(item.cost) || 0,
    selectedAddons: Array.isArray(item.selectedAddons) ? item.selectedAddons : [],
  };
  if (!product) {
    restored._productMissing = true;
    if (item.name) restored.name = item.name;
    else restored.name = 'صنف (غير متاح حالياً)';
  }
  return restored;
}

export function formatOpenBillAge(updatedAtMs) {
  const ms = Number(updatedAtMs);
  if (!ms) return '';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

/** مفتاح دمج بند: جلسة PS فريدة، وزن فريد، وإلا cartItemId/id */
function mergeLineKey(item) {
  if (item?.sessionId) return `session:${item.sessionId}`;
  const type = item?.productType || getProductType(item);
  if (type === 'weight') return `weight:${item.cartItemId || item.lineId || `${item.id}-${item.weightGrams}`}`;
  return String(item?.cartItemId || item?.lineId || item?.id || '');
}

/**
 * دمج أصناف طلب جديد على فاتورة معلقة لنفس العميل:
 * نفس الصنف → جمع الكمية، غير ذلك → إلحاق.
 */
export function mergeOpenBillItems(prevItems = [], incomingItems = []) {
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

    if (inc.sessionId && indexByKey.has(key)) {
      continue; // نفس جلسة البلايستيشن موجودة مسبقاً
    }

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
