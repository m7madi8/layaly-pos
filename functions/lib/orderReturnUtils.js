const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function remainingReturnableQty(line) {
  const soldQty = Number(line?.quantity) || 0;
  const priorReturns = Number(line?.returnedQty) || 0;
  return Math.max(0, soldQty - priorReturns);
}

function validatePartialReturnQuantity(line, qty) {
  const q = Number(qty) || 0;
  if (!(q > 0)) return { ok: false, message: 'أدخل كمية أكبر من صفر' };
  const remaining = remainingReturnableQty(line);
  if (q > remaining + 0.0001) {
    return { ok: false, message: `الكمية المسترجعة تتجاوز المباع (${remaining} متبقي)` };
  }
  return { ok: true };
}

const REFUND_METHOD_NONE = 'none';
const REFUND_METHOD_CASH = 'cash';
const REFUND_METHOD_DEBT = 'debt';

function normalizeRefundMethod(input, { refundAmount, refundCash }) {
  if (input?.refundMethod) return input.refundMethod;
  if (!(refundAmount > 0)) return REFUND_METHOD_NONE;
  if (refundCash) return REFUND_METHOD_CASH;
  return REFUND_METHOD_NONE;
}

module.exports = {
  money,
  remainingReturnableQty,
  validatePartialReturnQuantity,
  REFUND_METHOD_CASH,
  REFUND_METHOD_DEBT,
  normalizeRefundMethod,
};
