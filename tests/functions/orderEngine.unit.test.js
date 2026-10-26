const { computePaymentBreakdown, applyDiscount } = require('../../functions/lib/pricingAndPayment');

describe('trusted order engine (unit)', () => {
  test('cash sale uses full total', () => {
    const pay = computePaymentBreakdown({
      payment: { paymentType: 'cash', statusIntent: 'paid' },
      total: 42.5,
      customerId: '',
      isAdmin: false,
    });
    expect(pay.cashPaid).toBe(42.5);
    expect(pay.debtAmount).toBe(0);
    expect(pay.finalStatus).toBe('paid');
  });

  test('debt sale requires customer', () => {
    expect(() =>
      computePaymentBreakdown({
        payment: { paymentType: 'debt' },
        total: 10,
        customerId: '',
        isAdmin: false,
      })
    ).toThrow();
  });

  test('mixed payment splits cash and debt', () => {
    const pay = computePaymentBreakdown({
      payment: { paymentType: 'mixed', cashPaid: 15 },
      total: 40,
      customerId: 'c1',
      isAdmin: false,
    });
    expect(pay.cashPaid).toBe(15);
    expect(pay.debtAmount).toBe(25);
    expect(pay.finalStatus).toBe('partial');
  });

  test('compliment requires admin', () => {
    expect(() =>
      computePaymentBreakdown({
        payment: { paymentType: 'compliment' },
        total: 10,
        customerId: '',
        isAdmin: false,
      })
    ).toThrow();
  });

  test('amount discount capped at subtotal', () => {
    const { total, discountAmount } = applyDiscount(50, { type: 'amount', value: 80 }, false);
    expect(discountAmount).toBe(50);
    expect(total).toBe(0);
  });

  test('rounding when enabled', () => {
    const { total } = applyDiscount(10.4, { type: 'amount', value: 0 }, true);
    expect(total).toBe(10);
  });

  test('percentage discount capped at 100%', () => {
    const { total, discountAmount } = applyDiscount(50, { type: 'percentage', value: 150 }, false);
    expect(discountAmount).toBe(50);
    expect(total).toBe(0);
  });

  test('mixed payment caps cash at total', () => {
    const pay = computePaymentBreakdown({
      payment: { paymentType: 'mixed', cashPaid: 999 },
      total: 30,
      customerId: 'c1',
      isAdmin: false,
    });
    expect(pay.cashPaid).toBe(30);
    expect(pay.debtAmount).toBe(0);
    expect(pay.finalStatus).toBe('paid');
  });

  test('unsupported payment type rejected', () => {
    expect(() =>
      computePaymentBreakdown({
        payment: { paymentType: 'card' },
        total: 10,
        customerId: '',
        isAdmin: false,
      })
    ).toThrow();
  });
});
