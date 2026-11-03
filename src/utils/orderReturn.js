/** Remaining quantity that can still be returned on an order line. */
export function remainingReturnableQty(line) {
  const soldQty = Number(line?.quantity) || 0;
  const priorReturns = Number(line?.returnedQty) || 0;
  return Math.max(0, soldQty - priorReturns);
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export function validatePartialReturnQuantity(line, qty) {
  const q = Number(qty) || 0;
  if (!(q > 0)) return { ok: false, message: 'أدخل كمية أكبر من صفر' };
  const remaining = remainingReturnableQty(line);
  if (q > remaining + 0.0001) {
    return { ok: false, message: `الكمية المسترجعة تتجاوز المباع (${remaining} متبقي)` };
  }
  return { ok: true };
}
