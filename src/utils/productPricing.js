/** أنواع الأصناف — الأصناف القديمة بدون productType تُعامل كـ standard */
export const PRODUCT_TYPES = [
  { id: 'standard', label: 'عادي' },
  { id: 'weight', label: 'بالوزن' },
  { id: 'time', label: 'بالوقت' },
];

export const TIME_ROUNDING_OPTIONS = [
  { id: 'up', label: 'تقريب لأعلى لوحدة الفوترة التالية' },
  { id: 'exact', label: 'حساب دقيق بالدقيقة' },
];

export function getProductType(product) {
  const t = product?.productType;
  return t === 'weight' || t === 'time' ? t : 'standard';
}

function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export const roundMoney = (value) => roundTo(value, 2);
export const roundWeight = (value) => roundTo(value, 2);

/** سعر الغرام = السعر الأساسي ÷ الوزن الأساسي (مثال: 1₪ لكل 2غ = 0.5₪/غ) */
export function weightPricePerUnit(product) {
  const baseWeight = Number(product?.weightPricing?.baseWeight);
  const basePrice = Number(product?.weightPricing?.basePrice);
  if (!(baseWeight > 0) || !(basePrice > 0)) return 0;
  return basePrice / baseWeight;
}

export function amountFromWeight(product, grams) {
  const perUnit = weightPricePerUnit(product);
  const g = Number(grams);
  if (!(perUnit > 0) || !(g > 0)) return 0;
  return roundMoney(g * perUnit);
}

export function weightFromAmount(product, amount) {
  const perUnit = weightPricePerUnit(product);
  const a = Number(amount);
  if (!(perUnit > 0) || !(a > 0)) return 0;
  return roundWeight(a / perUnit);
}

/** تكلفة الصنف بالوزن مخزّنة لكل وزن أساسي (نفس وحدة السعر الأساسي) */
export function costFromWeight(product, grams) {
  const baseWeight = Number(product?.weightPricing?.baseWeight);
  const cost = Number(product?.cost) || 0;
  const g = Number(grams);
  if (!(baseWeight > 0) || !(g > 0) || cost <= 0) return 0;
  return roundMoney((cost / baseWeight) * g);
}

export function validateWeightPricing(weightPricing) {
  const baseWeight = Number(weightPricing?.baseWeight);
  const basePrice = Number(weightPricing?.basePrice);
  if (!(baseWeight > 0)) return 'الوزن الأساسي يجب أن يكون أكبر من صفر';
  if (!(basePrice > 0)) return 'السعر الأساسي يجب أن يكون أكبر من صفر';
  return null;
}

export function validateTimePricing(timePricing) {
  const billingMinutes = Number(timePricing?.billingMinutes);
  const billingPrice = Number(timePricing?.billingPrice);
  if (!(billingMinutes > 0)) return 'وحدة الفوترة (بالدقائق) يجب أن تكون أكبر من صفر';
  if (!(billingPrice > 0)) return 'سعر وحدة الفوترة يجب أن يكون أكبر من صفر';
  return null;
}

/** الدقائق المفوترة حسب طريقة التقريب (الافتراضي: تقريب لأعلى) */
export function billableMinutes(durationMinutes, billingMinutes, rounding = 'up') {
  const d = Number(durationMinutes);
  const unit = Number(billingMinutes);
  if (!(d > 0) || !(unit > 0)) return 0;
  if (rounding === 'exact') return roundTo(d, 2);
  return Math.ceil(roundTo(d / unit, 6)) * unit;
}

export function timePrice(timePricing, durationMinutes) {
  const unit = Number(timePricing?.billingMinutes);
  const price = Number(timePricing?.billingPrice);
  if (!(unit > 0) || !(price > 0)) return 0;
  const minutes = billableMinutes(durationMinutes, unit, timePricing?.rounding || 'up');
  return roundMoney((minutes / unit) * price);
}

export function durationMinutesBetween(start, end) {
  const s = start instanceof Date ? start.getTime() : Number(start);
  const e = end instanceof Date ? end.getTime() : Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, (e - s) / 60000);
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} د`;
  return m === 0 ? `${h} س` : `${h} س ${m} د`;
}

/** كمية المخزون التي يستهلكها سطر الطلب: الغرامات لأصناف الوزن، لا شيء لأصناف الوقت */
export function stockUnitsForItem(item) {
  const type = getProductType(item);
  const qty = Number(item?.quantity) || 0;
  if (type === 'time') return 0;
  if (type === 'weight') return (Number(item?.weightGrams) || 0) * qty;
  return qty;
}

/** وصف مختصر لسطر الفاتورة: الوزن أو مدة الجلسة — فارغ للأصناف العادية */
export function itemDetailLabel(item) {
  const type = getProductType(item);
  if (type === 'weight' && Number(item?.weightGrams) > 0) return `${roundWeight(item.weightGrams)} غ`;
  if (type === 'time' && item?.durationMinutes != null) return formatDuration(item.durationMinutes);
  return '';
}

export function electricityCost(totalMinutes, costPerHour) {
  const rate = Number(costPerHour);
  const m = Number(totalMinutes);
  if (!(rate > 0) || !(m > 0)) return 0;
  return roundMoney((m / 60) * rate);
}

/**
 * ملخص جلسات البلايستيشن المنتهية خلال فترة.
 * الكهرباء تُحسب بسعر الساعة المحفوظ مع كل جلسة، والإيراد من الجلسات المفوترة فقط.
 */
export function summarizePlaystationSessions(sessions, isInPeriod, fallbackRate = 0) {
  const ended = (sessions || []).filter(
    (s) => s && s.status === 'ended' && s.endedAtMs && isInPeriod(new Date(s.endedAtMs))
  );
  let totalMinutes = 0;
  let revenue = 0;
  let electricity = 0;
  let unbilledCount = 0;
  let unbilledValue = 0;
  const byStation = {};
  for (const s of ended) {
    const minutes = Number(s.durationMinutes) || 0;
    const rate = s.electricityCostPerHour != null ? s.electricityCostPerHour : fallbackRate;
    const elec = electricityCost(minutes, rate);
    const price = Number(s.price) || 0;
    totalMinutes += minutes;
    electricity += elec;
    if (s.billed) revenue += price;
    else {
      unbilledCount += 1;
      unbilledValue += price;
    }
    const key = s.stationName || s.stationId || '—';
    const row = byStation[key] || (byStation[key] = { station: key, sessions: 0, minutes: 0, revenue: 0, electricity: 0 });
    row.sessions += 1;
    row.minutes += minutes;
    row.electricity += elec;
    if (s.billed) row.revenue += price;
  }
  return {
    sessionCount: ended.length,
    totalMinutes: roundMoney(totalMinutes),
    totalHours: roundMoney(totalMinutes / 60),
    revenue: roundMoney(revenue),
    electricity: roundMoney(electricity),
    net: roundMoney(revenue - electricity),
    unbilledCount,
    unbilledValue: roundMoney(unbilledValue),
    byStation: Object.values(byStation).map((r) => ({
      ...r,
      minutes: roundMoney(r.minutes),
      revenue: roundMoney(r.revenue),
      electricity: roundMoney(r.electricity),
    })),
  };
}

export function productPriceLabel(product, fmtMoney) {
  const type = getProductType(product);
  if (type === 'weight') {
    const wp = product.weightPricing || {};
    return `${fmtMoney(wp.basePrice || 0)} / ${wp.baseWeight || 0} غ`;
  }
  if (type === 'time') {
    const tp = product.timePricing || {};
    return `${fmtMoney(tp.billingPrice || 0)} / ${tp.billingMinutes || 0} د`;
  }
  return fmtMoney(product.price || 0);
}
