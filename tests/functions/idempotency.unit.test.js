const { buildRequestFingerprint } = require('../../functions/lib/idempotency');

describe('idempotency fingerprint', () => {
  const base = {
    lines: [{ productId: 'p1', quantity: 2, lineId: 'p1' }],
    discount: { type: 'amount', value: 0 },
    payment: { paymentType: 'cash', statusIntent: 'paid' },
  };

  test('same payload → same fingerprint', () => {
    const a = buildRequestFingerprint(base);
    const b = buildRequestFingerprint({ ...base });
    expect(a).toBe(b);
  });

  test('different quantity → different fingerprint', () => {
    const a = buildRequestFingerprint(base);
    const b = buildRequestFingerprint({
      ...base,
      lines: [{ productId: 'p1', quantity: 3, lineId: 'p1' }],
    });
    expect(a).not.toBe(b);
  });

  test('client price fields are ignored if added to payload', () => {
    const a = buildRequestFingerprint(base);
    const b = buildRequestFingerprint({ ...base, total: 999, fakePrice: 1 });
    expect(a).toBe(b);
  });
});
