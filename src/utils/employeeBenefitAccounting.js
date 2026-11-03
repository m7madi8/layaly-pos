import {
  roundMoney,
  getProductType,
  stockUnitsForItem,
  retailSellAmount,
} from './productPricing';
import { getCashDayKey } from './cashDayPeriod';
import { validateEmployeePriceAvailable } from './employeePricing';

export const EMPLOYEE_BENEFIT_SECTION = 'employee_benefit';
export const EMPLOYEE_BENEFIT_CATEGORY = 'EmployeeBenefit';
export const BENEFIT_TYPE_CASH = 'cash';
export const BENEFIT_TYPE_INVENTORY = 'inventory';
export const BENEFIT_TYPE_PERSONAL = 'personal_consumption';
export const BENEFIT_STATUS_APPROVED = 'approved';
export const BENEFIT_STATUS_CANCELLED = 'cancelled';

export { roundMoney };

export const DEFAULT_CAFE_STAFF = [
  { name: 'عمير', benefitLimitILS: 20 },
  { name: 'نمس', benefitLimitILS: 20 },
  { name: 'رامي', benefitLimitILS: 20 },
  { name: 'رضا', benefitLimitILS: 5 },
  { name: 'وديع', benefitLimitILS: 5 },
  { name: 'مصطفى', benefitLimitILS: 5 },
  { name: 'كنان', benefitLimitILS: 5 },
];

export function normalizeStaffName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

export function staffNameKey(name) {
  return normalizeStaffName(name).toLowerCase();
}

function staffCreatedMs(staff) {
  if (staff?.createdAt?.toMillis) return staff.createdAt.toMillis();
  if (staff?.createdAtMs) return Number(staff.createdAtMs) || 0;
  return 0;
}

/** عرض/اختيار موظف واحد لكل اسم (حماية من التكرار في Firestore). */
export function uniqueStaffMembersByName(list) {
  const byKey = new Map();
  for (const s of list || []) {
    if (s.active === false) continue;
    const key = staffNameKey(s.name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, s);
      continue;
    }
    const prevHasLimit = prev.benefitLimitILS != null && prev.benefitLimitILS !== '';
    const nextHasLimit = s.benefitLimitILS != null && s.benefitLimitILS !== '';
    let keep = prev;
    if (!prevHasLimit && nextHasLimit) keep = s;
    else if (prevHasLimit && !nextHasLimit) keep = prev;
    else if (staffCreatedMs(s) < staffCreatedMs(prev)) keep = s;
    byKey.set(key, keep);
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar')
  );
}

export function isEmployeeBenefitExpense(expense) {
  if (!expense) return false;
  if (expense.section === EMPLOYEE_BENEFIT_SECTION) return true;
  return expense.category === EMPLOYEE_BENEFIT_CATEGORY;
}

/** يبني مستند مصروف Firestore من سجل استفادة موظف */
export function buildEmployeeBenefitExpenseFields(benefit, { payDate, uid, benefitId }) {
  const d = payDate instanceof Date && !Number.isNaN(payDate.getTime()) ? payDate : new Date();
  const totalValue = roundMoney(benefit.totalValue);
  const benefitType = benefit.benefitType;
  const staffName = benefit.staffName || '';
  const description =
    benefitType === BENEFIT_TYPE_CASH
      ? `استفادة موظف (كاش) — ${staffName}`
      : benefitType === BENEFIT_TYPE_PERSONAL
        ? `استهلاك شخصي — ${staffName}`
        : `استفادة موظف (أصناف) — ${staffName}`;

  return {
    amount: totalValue,
    date: d,
    dateMs: d.getTime(),
    section: EMPLOYEE_BENEFIT_SECTION,
    category: EMPLOYEE_BENEFIT_CATEGORY,
    description,
    notes: String(benefit.notes || '').trim(),
    staffMemberId: benefit.staffMemberId,
    staffName,
    benefitId: benefitId || benefit.id,
    benefitNumber: benefit.benefitNumber,
    benefitType,
    paymentMethod:
      benefitType === BENEFIT_TYPE_CASH
        ? 'Cash'
        : benefitType === BENEFIT_TYPE_PERSONAL
          ? 'PersonalConsumption'
          : 'Inventory',
    cogsAmount: benefit.cogsAmount != null ? roundMoney(benefit.cogsAmount) : null,
    recordedBy: benefit.recordedBy || null,
    userId: uid,
    cancelled: benefit.status === BENEFIT_STATUS_CANCELLED,
    cancelReason: benefit.cancelReason || '',
  };
}

export function buildBenefitReference(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(d.getTime()).slice(-6);
  return `EB-${y}${m}${day}-${seq}`;
}

export function dailyUsageDocId(staffMemberId, cashDayKey) {
  return `${staffMemberId}__${cashDayKey}`;
}

/** قيمة سطر الاستفادة (أصناف / حد يومي) = سعر الموظف (تكلفة + نصف الربح) */
export function lineCostForBenefit(product, line) {
  const type = getProductType(product);
  const qty = Math.max(0, Number(line.quantity) || 0);
  if (type === 'time') {
    throw new Error(`صنف «${product.name}» بالوقت غير مدعوم لاستفادة الموظف`);
  }
  if (type === 'weight') {
    const grams = Number(line.weightGrams) || 0;
    if (!(grams > 0)) throw new Error(`أدخل وزن صنف «${product.name}»`);
    const count = qty > 0 ? qty : 1;
    const pricing = validateEmployeePriceAvailable(product, { weightGrams: grams });
    return roundMoney(pricing.employeePrice * count);
  }
  if (!(qty > 0)) throw new Error(`أدخل كمية صنف «${product.name}»`);
  const pricing = validateEmployeePriceAvailable(product, {});
  return roundMoney(pricing.employeePrice * qty);
}

/** سعر البيع للصنف × الكمية (أو الوزن) */
export function lineSellPriceForProduct(product, line) {
  const type = getProductType(product);
  const qty = Math.max(0, Number(line.quantity) || 0);
  if (type === 'time') {
    throw new Error(`صنف «${product.name}» بالوقت غير مدعوم لاستفادة الموظف`);
  }
  if (type === 'weight') {
    const grams = Number(line.weightGrams) || 0;
    if (!(grams > 0)) throw new Error(`أدخل وزن صنف «${product.name}»`);
    return retailSellAmount(product, { weightGrams: grams, quantity: qty > 0 ? qty : 1 });
  }
  if (!(qty > 0)) throw new Error(`أدخل كمية صنف «${product.name}»`);
  return retailSellAmount(product, { quantity: qty });
}

export function resolveBenefitLines(productsById, rawLines) {
  const lines = [];
  let total = 0;
  for (const raw of rawLines || []) {
    const productId = String(raw.productId || '').trim();
    const product = productsById[productId];
    if (!product) throw new Error('صنف غير موجود');
    const lineTotal = lineCostForBenefit(product, raw);
    if (!(lineTotal > 0)) throw new Error(`سعر الموظف لـ «${product.name}» غير صالح`);
    const type = getProductType(product);
    const unitEmployee =
      type === 'weight'
        ? validateEmployeePriceAvailable(product, { weightGrams: raw.weightGrams }).employeePrice
        : validateEmployeePriceAvailable(product, {}).employeePrice;
    lines.push({
      productId,
      name: product.name,
      productType: type,
      quantity: Number(raw.quantity) || 1,
      weightGrams: type === 'weight' ? Number(raw.weightGrams) || 0 : null,
      sellUnitPrice: type === 'weight' ? null : roundMoney(unitEmployee),
      unitCost: type === 'weight'
        ? roundMoney(lineTotal / (Number(raw.quantity) || 1))
        : roundMoney(unitEmployee),
      lineTotal,
      stockUnits: stockUnitsForItem({
        ...product,
        quantity: Number(raw.quantity) || 1,
        weightGrams: raw.weightGrams,
      }),
    });
    total = roundMoney(total + lineTotal);
  }
  if (!lines.length) throw new Error('أضف صنفاً واحداً على الأقل');
  return { lines, totalValue: total };
}

/** Personal consumption — valued at selling price (counts as operating expense, not benefit quota). */
export function lineSellPriceForPersonal(product, line) {
  return lineSellPriceForProduct(product, line);
}

export function resolvePersonalConsumptionLines(productsById, rawLines) {
  const lines = [];
  let total = 0;
  for (const raw of rawLines || []) {
    const productId = String(raw.productId || '').trim();
    const product = productsById[productId];
    if (!product) throw new Error('صنف غير موجود');
    const lineTotal = lineSellPriceForPersonal(product, raw);
    if (!(lineTotal > 0)) throw new Error(`سعر بيع «${product.name}» غير صالح`);
    const type = getProductType(product);
    lines.push({
      productId,
      name: product.name,
      productType: type,
      quantity: Number(raw.quantity) || 1,
      weightGrams: type === 'weight' ? Number(raw.weightGrams) || 0 : null,
      sellUnitPrice: type === 'weight' ? null : roundMoney(Number(product.price) || 0),
      lineTotal,
      stockUnits: stockUnitsForItem({
        ...product,
        quantity: Number(raw.quantity) || 1,
        weightGrams: raw.weightGrams,
      }),
    });
    total = roundMoney(total + lineTotal);
  }
  if (!lines.length) throw new Error('أضف صنفاً واحداً على الأقل');
  return { lines, totalValue: total };
}

export function sumApprovedBenefitsUsage(benefits, staffMemberId, cashDayKey) {
  if (!Array.isArray(benefits)) return 0;
  return roundMoney(
    benefits
      .filter(
        (b) =>
          b.staffMemberId === staffMemberId &&
          b.cashDayKey === cashDayKey &&
          b.status === BENEFIT_STATUS_APPROVED &&
          b.benefitType !== BENEFIT_TYPE_PERSONAL
      )
      .reduce((s, b) => s + (Number(b.totalValue) || 0), 0)
  );
}

export function computeBenefitQuota({ limit, used, proposed }) {
  const lim = roundMoney(limit);
  const u = roundMoney(used);
  const p = roundMoney(proposed);
  const remaining = roundMoney(Math.max(0, lim - u));
  const proposedTotal = roundMoney(u + p);
  const exceeds = proposedTotal > lim + 0.001;
  return { limit: lim, used: u, proposed: p, remaining, proposedTotal, exceeds };
}

export function assertBenefitPermission(actor, { allowOverride = false } = {}) {
  const role = actor?.role;
  if (role !== 'admin' && role !== 'employee') {
    throw new Error('صلاحية غير كافية — سجّل الدخول كمدير أو موظف');
  }
  if (allowOverride && role !== 'admin') {
    throw new Error('تجاوز الحد مسموح للمدير فقط');
  }
}

/** معاينة واجهة استفادة الموظف — تحدد إن كان زر «مراجعة وتأكيد» متاحاً */
export function evaluateEmployeeBenefitPreview({
  benefitType,
  cashAmount,
  inventoryLines,
  productsById,
  usedToday,
  staffMember,
  openShift,
  isAdmin,
  override,
  overrideReason,
}) {
  const empty = { ok: false, total: 0, lines: [], quota: null, error: null, needsOverride: false };
  if (!staffMember?.id) {
    return { ...empty, error: 'اختر الموظف' };
  }
  const shiftOpen =
    openShift &&
    (openShift.status === 'open' ||
      (openShift.id && openShift.status !== 'closed' && openShift.status !== 'cancelled'));
  if (!shiftOpen) {
    return { ...empty, error: 'افتح وردية صندوق لتسجيل الاستفادة' };
  }
  const limit = roundMoney(staffMember.benefitLimitILS);
  if (!(limit > 0)) {
    return { ...empty, error: 'حد الاستفادة غير مضبوط لهذا الموظف' };
  }
  const used = roundMoney(usedToday ?? 0);
  try {
    let total = 0;
    let lines = [];
    if (benefitType === BENEFIT_TYPE_CASH) {
      total = roundMoney(parseFloat(cashAmount) || cashAmount);
      if (!(total > 0)) {
        return { ...empty, error: 'أدخل مبلغ كاش أكبر من صفر' };
      }
    } else if (benefitType === BENEFIT_TYPE_PERSONAL) {
      const resolved = resolvePersonalConsumptionLines(productsById, inventoryLines || []);
      lines = resolved.lines;
      total = resolved.totalValue;
      if (!(total > 0)) {
        return { ...empty, error: 'أضف أصنافاً للاستهلاك الشخصي' };
      }
    } else if (benefitType === BENEFIT_TYPE_INVENTORY) {
      const resolved = resolveBenefitLines(productsById, inventoryLines || []);
      lines = resolved.lines;
      total = resolved.totalValue;
      if (!(total > 0)) {
        return { ...empty, error: 'أضف أصنافاً واحداً على الأقل' };
      }
    } else {
      return { ...empty, error: 'نوع الاستفادة غير صالح' };
    }
    const quota = computeBenefitQuota({ limit, used, proposed: total });
    if (benefitType !== BENEFIT_TYPE_PERSONAL && quota.exceeds) {
      if (!isAdmin) {
        return {
          ok: false,
          total,
          lines,
          quota,
          error: `تجاوز الحد (المتبقي ${quota.remaining} ₪) — اطلب موافقة المدير`,
          needsOverride: false,
        };
      }
      if (!override || !String(overrideReason || '').trim()) {
        return {
          ok: false,
          total,
          lines,
          quota,
          error: 'فعّل الموافقة الإدارية وأدخل سبب التجاوز',
          needsOverride: true,
        };
      }
    }
    return { ok: true, total, lines, quota, error: null, needsOverride: false };
  } catch (e) {
    return { ...empty, error: e.message || 'تعذّر حساب الاستفادة' };
  }
}

export function validateBenefitInput({
  staffMember,
  benefitType,
  cashAmount,
  inventoryLines,
  productsById,
  usedToday,
  override,
  overrideReason,
  actor,
}) {
  assertBenefitPermission(actor, { allowOverride: override });
  if (!staffMember?.id) throw new Error('اختر الموظف');
  if (!staffMember.active && staffMember.active !== undefined) {
    throw new Error('الموظف غير نشط');
  }
  const limit = roundMoney(staffMember.benefitLimitILS);
  if (!(limit > 0)) throw new Error('حد الاستفادة غير مضبوط لهذا الموظف');

  let proposed = 0;
  let lines = [];
  if (benefitType === BENEFIT_TYPE_CASH) {
    proposed = roundMoney(cashAmount);
    if (!(proposed > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');
  } else if (benefitType === BENEFIT_TYPE_INVENTORY) {
    const resolved = resolveBenefitLines(productsById, inventoryLines);
    lines = resolved.lines;
    proposed = resolved.totalValue;
  } else if (benefitType === BENEFIT_TYPE_PERSONAL) {
    const resolved = resolvePersonalConsumptionLines(productsById, inventoryLines);
    lines = resolved.lines;
    proposed = resolved.totalValue;
  } else {
    throw new Error('نوع الاستفادة غير صالح');
  }

  const quota = computeBenefitQuota({ limit, used: usedToday, proposed });
  if (benefitType !== BENEFIT_TYPE_PERSONAL && quota.exceeds) {
    if (!override) {
      throw new Error(
        `تجاوز حد الاستفادة. الحد ${limit} ₪ — المستخدم ${quota.used} ₪ — المتبقي ${quota.remaining} ₪`
      );
    }
    const reason = String(overrideReason || '').trim();
    if (!reason) throw new Error('سبب التجاوز إلزامي عند الموافقة الإدارية');
  }

  return {
    limit,
    proposed,
    lines,
    quota,
    cashDayKey: getCashDayKey(),
    override: Boolean(override && quota.exceeds),
    overrideReason: override ? String(overrideReason || '').trim() : '',
  };
}
