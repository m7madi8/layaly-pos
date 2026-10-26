/**
 * «كاش اليوم» / «دين اليوم» — من حقول الطلب (cashPaid / debtAmount)، وليس حركات الصندوق
 * لتجنب العد المزدوج مع cashMovements.
 */

import { effectiveDebt } from './orderAccounting';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** نفس بداية اليوم المستخدمة في لوحة التحكم والتقارير (تقويم محلي، منتصف الليل). */
export function getLocalCalendarDayStart(reference = new Date()) {
  const d = reference instanceof Date ? reference : new Date(reference);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function orderTimestampDate(order) {
  if (!order?.timestamp) return null;
  return order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
}

export function isOrderOnOrAfterDayStart(order, dayStart) {
  const orderDate = orderTimestampDate(order);
  if (!orderDate || !dayStart) return false;
  return orderDate >= dayStart;
}

/** المبلغ النقدي المُسجَّل على الطلب — صفر للملغى والمجاني وغير المدفوع نقداً. */
export function orderCashCollected(order) {
  if (!order || order.status === 'cancelled') return 0;
  if (order.paymentMethod === 'Compliment' || order.paymentType === 'compliment') return 0;
  const cash = Number(order.cashPaid);
  if (!Number.isFinite(cash) || cash <= 0) return 0;
  return money(cash);
}

export function computeTodayCashSales(orders, dayStart) {
  if (!Array.isArray(orders) || !dayStart) return 0;
  let sum = 0;
  for (const order of orders) {
    if (!isOrderOnOrAfterDayStart(order, dayStart)) continue;
    sum += orderCashCollected(order);
  }
  return money(sum);
}

/** الدين المُسجَّل على طلبات اليوم (حقل debtAmount لعميل مرتبط — نفس منطق رصيد العميل). */
export function orderDebtRecorded(order) {
  return effectiveDebt(order);
}

export function computeTodayDebtSales(orders, dayStart) {
  if (!Array.isArray(orders) || !dayStart) return 0;
  let sum = 0;
  for (const order of orders) {
    if (!isOrderOnOrAfterDayStart(order, dayStart)) continue;
    sum += orderDebtRecorded(order);
  }
  return money(sum);
}
