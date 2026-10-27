import {
  roundMoney,
  getProductType,
  costFromWeight,
  stockUnitsForItem,
} from './productPricing';
import { getCashDayKey } from './cashDayPeriod';

export const EMPLOYEE_BENEFIT_SECTION = 'employee_benefit';
export const EMPLOYEE_BENEFIT_CATEGORY = 'EmployeeBenefit';
export const BENEFIT_TYPE_CASH = 'cash';
export const BENEFIT_TYPE_INVENTORY = 'inventory';
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
    paymentMethod: benefitType === BENEFIT_TYPE_CASH ? 'Cash' : 'Inventory',
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

/** تكلفة سطر استفادة (لا سعر البيع) */
export function lineCostForBenefit(product, line) {
  const type = getProductType(product);
  const qty = Math.max(0, Number(line.quantity) || 0);
  if (type === 'time') {
    throw new Error(`صنف «${product.name}» بالوقت غير مدعوم لاستفادة الموظف`);
  }
  if (type === 'weight') {
    const grams = Number(line.weightGrams) || 0;
    if (!(grams > 0)) throw new Error(`أدخل وزن صنف «${product.name}»`);
    return roundMoney(costFromWeight(product, grams) * (qty > 0 ? qty : 1));
  }
  if (!(qty > 0)) throw new Error(`أدخل كمية صنف «${product.name}»`);
  return roundMoney((Number(product.cost) || 0) * qty);
}

export function resolveBenefitLines(productsById, rawLines) {
  const lines = [];
  let total = 0;
  for (const raw of rawLines || []) {
    const productId = String(raw.productId || '').trim();
    const product = productsById[productId];
    if (!product) throw new Error('صنف غير موجود');
    const lineTotal = lineCostForBenefit(product, raw);
    if (!(lineTotal > 0)) throw new Error(`قيمة صنف «${product.name}» غير صالحة`);
    const type = getProductType(product);
    lines.push({
      productId,
      name: product.name,
      productType: type,
      quantity: Number(raw.quantity) || 1,
      weightGrams: type === 'weight' ? Number(raw.weightGrams) || 0 : null,
      unitCost: type === 'weight'
        ? roundMoney(lineTotal / (Number(raw.quantity) || 1))
        : roundMoney(Number(product.cost) || 0),
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
          b.status === BENEFIT_STATUS_APPROVED
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
  if (role !== 'admin') {
    throw new Error('صلاحية غير كافية — تسجيل استفادة الموظفين للمدير فقط');
  }
  if (allowOverride && role !== 'admin') {
    throw new Error('تجاوز الحد مسموح للمدير فقط');
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
  } else {
    throw new Error('نوع الاستفادة غير صالح');
  }

  const quota = computeBenefitQuota({ limit, used: usedToday, proposed });
  if (quota.exceeds) {
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
