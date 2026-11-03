import React, { useEffect, useMemo, useState } from 'react';
import StaffSearchSelect from './StaffSearchSelect';
import { fmtMoney } from '../i18n';
import { listPayrollAccrualsForStaff } from '../services/payrollService';
import { uniqueStaffMembersByName } from '../utils/employeeBenefitAccounting';

const NEW_ACCRUAL = '__new__';

export default function PayrollAdvanceExpenseFields({
  expenseForm,
  setExpenseForm,
  staffMembers,
  uid,
  disabled,
}) {
  const [accruals, setAccruals] = useState([]);
  const [loadingAccruals, setLoadingAccruals] = useState(false);

  const staffId = expenseForm.staffMemberId || '';
  const isSalary = expenseForm.category === 'Salaries';
  const isAdvance = expenseForm.category === 'Advance';

  const activeStaff = useMemo(
    () => uniqueStaffMembersByName(staffMembers).filter((s) => s.active !== false),
    [staffMembers]
  );

  const selectedStaff = activeStaff.find((s) => s.id === staffId);

  useEffect(() => {
    if (!uid || !staffId || !isSalary) {
      setAccruals([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingAccruals(true);
    listPayrollAccrualsForStaff(uid, staffId)
      .then((rows) => {
        if (!cancelled) setAccruals(rows);
      })
      .catch(() => {
        if (!cancelled) setAccruals([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccruals(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, staffId, isSalary]);

  const openAccruals = useMemo(
    () =>
      accruals.filter((a) => {
        const due = (Number(a.amountDue) || 0) - (Number(a.amountPaid) || 0);
        return due > 0.009 && a.status !== 'paid';
      }),
    [accruals]
  );

  const accrualId = expenseForm.payrollAccrualId || '';

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <div>
        <label className="block text-xs mb-1.5 font-medium text-gray-600">الموظف</label>
        <StaffSearchSelect
          staffMembers={activeStaff}
          value={staffId}
          onChange={(id) =>
            setExpenseForm({
              ...expenseForm,
              staffMemberId: id,
              payrollAccrualId: '',
            })
          }
          disabled={disabled}
          showBenefitQuota={false}
        />
      </div>

      {isAdvance && selectedStaff && (
        <p className="text-xs text-gray-600 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          تُسجَّل السلفة في ملف الموظف <span className="font-semibold text-primary">{selectedStaff.name}</span> وتُربط
          تلقائياً بسجل السلف في النظام.
        </p>
      )}

      {isSalary && staffId && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600">مستحق الراتب</label>
          <select
            value={accrualId}
            onChange={(e) => setExpenseForm({ ...expenseForm, payrollAccrualId: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white"
            disabled={disabled || loadingAccruals}
          >
            <option value="">{loadingAccruals ? 'جاري التحميل…' : 'اختر مستحقاً أو أنشئ جديداً'}</option>
            <option value={NEW_ACCRUAL}>+ صرف راتب جديد (إنشاء مستحق ثم دفع)</option>
            {openAccruals.map((a) => {
              const rem = (Number(a.amountDue) || 0) - (Number(a.amountPaid) || 0);
              return (
                <option key={a.id} value={a.id}>
                  {a.periodLabel || 'راتب'} — متبقي {fmtMoney(rem)}
                </option>
              );
            })}
          </select>

          {accrualId === NEW_ACCRUAL && (
            <div>
              <label className="block text-xs mb-1 font-medium text-gray-600">وصف الفترة</label>
              <input
                type="text"
                value={expenseForm.periodLabel || ''}
                onChange={(e) => setExpenseForm({ ...expenseForm, periodLabel: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                placeholder="مثال: راتب شهر 11"
                disabled={disabled}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                يُنشأ مستحق بمبلغ الدفعة أعلاه ثم تُسجَّل دفعة الراتب فوراً.
              </p>
            </div>
          )}

          {accrualId && accrualId !== NEW_ACCRUAL && (
            <p className="text-xs text-gray-600">
              الدفعة تُخصَّم من مستحق الراتب وتُسجَّل في المصروفات باسم الموظف.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { NEW_ACCRUAL as PAYROLL_NEW_ACCRUAL_OPTION };
