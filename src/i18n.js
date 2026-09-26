/** تنسيق وعرض النصوص العربية */
export const fmtMoney = (amount) => {
  const n = Number(amount || 0);
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
};

export const fmtMoneyPlain = (amount) => {
  const n = Number(amount || 0);
  return `ILS ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

export const fmtMoneyShort = (amount) => fmtMoney(amount);

export const orderFilterLabel = (filter) => {
  const map = {
    all: 'الكل',
    today: 'اليوم',
    yesterday: 'أمس',
    lastWeek: 'آخر 7 أيام',
    lastMonth: 'الشهر الماضي',
    custom: 'مخصص',
  };
  return map[filter] || filter;
};

export const orderStatusLabel = (status) => {
  const map = {
    all: 'الكل',
    paid: 'مدفوع',
    unpaid: 'دين / غير مدفوع',
    partial: 'مدفوع جزئياً',
    cancelled: 'ملغى',
  };
  return map[status] || status;
};

export const paymentTypeLabel = (type) => {
  const map = {
    cash: 'كاش',
    debt: 'دين',
    mixed: 'كاش + دين',
    compliment: 'مجاني',
    pending: 'مؤجل',
  };
  return map[type] || type;
};

export const reportFilterLabel = (filter) => orderFilterLabel(filter);

export const expenseFilterLabel = (filter) => {
  const map = {
    all: 'الكل',
    today: 'اليوم',
    yesterday: 'أمس',
    lastWeek: 'آخر 7 أيام',
    lastMonth: 'آخر 30 يوم',
    custom: 'مخصص',
  };
  return map[filter] || orderFilterLabel(filter);
};

export const categoryLabel = (cat) => (cat === 'all' ? 'الكل' : cat);

export const paymentMethodLabel = (method) => {
  const map = {
    Cash: 'كاش',
    Debt: 'دين',
    Mixed: 'كاش + دين',
    'Debit Card': 'بطاقة خصم',
    'Credit Card': 'بطاقة ائتمان',
    QRIS: 'QR',
    Compliment: 'مجاني',
    DANA: 'DANA',
    GoPay: 'GoPay',
    OVO: 'OVO',
    'ShopeePay': 'ShopeePay',
    'Transfer Bank': 'تحويل بنكي',
    Visa: 'Visa',
    Mastercard: 'Mastercard',
    'E-Money': 'محفظة إلكترونية',
  };
  return map[method] || method;
};

export const expenseCategoryLabel = (cat) => {
  const map = {
    Salaries: 'رواتب',
    Rent: 'إيجار',
    Food: 'أكل',
    Advance: 'سلف',
    Purchase: 'مشتريات',
    Inventory: 'مشتريات',
    Utilities: 'مرافق',
    Maintenance: 'صيانة',
    Marketing: 'تسويق',
    Other: 'أخرى',
  };
  return map[cat] || cat;
};
