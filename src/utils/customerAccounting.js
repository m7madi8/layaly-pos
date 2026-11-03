/** محاسبة ملخص أرصدة العملاء — يعتمد على حقل balance المخزّن (مصدر النظام المعتمد). */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * إجمالي الديون المفتوحة على جميع العملاء = مجموع الأرصدة الموجبة الحالية.
 * لا يستخدم فلتر التاريخ ولا يعيد حساب الطلبات من الصفر.
 */
export function computeTotalOutstandingCustomerDebt(customers = []) {
  return money(
    (customers || []).reduce((sum, customer) => {
      const balance = money(customer?.balance);
      return balance > 0 ? sum + balance : sum;
    }, 0)
  );
}

/** عدد العملاء الذين لديهم رصيد مستحق أكبر من صفر */
export function countCustomersWithOutstandingDebt(customers = []) {
  return (customers || []).filter((c) => money(c?.balance) > 0).length;
}
