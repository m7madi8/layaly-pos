/** Client idempotency keys for trusted callables (orders, cash shifts). */
export function newIdempotencyKey(prefix = 'idem') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
