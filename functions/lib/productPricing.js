/** Server copy — keep in sync with src/utils/productPricing.js */
function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

const roundMoney = (value) => roundTo(value, 2);

function getProductType(product) {
  const t = product?.productType;
  return t === 'weight' || t === 'time' ? t : 'standard';
}

function weightPricePerUnit(product) {
  const baseWeight = Number(product?.weightPricing?.baseWeight);
  const basePrice = Number(product?.weightPricing?.basePrice);
  if (!(baseWeight > 0) || !(basePrice > 0)) return 0;
  return basePrice / baseWeight;
}

function amountFromWeight(product, grams) {
  const perUnit = weightPricePerUnit(product);
  const g = Number(grams);
  if (!(perUnit > 0) || !(g > 0)) return 0;
  return roundMoney(g * perUnit);
}

function costFromWeight(product, grams) {
  const baseWeight = Number(product?.weightPricing?.baseWeight);
  const cost = Number(product?.cost) || 0;
  const g = Number(grams);
  if (!(baseWeight > 0) || !(g > 0) || cost <= 0) return 0;
  return roundMoney((cost / baseWeight) * g);
}

function stockUnitsForItem(item) {
  const type = getProductType(item);
  const qty = Number(item?.quantity) || 0;
  if (type === 'time') return 0;
  if (type === 'weight') return (Number(item?.weightGrams) || 0) * qty;
  return qty;
}

module.exports = {
  roundMoney,
  getProductType,
  amountFromWeight,
  costFromWeight,
  stockUnitsForItem,
};
