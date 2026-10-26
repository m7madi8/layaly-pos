const crypto = require('crypto');

/** Stable fingerprint for idempotency — ignores client prices; canonicalizes line inputs only. */
function buildRequestFingerprint(payload) {
  const canonical = {
    editingOrderId: payload.editingOrderId || null,
    customerId: payload.customerId || '',
    lines: (payload.lines || []).map((l) => ({
      productId: String(l.productId || ''),
      quantity: Number(l.quantity) || 0,
      lineId: String(l.lineId || ''),
      weightGrams: l.weightGrams != null ? Number(l.weightGrams) : null,
      sessionId: l.sessionId ? String(l.sessionId) : null,
      selectedAddonNames: [...(l.selectedAddonNames || [])].map(String).sort(),
    })),
    discount: {
      type: payload.discount?.type === 'percentage' ? 'percentage' : 'amount',
      value: Number(payload.discount?.value) || 0,
    },
    payment: {
      paymentType: String(payload.payment?.paymentType || 'cash'),
      statusIntent: payload.payment?.statusIntent || 'paid',
      cashPaid: payload.payment?.cashPaid != null ? Number(payload.payment.cashPaid) : null,
      customPrice: payload.payment?.customPrice != null ? Number(payload.payment.customPrice) : null,
    },
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

module.exports = { buildRequestFingerprint };
