/** سعر إخراج الأرجيلة الخارجية — صنف «نخلة» فقط */
export const NAKHLA_EXTERNAL_CHECKOUT_PRICE = 20;
export const NAKHLA_EXTERNAL_CHECKOUT_LABEL = 'نخلة';

export function isNakhlaProduct(product) {
  const normalized = String(product?.name || '').replace(/\s+/g, '');
  return /نخل/i.test(normalized);
}

/** صنف «نخلة» فقط — بدون تجديد، أوزان، أو أصناف أخرى */
export function isPlainNakhlaCheckoutProduct(product) {
  const name = String(product?.name || '').trim();
  if (!name || /تجديد/i.test(name)) return false;
  if (/غم|جم|\d/i.test(name)) return false;
  const compact = name.replace(/\s+/g, '');
  return compact === 'نخلة' || compact === 'نخله';
}

export function productForExternalHookahCheckout(product) {
  if (!product) return product;
  return {
    ...product,
    name: NAKHLA_EXTERNAL_CHECKOUT_LABEL,
    price: NAKHLA_EXTERNAL_CHECKOUT_PRICE,
  };
}

/** قائمة إخراج الأرجيلة: صنف واحد فقط «نخلة — 20» */
export function selectHookahExternalCheckoutProducts(products = []) {
  const plain = products.find(isPlainNakhlaCheckoutProduct);
  if (plain) return [productForExternalHookahCheckout(plain)];

  const fallback = products.find(
    (p) => isNakhlaProduct(p) && !/تجديد/i.test(p.name || '') && !/غم|جم|\d/i.test(p.name || '')
  );
  if (fallback) return [productForExternalHookahCheckout(fallback)];

  return [];
}

export const externalHookahCartItemId = (productId) => `${productId}::hookah-external`;
