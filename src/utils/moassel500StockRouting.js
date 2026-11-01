import { isPlainNakhlaCheckoutProduct } from './hookahExternalSale';

/** معرّفات أصناف نظامية (مثل system-service) */
export const SYSTEM_MOASSEL_500_PRODUCT_ID = 'system-moassel-500g';
export const SYSTEM_NAKHLA_PRODUCT_ID = 'system-nakhla';
export const SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID = 'system-nakhla-renewal';
export const MOASSEL_PACK_GRAMS = 500;

export function isSystemMoassel500Product(product) {
  if (!product) return false;
  if (product.id === SYSTEM_MOASSEL_500_PRODUCT_ID || product.systemMoassel500) return true;
  const name = String(product.name || '').replace(/\s+/g, ' ').trim();
  if (/معسل/i.test(name) && /500\s*(غ|غم|جم|g)\b/i.test(name)) return true;
  if (name === 'معسل 500 غم' || name === 'معسل 500غ') return true;
  return false;
}

export function isSystemNakhlaRenewalProduct(product) {
  if (!product) return false;
  if (product.id === SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID || product.systemNakhlaRenewal) return true;
  const compact = String(product.name || '').replace(/\s+/g, '');
  return compact === 'تجديدنخلة' || compact === 'تجديدنخل' || /تجديد\s*نخلة/i.test(String(product.name || ''));
}

export function isSystemNakhlaProduct(product) {
  if (!product) return false;
  if (product.id === SYSTEM_NAKHLA_PRODUCT_ID || product.systemNakhla) return true;
  return isPlainNakhlaCheckoutProduct(product);
}

/** كم «جلسة/وحدة» من غرام معسل (500 غ = 1 لكل من نخلة وتجديد نخلة) */
export function moasselGramsToSessionUnits(grams) {
  const g = Number(grams) || 0;
  if (!(g > 0)) return 0;
  const units = g / MOASSEL_PACK_GRAMS;
  const rounded = Math.round(units * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) > 0.001) {
    throw new Error(`كمية المعسل يجب أن تكون مضاعفات ${MOASSEL_PACK_GRAMS} غ (500، 1000، …)`);
  }
  return Math.round(rounded);
}

export function resolveHookahStockTargetIds(products = []) {
  const list = Array.isArray(products) ? products : [];
  const nakhla =
    list.find((p) => p.id === SYSTEM_NAKHLA_PRODUCT_ID) ||
    list.find((p) => isSystemNakhlaProduct(p) && !isSystemNakhlaRenewalProduct(p));
  const renewal =
    list.find((p) => p.id === SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID) ||
    list.find((p) => isSystemNakhlaRenewalProduct(p));
  return {
    nakhlaId: nakhla?.id || SYSTEM_NAKHLA_PRODUCT_ID,
    renewalId: renewal?.id || SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID,
  };
}
