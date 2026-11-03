import { roundMoney } from './employeeBenefitAccounting';
import {
  costFromWeight,
  getProductType,
  amountFromWeight,
  retailSellAmount,
} from './productPricing';

/**
 * Employee Price = cost + (selling − cost) × 0.5
 * @returns {{ employeePrice: number, cost: number, sellPrice: number } | null}
 */
export function computeEmployeeUnitPrice(product, { weightGrams } = {}) {
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

export function validateEmployeePriceAvailable(product, opts) {
  const r = computeEmployeeUnitPrice(product, opts);
  if (!r) {
    throw new Error(`تعذّر حساب سعر الموظف للصنف «${product?.name || '—'}» — تحقق من التكلفة والسعر`);
  }
  return r;
}

function addonTotals(selectedAddons) {
  const list = selectedAddons || [];
  const addonsPrice = list.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0);
  const addonsCost = list.reduce((sum, addon) => sum + (parseFloat(addon.cost) || 0), 0);
  return { addonsPrice, addonsCost };
}

/** إعادة تسعير بند السلة (بيع عادي أو سعر موظف) */
export function applyPosPricingToCartItem(item, product, staffMemberId) {
  if (!product) return item;
  const type = getProductType(product);
  const selectedAddons = item.selectedAddons || [];
  const { addonsPrice, addonsCost } = addonTotals(selectedAddons);
  const qty = Number(item.quantity) || 1;

  if (type === 'time' || type === 'service') {
    return {
      ...item,
      employeeSaleStaffId: staffMemberId || null,
      pricingMode: staffMemberId ? 'employee' : 'retail',
    };
  }

  if (!staffMemberId) {
    let basePrice = item.originalPrice;
    let baseCost = product.cost || 0;
    if (type === 'weight') {
      basePrice = item.originalPrice ?? retailSellAmount(product, { weightGrams: item.weightGrams, quantity: qty });
      baseCost = costFromWeight(product, item.weightGrams);
    } else if (basePrice == null) {
      basePrice = Number(product.price) || 0;
    }
    return {
      ...item,
      price: roundMoney(Number(basePrice) + addonsPrice),
      cost: roundMoney(Number(baseCost) + addonsCost),
      employeeSaleStaffId: null,
      pricingMode: 'retail',
    };
  }

  const ep = validateEmployeePriceAvailable(product, { weightGrams: item.weightGrams });
  return {
    ...item,
    price: roundMoney(ep.employeePrice + addonsPrice),
    cost: roundMoney(ep.cost + addonsCost),
    originalPrice:
      item.originalPrice ??
      (type === 'weight'
        ? retailSellAmount(product, { weightGrams: item.weightGrams, quantity: qty })
        : Number(product.price) || 0),
    employeeSaleStaffId: staffMemberId,
    pricingMode: 'employee',
  };
}
