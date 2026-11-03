/** Server copy — keep in sync with src/utils/employeePricing.js */
const { roundMoney, getProductType, amountFromWeight, costFromWeight } = require('./productPricing');

function computeEmployeeUnitPrice(product, { weightGrams } = {}) {
  if (!product) return null;
  const type = getProductType(product);
  let cost = 0;
  let sell = 0;
  if (type === 'weight') {
    const grams = Number(weightGrams) || 0;
    if (!(grams > 0)) return null;
    cost = costFromWeight(product, grams);
    sell = amountFromWeight(product, grams);
    if (!(sell > 0)) {
      const unitG = Math.max(
        1,
        Number(product.weightPricing?.baseWeight) || Number(product.weightUnitGrams) || 1
      );
      sell = roundMoney(((Number(product.price) || 0) / unitG) * grams);
    }
  } else if (type === 'service') {
    return null;
  } else {
    cost = Number(product.cost) || 0;
    sell = Number(product.price) || 0;
  }
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(sell) || sell < 0) return null;
  const employeePrice = roundMoney(cost + (sell - cost) * 0.5);
  return { employeePrice, cost: roundMoney(cost), sellPrice: roundMoney(sell) };
}

function validateEmployeePriceAvailable(product, opts) {
  const r = computeEmployeeUnitPrice(product, opts);
  if (!r) {
    throw new Error(`تعذّر حساب سعر الموظف للصنف «${product?.name || '—'}» — تحقق من التكلفة والسعر`);
  }
  return r;
}

module.exports = {
  computeEmployeeUnitPrice,
  validateEmployeePriceAvailable,
};
