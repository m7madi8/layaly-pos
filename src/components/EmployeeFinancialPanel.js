import React, { useMemo, useState } from 'react';
import { fmtMoney } from '../i18n';
import {
  buildEmployeeLedgerRows,
  computeEmployeeObligationsAndEntitlements,
  formatEmployeeNetBalance,
  summarizeEmployeePayrollHistory,
  filterLedgerRows,
  employeeLedgerTypeLabel,
  EMP_LEDGER_TYPES,
} from '../utils/employeeAccounting';
import ExpensePaymentSourceFields from './ExpensePaymentSourceFields';
import { recordEmployeeDebtRepayment } from '../services/employeeLedgerService';
import { newIdempotencyKey } from '../utils/idempotencyKey';
import { resolvePaymentSourceFromForm, assertExpensePaymentSourceSelected } from '../utils/expensePaymentSource';

function toneClass(tone) {
  if (tone === 'positive') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (tone === 'negative') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
}

export default function EmployeeFinancialPanel({
  uid,
  employee,
  accruals = [],
  advances = [],
  posDebts = [],
  debtRepayments = [],
  payrollPayments = [],
  advanceRepayments = [],
  benefits = [],
  expenses = [],
  openShift,
  vaultBalance,
  sessionActor,
  openShiftId,
  onRefresh,
}) {
  const [filterType, setFilterType] = useState('all');
  const [repayForm, setRepayForm] = useState({ amount: '', notes: '', paymentSource: '' });
  const [busy, setBusy] = useState(false);

  const summary = useMemo(
    () => computeEmployeeObligationsAndEntitlements({ accruals, advances, posDebts }),
    [accruals, advances, posDebts]
  );

  const payrollSummary = useMemo(
    () => summarizeEmployeePayrollHistory({ accruals, payrollPayments, expenses }),
    [accruals, payrollPayments, expenses]
  );

  const netPresentation = useMemo(() => formatEmployeeNetBalance(summary.net), [summary.net]);

  const ledgerRows = useMemo(
    () =>
      buildEmployeeLedgerRows({
        staffMemberId: employee.id,
        accruals,
        payrollPayments,
        advances,
        advanceRepayments,
        benefits,
        posDebts,
        posRepayments: debtRepayments,
        expenses,
      }),
    [
      employee.id,
      accruals,
      payrollPayments,
      advances,
      advanceRepayments,
      benefits,
      posDebts,
      debtRepayments,
      expenses,
    ]
  );

  const filteredRows = useMemo(
    () => filterLedgerRows(ledgerRows, { type: filterType }),
    [ledgerRows, filterType]
  );

  const totalObligations = summary.openAdvances + summary.openPosDebt;

  const handleDebtRepay = async () => {
    const amount = parseFloat(repayForm.amount);
    if (!(amount > 0)) {
      alert('أدخل مبلغ التسديد');
      return;
    }
    try {
      assertExpensePaymentSourceSelected(resolvePaymentSourceFromForm(repayForm));
    } catch (e) {
      alert(e.message);
      return;
    }
    if (totalObligations <= 0.009) {
      alert('لا يوجد دين مفتوح على هذا الموظف');
      return;
    }
    setBusy(true);
    try {
      await recordEmployeeDebtRepayment(uid, {
        staffMemberId: employee.id,
        amount,
        paymentSource: resolvePaymentSourceFromForm(repayForm),
        note: repayForm.notes,
        actor: sessionActor?.(),
        shiftId: openShiftId || openShift?.id || null,
        idempotencyKey: newIdempotencyKey('emp_debt_rep'),
      });
      setRepayForm({ amount: '', notes: '', paymentSource: '' });
      await onRefresh?.();
      alert('تم تسجيل التسديد بنجاح');
    } catch (e) {
      alert(e.message || 'تعذّر التسديد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-primary">الحساب المالي</h3>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${toneClass(netPresentation.tone)}`}>
          {netPresentation.label}
          {netPresentation.amount > 0 ? `: ${fmtMoney(netPresentation.amount)}` : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-gray-500">الراتب الأساسي</p>
          <p className="font-bold text-primary tabular-nums">{fmtMoney(employee.baseSalary || 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-gray-500">رواتب مستحقة</p>
          <p className="font-bold text-emerald-700 tabular-nums">{fmtMoney(summary.unpaidSalary)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-gray-500">سلف غير مسددة</p>
          <p className="font-bold text-rose-700 tabular-nums">{fmtMoney(summary.openAdvances)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-gray-500">دين نقطة البيع</p>
          <p className="font-bold text-rose-700 tabular-nums">{fmtMoney(summary.openPosDebt)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3 col-span-2">
          <p className="text-gray-500">إجمالي مستحقات مُسجّلة / مدفوع على السجلات</p>
          <p className="font-semibold tabular-nums">
            {fmtMoney(payrollSummary.totalAccrued)} / {fmtMoney(payrollSummary.totalPaidOnAccruals)}
          </p>
        </div>
        <div className="rounded-xl border bg-primary/5 p-3 col-span-2">
          <p className="text-gray-600">الرصيد النهائي (مستحق − التزامات)</p>
          <p className="text-lg font-extrabold tabular-nums text-primary">{fmtMoney(summary.net)}</p>
        </div>
      </div>

      {totalObligations > 0.009 && (
        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-2">
          <p className="text-sm font-bold text-rose-900">تسديد دين</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              placeholder="مبلغ التسديد ₪"
              value={repayForm.amount}
              onChange={(e) => setRepayForm((f) => ({ ...f, amount: e.target.value }))}
              className="px-3 py-2 rounded-xl border text-sm"
              disabled={busy}
            />
            <input
              type="text"
              placeholder="ملاحظات (اختياري)"
              value={repayForm.notes}
              onChange={(e) => setRepayForm((f) => ({ ...f, notes: e.target.value }))}
              className="px-3 py-2 rounded-xl border text-sm"
              disabled={busy}
            />
          </div>
          <ExpensePaymentSourceFields
            expenseForm={repayForm}
            setExpenseForm={setRepayForm}
            openShift={openShift}
            vaultBalance={vaultBalance}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            onClick={handleDebtRepay}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? 'جاري التسديد…' : 'تأكيد تسديد الدين'}
          </button>
          <p className="text-[11px] text-gray-600">
            يُخصّص التسديد تلقائياً على ديون نقطة البيع الأقدم ثم السلف المفتوحة. ليس مصروفاً تشغيلياً — إيداع للصندوق أو الخزنة فقط.
          </p>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 border-b">
          <p className="text-sm font-semibold text-gray-800">سجل الحركات</p>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg border bg-white"
          >
            <option value="all">كل الأنواع</option>
            {Object.values(EMP_LEDGER_TYPES).map((t) => (
              <option key={t} value={t}>
                {employeeLedgerTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b">
              <tr className="text-gray-600">
                <th className="p-2 text-right font-medium">التاريخ</th>
                <th className="p-2 text-right font-medium">الحركة</th>
                <th className="p-2 text-left font-medium">المبلغ</th>
                <th className="p-2 text-right font-medium">المصدر</th>
                <th className="p-2 text-left font-medium">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                  <td className="p-2 whitespace-nowrap">
                    {row.dateMs ? new Date(row.dateMs).toLocaleDateString('ar') : '—'}
                  </td>
                  <td className="p-2">
                    <span className="font-medium text-gray-800">{row.label}</span>
                    {row.notes ? <span className="block text-[10px] text-gray-500">{row.notes}</span> : null}
                  </td>
                  <td className="p-2 text-left tabular-nums font-semibold">
                    {row.signedDelta >= 0 ? '+' : '−'}
                    {fmtMoney(Math.abs(row.signedDelta || row.amount))}
                  </td>
                  <td className="p-2 text-gray-600">{row.paymentSource || row.sourceModule || '—'}</td>
                  <td className="p-2 text-left tabular-nums font-bold text-primary">
                    {fmtMoney(row.runningBalance)}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    لا حركات في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
