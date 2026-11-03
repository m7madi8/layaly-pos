import { roundMoney } from './employeeBenefitAccounting';
import { costFromWeight, getProductType } from './productPricing';

/**
 * Employee Price = cost + (selling − cost) × 0.5
 * @returns {{ employeePrice: number, cost: number, sellPrice: number } | null}
 */
export function computeEmployeeUnitPrice(product, { weightGrams } = {}) {
  if (!product) return null;
  const type = getProductType(product);
  let cost = 0;
  let sell = Number(product.price) || 0;
  if (type === 'weight') {
    const grams = Number(weightGrams) || 0;
    if (!(grams > 0)) return null;
    cost = costFromWeight(product, grams);
    sell = roundMoney((sell / Math.max(1, Number(product.weightUnitGrams) || 1)) * grams);
  } else if (type === 'service') {
    return null;
  } else {
    cost = Number(product.cost) || 0;
  }
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(sell) || sell < 0) return null;
  const employeePrice = roundMoney(cost + (sell - cost) * 0.5);
  return { employeePrice, cost: roundMoney(cost), sellPrice: roundMoney(sell) };
}

export function validateEmployeePriceAvailable(product, opts) {
  const r = computeEmployeeUnitPrice(product, opts);
  if (!r) throw new Error(`تعذّر حساب سعر الموظف للصنف «${product?.name || '—'}» — تحقق من التكلفة والسعر`);
  return r;
}
