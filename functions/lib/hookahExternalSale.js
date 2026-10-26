const NAKHLA_EXTERNAL_CHECKOUT_PRICE = 20;

function isPlainNakhlaCheckoutProduct(product) {
  const name = String(product?.name || '').trim();
  if (!name || /تجديد/i.test(name)) return false;
  if (/غم|جم|\d/i.test(name)) return false;
  const compact = name.replace(/\s+/g, '');
  return compact === 'نخلة' || compact === 'نخله';
}

function externalHookahUnitPrice(product, lineId) {
  if (!String(lineId || '').includes('hookah-external')) return null;
  if (!isPlainNakhlaCheckoutProduct(product)) return null;
  return NAKHLA_EXTERNAL_CHECKOUT_PRICE;
}

module.exports = { externalHookahUnitPrice, NAKHLA_EXTERNAL_CHECKOUT_PRICE };
