import { roundMoney } from './employeeBenefitAccounting';

/** Pro-rata refund from line price (unit or line-total safe). */
export function suggestedLineRefundAmount(line, qtyReturned) {
  const soldQty = Math.max(0.0001, Number(line?.quantity) || 0);
  const q = Number(qtyReturned) || 0;
  if (!(q > 0)) return 0;
  const lineTotal = Number(line?.lineTotal);
  if (Number.isFinite(lineTotal) && lineTotal >= 0) {
    return roundMoney((lineTotal / soldQty) * q);
  }
  const unit = Number(line?.unitPrice ?? line?.price) || 0;
  return roundMoney(unit * q);
}

export const REFUND_METHOD_NONE = 'none';
export const REFUND_METHOD_CASH = 'cash';
export const REFUND_METHOD_DEBT = 'debt';

export function normalizeRefundMethod(input, { refundAmount, refundCash }) {
  if (input?.refundMethod) return input.refundMethod;
  if (!(refundAmount > 0)) return REFUND_METHOD_NONE;
  if (refundCash) return REFUND_METHOD_CASH;
  return REFUND_METHOD_NONE;
}
