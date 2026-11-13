/**
 * حساب مالي موحّد للموظف — يُشتق من السجلات الفعلية دون تخزين رصيد يدوي على staffMembers.
 * الرصيد الموجب: مستحق للموظف | السالب: على الموظف دين.
 */

import { roundMoney } from './employeeBenefitAccounting';
import { expensePaymentSourceLabel } from './expensePaymentSource';

export const EMP_LEDGER_TYPES = {
  SALARY_ACCRUAL: 'salary_accrual',
  SALARY_PAYMENT: 'salary_payment',
  ADVANCE: 'advance',
  ADVANCE_REPAY: 'advance_repay',
  PAYROLL_DEDUCT: 'payroll_deduct',
  POS_DEBT: 'pos_debt',
  POS_DEBT_REPAY: 'pos_debt_repay',
  DEBT_REPAY: 'debt_repay',
  BENEFIT: 'benefit',
  ADJUSTMENT: 'adjustment',
};

export function employeeLedgerTypeLabel(type) {
  const map = {
    [EMP_LEDGER_TYPES.SALARY_ACCRUAL]: 'راتب مستحق',
    [EMP_LEDGER_TYPES.SALARY_PAYMENT]: 'دفعة راتب',
    [EMP_LEDGER_TYPES.ADVANCE]: 'سلفة',
    [EMP_LEDGER_TYPES.ADVANCE_REPAY]: 'تسديد سلفة',
    [EMP_LEDGER_TYPES.PAYROLL_DEDUCT]: 'خصم من راتب',
    [EMP_LEDGER_TYPES.POS_DEBT]: 'مشتريات بالدين — نقطة البيع',
    [EMP_LEDGER_TYPES.POS_DEBT_REPAY]: 'تسديد دين نقطة البيع',
    [EMP_LEDGER_TYPES.DEBT_REPAY]: 'تسديد دين',
    [EMP_LEDGER_TYPES.BENEFIT]: 'استفادة موظف',
    [EMP_LEDGER_TYPES.ADJUSTMENT]: 'تعديل مالي',
  };
  return map[type] || type || '—';
}

function parseMs(v) {
  if (v == null) return 0;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** + يزيد مستحق الموظف، − يزيد دين الموظف */
export function signedDeltaForLedgerType(type, amount) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) return 0;
  switch (type) {
    case EMP_LEDGER_TYPES.SALARY_ACCRUAL:
      return amt;
    case EMP_LEDGER_TYPES.SALARY_PAYMENT:
    case EMP_LEDGER_TYPES.ADVANCE:
    case EMP_LEDGER_TYPES.POS_DEBT:
      return -amt;
    case EMP_LEDGER_TYPES.ADVANCE_REPAY:
    case EMP_LEDGER_TYPES.POS_DEBT_REPAY:
    case EMP_LEDGER_TYPES.DEBT_REPAY:
    case EMP_LEDGER_TYPES.PAYROLL_DEDUCT:
      return amt;
    case EMP_LEDGER_TYPES.BENEFIT:
    default:
      return 0;
  }
}

export function formatEmployeeNetBalance(net) {
  const n = roundMoney(net);
  if (Math.abs(n) < 0.01) {
    return { kind: 'settled', label: 'الحساب مسدد', amount: 0, tone: 'neutral' };
  }
  if (n > 0) {
    return { kind: 'credit', label: 'مستحق له', amount: n, tone: 'positive' };
  }
  return { kind: 'debit', label: 'عليه دين', amount: Math.abs(n), tone: 'negative' };
}

export function computeEmployeeObligationsAndEntitlements({
  accruals = [],
  advances = [],
  posDebts = [],
}) {
  let unpaidSalary = 0;
  for (const a of accruals) {
    const due = roundMoney((Number(a.amountDue) || 0) - (Number(a.amountPaid) || 0));
    if (due > 0) unpaidSalary += due;
  }
  unpaidSalary = roundMoney(unpaidSalary);

  let openAdvances = 0;
  for (const adv of advances) {
    const rem = roundMoney(Number(adv.balanceRemaining) || 0);
    if (rem > 0 && adv.status !== 'closed') openAdvances += rem;
  }
  openAdvances = roundMoney(openAdvances);

  let openPosDebt = 0;
  for (const d of posDebts) {
    const rem = roundMoney((Number(d.amount) || 0) - (Number(d.amountRepaid) || 0));
    if (rem > 0 && d.status !== 'cancelled') openPosDebt += rem;
  }
  openPosDebt = roundMoney(openPosDebt);

  const net = roundMoney(unpaidSalary - openAdvances - openPosDebt);
  return { unpaidSalary, openAdvances, openPosDebt, net };
}

export function summarizeEmployeePayrollHistory({ accruals = [], payrollPayments = [], expenses = [] }) {
  let totalAccrued = 0;
  let totalPaid = 0;
  for (const a of accruals) {
    totalAccrued += roundMoney(a.amountDue);
    totalPaid += roundMoney(a.amountPaid);
  }
  const salaryExpensePaid = roundMoney(
    (expenses || [])
      .filter((e) => e.category === 'Salaries' && !e.cancelled)
      .reduce((s, e) => s + roundMoney(e.amount), 0)
  );
  return {
    totalAccrued: roundMoney(totalAccrued),
    totalPaidOnAccruals: roundMoney(totalPaid),
    salaryPaymentsCount: payrollPayments.length,
    salaryExpensePaid: salaryExpensePaid || roundMoney(totalPaid),
  };
}

/**
 * بناء سجل زمني موحّد مع رصيد جاري.
 */
export function buildEmployeeLedgerRows({
  staffMemberId,
  accruals = [],
  payrollPayments = [],
  advances = [],
  advanceRepayments = [],
  benefits = [],
  posDebts = [],
  posRepayments = [],
  expenses = [],
}) {
  const sid = String(staffMemberId || '');
  const rows = [];

  for (const a of accruals) {
    if (String(a.staffMemberId) !== sid) continue;
    const ms = parseMs(a.createdAtMs) || parseMs(a.createdAt) || parseMs(a.dueDate);
    rows.push({
      id: `accrual_${a.id}`,
      sourceId: a.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.SALARY_ACCRUAL,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.SALARY_ACCRUAL),
      amount: roundMoney(a.amountDue),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.SALARY_ACCRUAL, a.amountDue),
      dateMs: ms,
      sourceModule: 'payroll',
      paymentSource: null,
      notes: a.periodLabel || '',
      meta: { amountPaid: a.amountPaid, status: a.status },
    });
  }

  for (const p of payrollPayments) {
    if (String(p.staffMemberId) !== sid) continue;
    const exp = expenses.find((e) => e.id === p.expenseId);
    const ms = parseMs(p.createdAtMs) || parseMs(p.createdAt);
    rows.push({
      id: `pay_${p.id}`,
      sourceId: p.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.SALARY_PAYMENT,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.SALARY_PAYMENT),
      amount: roundMoney(p.amount),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.SALARY_PAYMENT, p.amount),
      dateMs: ms,
      sourceModule: 'payroll',
      paymentSource: exp ? expensePaymentSourceLabel(exp) : (p.paymentMethod === 'Vault' ? 'الخزنة' : 'الصندوق'),
      notes: exp?.notes || '',
      meta: { accrualId: p.accrualId, expenseId: p.expenseId },
    });
  }

  for (const adv of advances) {
    if (String(adv.staffMemberId) !== sid) continue;
    const ms = parseMs(adv.createdAtMs) || parseMs(adv.createdAt);
    rows.push({
      id: `adv_${adv.id}`,
      sourceId: adv.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.ADVANCE,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.ADVANCE),
      amount: roundMoney(adv.amount),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.ADVANCE, adv.amount),
      dateMs: ms,
      sourceModule: 'payroll',
      paymentSource: null,
      notes: adv.notes || '',
      meta: { balanceRemaining: adv.balanceRemaining },
    });
  }

  const advanceRepaySeen = new Set((advanceRepayments || []).map((r) => r.id));
  for (const e of expenses) {
    if (String(e.staffMemberId) !== sid || !e.isAdvanceRepayment) continue;
    if (e.advanceRepaymentId && advanceRepaySeen.has(e.advanceRepaymentId)) continue;
    const ms = parseMs(e.createdAtMs) || parseMs(e.createdAt);
    rows.push({
      id: `adv_repay_exp_${e.id}`,
      sourceId: e.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.ADVANCE_REPAY,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.ADVANCE_REPAY),
      amount: roundMoney(e.amount),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.ADVANCE_REPAY, e.amount),
      dateMs: ms,
      sourceModule: 'payroll',
      paymentSource: expensePaymentSourceLabel(e),
      notes: e.notes || '',
      meta: { expenseId: e.id, employeeAdvanceId: e.employeeAdvanceId },
    });
  }

  for (const r of advanceRepayments) {
    if (String(r.staffMemberId) !== sid) continue;
    const ms = parseMs(r.createdAtMs) || parseMs(r.createdAt);
    const isPayrollDeduct = r.paymentMethod === 'payroll_deduct';
    rows.push({
      id: `adv_repay_${r.id}`,
      sourceId: r.id,
      staffMemberId: sid,
      type: isPayrollDeduct ? EMP_LEDGER_TYPES.PAYROLL_DEDUCT : EMP_LEDGER_TYPES.ADVANCE_REPAY,
      label: employeeLedgerTypeLabel(
        isPayrollDeduct ? EMP_LEDGER_TYPES.PAYROLL_DEDUCT : EMP_LEDGER_TYPES.ADVANCE_REPAY
      ),
      amount: roundMoney(r.amount),
      signedDelta: signedDeltaForLedgerType(
        isPayrollDeduct ? EMP_LEDGER_TYPES.PAYROLL_DEDUCT : EMP_LEDGER_TYPES.ADVANCE_REPAY,
        r.amount
      ),
      dateMs: ms,
      sourceModule: 'payroll',
      paymentSource: isPayrollDeduct ? 'خصم راتب' : expensePaymentSourceLabel(r) || '—',
      notes: r.notes || '',
      meta: { advanceId: r.advanceId, expenseId: r.expenseId },
    });
  }

  for (const b of benefits) {
    if (String(b.staffMemberId) !== sid) continue;
    if (b.status === 'cancelled') continue;
    const ms = parseMs(b.createdAtMs) || parseMs(b.createdAt);
    rows.push({
      id: `ben_${b.id}`,
      sourceId: b.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.BENEFIT,
      label:
        b.benefitType === 'cash'
          ? 'استفادة (كاش)'
          : b.benefitType === 'personal_consumption'
            ? 'استهلاك شخصي'
            : 'استفادة (أصناف)',
      amount: roundMoney(b.totalValue),
      signedDelta: 0,
      dateMs: ms,
      sourceModule: 'benefit',
      paymentSource: b.shiftId ? `شفت ${b.shiftId.slice(0, 6)}…` : '—',
      notes: b.benefitNumber ? `رقم ${b.benefitNumber}` : b.notes || '',
      meta: { benefitType: b.benefitType, shiftId: b.shiftId },
    });
  }

  for (const d of posDebts) {
    if (String(d.staffMemberId) !== sid) continue;
    if (d.status === 'cancelled') continue;
    const ms = parseMs(d.createdAtMs) || parseMs(d.createdAt);
    rows.push({
      id: `pos_${d.id}`,
      sourceId: d.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.POS_DEBT,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.POS_DEBT),
      amount: roundMoney(d.amount),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.POS_DEBT, d.amount),
      dateMs: ms,
      sourceModule: 'pos',
      paymentSource: 'نقطة البيع',
      notes: d.orderNumber ? `طلب #${d.orderNumber}` : d.itemsSummary || '',
      meta: { orderId: d.orderId, orderNumber: d.orderNumber },
    });
  }

  for (const r of posRepayments) {
    if (String(r.staffMemberId) !== sid) continue;
    const ms = parseMs(r.createdAtMs) || parseMs(r.createdAt);
    rows.push({
      id: `pos_repay_${r.id}`,
      sourceId: r.id,
      staffMemberId: sid,
      type: EMP_LEDGER_TYPES.DEBT_REPAY,
      label: employeeLedgerTypeLabel(EMP_LEDGER_TYPES.DEBT_REPAY),
      amount: roundMoney(r.amount),
      signedDelta: signedDeltaForLedgerType(EMP_LEDGER_TYPES.DEBT_REPAY, r.amount),
      dateMs: ms,
      sourceModule: 'employee_ledger',
      paymentSource: r.paymentSourceLabel || '—',
      notes: r.notes || '',
      meta: r.allocations || [],
    });
  }

  rows.sort((a, b) => a.dateMs - b.dateMs || String(a.id).localeCompare(String(b.id)));
  let running = 0;
  return rows.map((row) => {
    running = roundMoney(running + row.signedDelta);
    return { ...row, runningBalance: running };
  });
}

export function filterLedgerRows(rows, { type, fromMs, toMs }) {
  return (rows || []).filter((r) => {
    if (type && type !== 'all' && r.type !== type) return false;
    if (fromMs && r.dateMs < fromMs) return false;
    if (toMs && r.dateMs > toMs) return false;
    return true;
  });
}
