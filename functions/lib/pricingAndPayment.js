const { roundMoney } = require('./productPricing');

const SUPPORTED_PAYMENT_TYPES = new Set(['cash', 'debt', 'mixed', 'pending', 'compliment']);

function computePaymentBreakdown({ payment, total, customerId, isAdmin }) {
  const paymentType = String(payment?.paymentType || 'cash');
  if (!SUPPORTED_PAYMENT_TYPES.has(paymentType)) {
    throw new Error('طريقة دفع غير مدعومة');
  }
  const methodEarly = payment?.method || '';
  let paymentMethod = payment?.method || '';

  if (paymentType === 'compliment' || methodEarly === 'Compliment') {
    if (!isAdmin) throw new Error('الطلب المجاني يتطلب صلاحية مدير');
    return { finalStatus: 'paid', paymentMethod: 'Compliment', paymentType: 'compliment', cashPaid: 0, debtAmount: 0 };
  }
  if (paymentType === 'pending') {
    if (!customerId) throw new Error('الحفظ المؤجل للعملاء المسجلين فقط');
    return { finalStatus: 'unpaid', paymentMethod: paymentMethod || 'Pending', paymentType: 'pending', cashPaid: 0, debtAmount: 0 };
  }
  if (paymentType === 'cash') {
    return { finalStatus: 'paid', paymentMethod: 'Cash', paymentType: 'cash', cashPaid: total, debtAmount: 0 };
  }
  if (paymentType === 'debt') {
    if (!customerId) throw new Error('اختر عميلاً لتسجيل الدين');
    return { finalStatus: 'unpaid', paymentMethod: 'Debt', paymentType: 'debt', cashPaid: 0, debtAmount: total };
  }
  if (paymentType === 'mixed') {
    if (!customerId) throw new Error('اختر عميلاً للدفع الجزئي');
    const cashPaid = Math.min(total, Math.max(0, Number(payment.cashPaid) || 0));
    const debtAmount = Math.max(0, roundMoney(total - cashPaid));
    if (debtAmount <= 0) {
      return { finalStatus: 'paid', paymentMethod: 'Cash', paymentType: 'cash', cashPaid: total, debtAmount: 0 };
    }
    if (cashPaid <= 0) {
      return { finalStatus: 'unpaid', paymentMethod: 'Debt', paymentType: 'debt', cashPaid: 0, debtAmount: total };
    }
    return { finalStatus: 'partial', paymentMethod: 'Mixed', paymentType: 'mixed', cashPaid, debtAmount };
  }
  throw new Error('طريقة دفع غير مدعومة');
}

function applyDiscount(subtotal, discount, rounding) {
  let finalDiscount = Number(discount?.value) || 0;
  const discountType = discount?.type === 'percentage' ? 'percentage' : 'amount';
  let discountAmount = 0;
  if (discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, finalDiscount));
    finalDiscount = pct;
    discountAmount = roundMoney((subtotal * pct) / 100);
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, finalDiscount));
    finalDiscount = discountAmount;
  }
  let total = roundMoney(subtotal - discountAmount);
  if (total < 0) total = 0;
  if (rounding) total = Math.round(total);
  return { total, discountAmount, finalDiscount, discountType };
}

module.exports = {
  SUPPORTED_PAYMENT_TYPES,
  computePaymentBreakdown,
  applyDiscount,
};
