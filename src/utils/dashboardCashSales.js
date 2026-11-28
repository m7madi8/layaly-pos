/**
 * «كاش اليوم» / «دين اليوم» — من حقول الطلب (cashPaid / debtAmount)، وليس حركات الصندوق
 * لتجنب العد المزدوج مع cashMovements.
 */

import { effectiveDebt } from './orderAccounting';
import { getBusinessCalendarDayStart } from './businessTimezone';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** بداية اليوم التقويمي في Asia/Hebron (لوحة التحكم والاستعلامات). */
export function getLocalCalendarDayStart(reference = new Date()) {
  return getBusinessCalendarDayStart(reference);
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
  const returns = Number(order.returnCashTotal) || 0;
  return money(Math.max(0, cash - returns));
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

/** مبلغ الفيزا المُسجَّل على الطلب — لا يدخل في رصيد الصندوق النقدي. */
export function orderCardCollected(order) {
  if (!order || order.status === 'cancelled') return 0;
  if (order.paymentMethod === 'Compliment' || order.paymentType === 'compliment') return 0;
  const explicit = Number(order.cardPaid);
  if (Number.isFinite(explicit) && explicit > 0) {
    const returns = Number(order.returnCardTotal) || 0;
    return money(Math.max(0, explicit - returns));
  }
  if (order.paymentType === 'card' || order.paymentMethod === 'Card') {
    if (order.status !== 'paid' && order.status !== 'partial') return 0;
    const total = Number(order.total) || 0;
    return money(total);
  }
  return 0;
}

export function computeTodayCardSales(orders, dayStart) {
  if (!Array.isArray(orders) || !dayStart) return 0;
  let sum = 0;
  for (const order of orders) {
    if (!isOrderOnOrAfterDayStart(order, dayStart)) continue;
    sum += orderCardCollected(order);
  }
  return money(sum);
}

export function orderTimestampMs(order) {
  const ms = Number(order?.createdAtMs);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const d = orderTimestampDate(order);
  return d ? d.getTime() : 0;
}

/** ملخص مبيعات الشفت من الطلبات المحمّلة (بدون استعلام إضافي). */
export function shiftCardDebtRepayments(shift) {
  if (!shift) return 0;
  return money(Number(shift.cardDebtRepayments) || 0);
}

/** تجميع تحصيل دين بالفيزا من ورديات اليوم (بدون مسح الطلبات). */
export function sumTodayCardDebtRepaymentsFromShifts(shifts, dayStart) {
  if (!Array.isArray(shifts) || !dayStart) return 0;
  const dayMs = dayStart.getTime();
  let sum = 0;
  for (const shift of shifts) {
    const anchor = Number(shift.closedAtMs) || Number(shift.openedAtMs) || 0;
    if (!anchor || anchor < dayMs) continue;
    sum += Number(shift.cardDebtRepayments) || 0;
  }
  return money(sum);
}

export function summarizeShiftOrderSales(orders, openedAtMs, closedAtMs = Date.now()) {
  const from = Number(openedAtMs) || 0;
  const to = Number(closedAtMs) || Date.now();
  let totalSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let debtSales = 0;
  let cardSaleCount = 0;
  for (const o of orders || []) {
    if (o.status === 'cancelled') continue;
    const ms = orderTimestampMs(o);
    if (!ms || ms < from || ms > to) continue;
    totalSales += Number(o.total) || 0;
    const cash = orderCashCollected(o);
    const card = orderCardCollected(o);
    cashSales += cash;
    cardSales += card;
    debtSales += orderDebtRecorded(o);
    if (card > 0) cardSaleCount += 1;
  }
  return {
    totalSales: money(totalSales),
    cashSales: money(cashSales),
    cardSales: money(cardSales),
    debtSales: money(debtSales),
    cardSaleCount,
  };
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
