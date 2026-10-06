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
