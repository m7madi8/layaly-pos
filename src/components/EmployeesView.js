import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, User, ChevronRight } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { fmtMoney } from '../i18n';
import {
  ensureEmployeeModule,
  createEmployee,
  updateEmployee,
} from '../services/employeeService';
import {
  resolveStaffPermissions,
  staffAllowsEmployeeBenefit,
} from '../utils/staffPermissions';
import {
  listPayrollAccrualsForStaff,
  listAdvancesForStaff,
  listAdvanceRepaymentsForStaff,
} from '../services/payrollService';
import {
  listPosDebtsForStaff,
  listEmployeeDebtRepaymentsForStaff,
  listPayrollPaymentsForStaff,
} from '../services/employeeLedgerService';
import { collection, getDocs, db } from '../firebaseClient';
import {
  computeEmployeeObligationsAndEntitlements,
  formatEmployeeNetBalance,
} from '../utils/employeeAccounting';
import EmployeeFinancialPanel from './EmployeeFinancialPanel';
import {
  gatewayCreatePayrollAccrual,
  gatewayRecordPayrollPayment,
  gatewayRecordEmployeeAdvance,
  gatewayRecordAdvanceRepayment,
} from '../services/financialGateway';
import { gatewayExecuteEmployeeBenefit } from '../services/operationalGateway';
import { defaultExpenseForm } from '../expenseConfig';
import EmployeeBenefitFields from './EmployeeBenefitFields';
import { getCashDayKey } from '../utils/cashDayPeriod';
import {
  sumApprovedBenefitsUsage,
  BENEFIT_TYPE_CASH,
  normalizeBenefitType,
} from '../utils/employeeBenefitAccounting';
import { filterStaffByOnDuty } from '../utils/shiftOnDuty';
import {
  resolvePaymentSourceFromForm,
  assertExpensePaymentSourceSelected,
  paymentSourceToLegacyMethod,
} from '../utils/expensePaymentSource';
import ExpensePaymentSourceFields from './ExpensePaymentSourceFields';

function ProfilePanel({
  employee,
  benefits,
  products,
  openShift,
  onBack,
  onSaveBasic,
  fmtMoney: fm,
  theme,
  businessProfile,
  sessionActor,
  openShiftId,
  newIdempotencyKey,
  vaultBalance,
}) {
  const [form, setForm] = useState({
    name: employee.name,
    phone: employee.phone || '',
    notes: employee.notes || '',
    benefitLimitILS: employee.benefitLimitILS,
    baseSalary: employee.baseSalary ?? '',
    active: employee.active !== false,
    permissions: resolveStaffPermissions(employee),
  });
  const [accruals, setAccruals] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [posDebts, setPosDebts] = useState([]);
  const [debtRepayments, setDebtRepayments] = useState([]);
  const [payrollPayments, setPayrollPayments] = useState([]);
  const [advanceRepayments, setAdvanceRepayments] = useState([]);
  const [staffExpenses, setStaffExpenses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [payrollForm, setPayrollForm] = useState({ amountDue: '', periodLabel: 'راتب الشهر' });
  const [payForm, setPayForm] = useState({ accrualId: '', amount: '', paymentSource: '' });
  const [advanceForm, setAdvanceForm] = useState({ amount: '', note: '', paymentSource: '' });
  const [repayForm, setRepayForm] = useState({ advanceId: '', amount: '', paymentSource: '' });
  const [benefitForm, setBenefitForm] = useState(() => ({
    ...defaultExpenseForm('employee_benefit'),
    staffMemberId: employee.id,
  }));
  const [benefitBusy, setBenefitBusy] = useState(false);

  useEffect(() => {
    setBenefitForm((f) => ({ ...defaultExpenseForm('employee_benefit'), staffMemberId: employee.id, notes: f.notes }));
  }, [employee.id]);

  const reloadFinancial = async () => {
    const uid = employee._uid;
    const sid = employee.id;
    const [a, adv, pos, rep, pay, advRep, expSnap] = await Promise.all([
      listPayrollAccrualsForStaff(uid, sid),
      listAdvancesForStaff(uid, sid),
      listPosDebtsForStaff(uid, sid),
      listEmployeeDebtRepaymentsForStaff(uid, sid),
      listPayrollPaymentsForStaff(uid, sid),
      listAdvanceRepaymentsForStaff(uid, sid),
      getDocs(collection(db, 'users', uid, 'expenses')),
    ]);
    setAccruals(a);
    setAdvances(adv);
    setPosDebts(pos);
    setDebtRepayments(rep);
    setPayrollPayments(pay);
    setAdvanceRepayments(advRep);
    setStaffExpenses(
      expSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.staffMemberId === sid)
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadFinancial();
      } catch {
        /* ignore */
      }
      if (cancelled) return undefined;
      return undefined;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, employee._uid]);

  const staffBenefits = useMemo(
    () => (benefits || []).filter((b) => b.staffMemberId === employee.id),
    [benefits, employee.id]
  );

  const staffPerms = useMemo(
    () => resolveStaffPermissions({ ...employee, permissions: form.permissions }),
    [employee, form.permissions]
  );

  return (
    <div className="layali-card p-5 space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-primary flex items-center gap-1">
        <ChevronRight size={16} /> رجوع للقائمة
      </button>
      <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
        {employee.name}
      </h3>

      <div className="grid md:grid-cols-2 gap-3">
        {[
          ['الاسم', 'name', 'text'],
          ['الجوال', 'phone', 'text'],
          ['حد الاستفادة ₪/يوم', 'benefitLimitILS', 'number'],
          ['الراتب الأساسي', 'baseSalary', 'number'],
        ].map(([label, key, type]) => (
          <div key={key}>
            <label className="text-xs text-gray-500">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm"
            />
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        نشط
      </label>

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-2">
        <p className="text-sm font-semibold text-primary">صلاحيات</p>
        <p className="text-xs text-gray-500">
          تتحكم في إمكانية تسجيل استفادة أو سلف لهذا الموظف من المصروفات أو من ملفه هنا (قسم الاستفادة أدناه).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.permissions.canRecordEmployeeBenefit}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                permissions: { ...f.permissions, canRecordEmployeeBenefit: e.target.checked },
              }))
            }
          />
          السماح بتسجيل استفادة موظف
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.permissions.canRecordEmployeeAdvance}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                permissions: { ...f.permissions, canRecordEmployeeAdvance: e.target.checked },
              }))
            }
          />
          السماح بتسجيل سلف
        </label>
      </div>

      <textarea
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={2}
        placeholder="ملاحظات"
        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
      />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSaveBasic(form);
          } finally {
            setBusy(false);
          }
        }}
        className="px-4 py-2 rounded-xl text-white text-sm"
        style={{ backgroundColor: theme.primary }}
      >
        حفظ البيانات
      </button>

      <EmployeeFinancialPanel
        uid={employee._uid}
        employee={employee}
        accruals={accruals}
        advances={advances}
        posDebts={posDebts}
        debtRepayments={debtRepayments}
        payrollPayments={payrollPayments}
        advanceRepayments={advanceRepayments}
        benefits={staffBenefits}
        expenses={staffExpenses}
        openShift={openShift}
        vaultBalance={vaultBalance}
        sessionActor={sessionActor}
        openShiftId={openShiftId}
        onRefresh={reloadFinancial}
      />

      <div className="border-t pt-4">
        <p className="font-semibold text-primary mb-2">سجل الاستفادة ({staffBenefits.length})</p>
        {!staffPerms.canRecordEmployeeBenefit && (
          <p className="text-xs text-amber-700 mb-2">تسجيل استفادة جديدة معطّل من الصلاحيات.</p>
        )}
        <div className="max-h-40 overflow-y-auto text-xs space-y-1 mb-4">
          {staffBenefits.slice(0, 20).map((b) => (
            <p key={b.id}>
              {b.benefitNumber} — {b.benefitType === 'cash' ? 'كاش' : 'أصناف'} — {fm(b.totalValue)}
            </p>
          ))}
        </div>

        {staffPerms.canRecordEmployeeBenefit && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
            <p className="text-sm font-semibold text-emerald-900 mb-3">تسجيل استفادة من ملف الموظف</p>
            {!openShift && (
              <p className="text-xs text-amber-800 mb-2">افتح وردية صندوق لتسجيل الاستفادة.</p>
            )}
            {openShift &&
              !filterStaffByOnDuty([employee], openShift).some((s) => s.id === employee.id) && (
                <p className="text-xs text-amber-800 mb-2">الموظف غير مداوم في الشفت الحالي.</p>
              )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (benefitBusy || !openShift) return;
                if (!staffAllowsEmployeeBenefit({ ...employee, permissions: form.permissions })) {
                  alert('تسجيل الاستفادة معطّل لهذا الموظف — فعّل الصلاحية أعلاه واحفظ.');
                  return;
                }
                const staffMember = { ...employee, permissions: form.permissions };
                const onDuty = filterStaffByOnDuty([staffMember], openShift);
                if (!onDuty.some((s) => s.id === employee.id)) {
                  alert('الموظف غير مداوم في الشفت الحالي.');
                  return;
                }
                if (normalizeBenefitType(benefitForm.benefitType) === BENEFIT_TYPE_CASH) {
                  try {
                    assertExpensePaymentSourceSelected(resolvePaymentSourceFromForm(benefitForm));
                  } catch (srcErr) {
                    alert(srcErr.message);
                    return;
                  }
                }
                setBenefitBusy(true);
                const idem = newIdempotencyKey('emp_ben');
                try {
                  const cashDayKey = getCashDayKey();
                  const usedToday = sumApprovedBenefitsUsage(benefits, employee.id, cashDayKey);
                  const productsById = Object.fromEntries((products || []).map((p) => [p.id, p]));
                  const result = await gatewayExecuteEmployeeBenefit(
                    employee._uid,
                    {
                      staffMember,
                      benefitType: benefitForm.benefitType || 'cash',
                      cashAmount: benefitForm.amount,
                      inventoryLines: benefitForm.inventoryLines || [],
                      date: benefitForm.date,
                      notes: benefitForm.notes || benefitForm.description,
                      shiftId: openShift?.id || openShiftId || null,
                      usedToday,
                      override: Boolean(benefitForm.override),
                      overrideReason: benefitForm.overrideReason,
                      productsById,
                      paymentSource: resolvePaymentSourceFromForm(benefitForm),
                    },
                    { actor: sessionActor(), idempotencyKey: idem },
                    businessProfile
                  );
                  if (!result.duplicate) {
                    alert(`تم تسجيل الاستفادة.\nرقم العملية: ${result.benefitRef}`);
                    setBenefitForm({ ...defaultExpenseForm('employee_benefit'), staffMemberId: employee.id });
                  }
                } catch (err) {
                  alert(err.message || 'تعذّر تسجيل الاستفادة');
                } finally {
                  setBenefitBusy(false);
                }
              }}
            >
              <EmployeeBenefitFields
                expenseForm={benefitForm}
                setExpenseForm={setBenefitForm}
                staffMembers={[employee]}
                employeeBenefits={benefits}
                products={products}
                openShift={openShift}
                vaultBalance={vaultBalance}
                isAdmin
                disabled={benefitBusy || !openShift}
                lockedStaffId={employee.id}
              />
            </form>
          </div>
        )}
      </div>

      <div className="border-t pt-4 grid md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-2">
          <p className="font-semibold mb-1">رواتب ({accruals.length})</p>
          <div className="flex flex-wrap gap-2 items-end">
            <input
              type="number"
              placeholder="مستحق ₪"
              value={payrollForm.amountDue}
              onChange={(e) => setPayrollForm((f) => ({ ...f, amountDue: e.target.value }))}
              className="w-24 px-2 py-1 rounded border border-gray-200"
            />
            <input
              type="text"
              placeholder="الفترة"
              value={payrollForm.periodLabel}
              onChange={(e) => setPayrollForm((f) => ({ ...f, periodLabel: e.target.value }))}
              className="flex-1 min-w-[80px] px-2 py-1 rounded border border-gray-200"
            />
            <button
              type="button"
              disabled={busy}
              className="px-2 py-1 rounded bg-primary text-white text-xs"
              onClick={async () => {
                setBusy(true);
                try {
                  await gatewayCreatePayrollAccrual(
                    employee._uid,
                    {
                      staffMemberId: employee.id,
                      staffName: employee.name,
                      amount: payrollForm.amountDue,
                      periodLabel: payrollForm.periodLabel,
                      baseSalary: employee.baseSalary,
                    },
                    businessProfile
                  );
                  await reloadFinancial();
                } catch (e) {
                  alert(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              + مستحق
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <select
              value={payForm.accrualId}
              onChange={(e) => setPayForm((f) => ({ ...f, accrualId: e.target.value }))}
              className="flex-1 px-2 py-1 rounded border border-gray-200"
            >
              <option value="">اختر مستحقاً</option>
              {accruals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.periodLabel} — متبقي {fm((Number(a.amountDue) || 0) - (Number(a.amountPaid) || 0))}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="دفعة ₪"
              value={payForm.amount}
              onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-20 px-2 py-1 rounded border border-gray-200"
            />
            <ExpensePaymentSourceFields
              expenseForm={payForm}
              setExpenseForm={setPayForm}
              openShift={openShift}
              vaultBalance={vaultBalance}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !payForm.accrualId}
              className="px-2 py-1 rounded bg-accent text-white text-xs"
              onClick={async () => {
                try {
                  assertExpensePaymentSourceSelected(resolvePaymentSourceFromForm(payForm));
                } catch (srcErr) {
                  alert(srcErr.message);
                  return;
                }
                setBusy(true);
                try {
                  await gatewayRecordPayrollPayment(
                    employee._uid,
                    {
                      accrualId: payForm.accrualId,
                      amount: payForm.amount,
                      paymentMethod: paymentSourceToLegacyMethod(resolvePaymentSourceFromForm(payForm)),
                      shiftId: openShiftId,
                    },
                    { actor: sessionActor(), idempotencyKey: newIdempotencyKey('pay') },
                    businessProfile
                  );
                  await reloadFinancial();
                  setPayForm({ accrualId: '', amount: '' });
                } catch (e) {
                  alert(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              دفع
            </button>
          </div>
          {accruals.map((a) => (
            <p key={a.id}>
              {a.periodLabel}: {fm(a.amountPaid)}/{fm(a.amountDue)} — {a.status}
            </p>
          ))}
        </div>
        <div className="space-y-2">
          <p className="font-semibold mb-1">سلف ({advances.length})</p>
          {!staffPerms.canRecordEmployeeAdvance ? (
            <p className="text-gray-500">تسجيل السلف معطّل من صلاحيات هذا الموظف.</p>
          ) : (
          <>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              placeholder="سلفة ₪"
              value={advanceForm.amount}
              onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-24 px-2 py-1 rounded border border-gray-200"
            />
            <ExpensePaymentSourceFields
              expenseForm={advanceForm}
              setExpenseForm={setAdvanceForm}
              openShift={openShift}
              vaultBalance={vaultBalance}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              className="px-2 py-1 rounded bg-primary text-white text-xs"
              onClick={async () => {
                try {
                  assertExpensePaymentSourceSelected(resolvePaymentSourceFromForm(advanceForm));
                } catch (srcErr) {
                  alert(srcErr.message);
                  return;
                }
                setBusy(true);
                try {
                  await gatewayRecordEmployeeAdvance(
                    employee._uid,
                    {
                      staffMemberId: employee.id,
                      staffName: employee.name,
                      amount: advanceForm.amount,
                      note: advanceForm.note,
                      paymentMethod: paymentSourceToLegacyMethod(resolvePaymentSourceFromForm(advanceForm)),
                      shiftId: openShiftId || openShift?.id || null,
                    },
                    { actor: sessionActor(), idempotencyKey: newIdempotencyKey('adv') },
                    businessProfile
                  );
                  await reloadFinancial();
                  setAdvanceForm({ amount: '', note: '' });
                } catch (e) {
                  alert(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              + سلفة
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={repayForm.advanceId}
              onChange={(e) => setRepayForm((f) => ({ ...f, advanceId: e.target.value }))}
              className="flex-1 px-2 py-1 rounded border border-gray-200"
            >
              <option value="">سلفة للتسديد</option>
              {advances.filter((a) => (Number(a.balanceRemaining) || 0) > 0).map((a) => (
                <option key={a.id} value={a.id}>
                  متبقي {fm(a.balanceRemaining)}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="₪"
              value={repayForm.amount}
              onChange={(e) => setRepayForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-16 px-2 py-1 rounded border border-gray-200"
            />
            <ExpensePaymentSourceFields
              expenseForm={repayForm}
              setExpenseForm={setRepayForm}
              openShift={openShift}
              vaultBalance={vaultBalance}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !repayForm.advanceId}
              className="px-2 py-1 rounded bg-gray-800 text-white text-xs"
              onClick={async () => {
                try {
                  assertExpensePaymentSourceSelected(resolvePaymentSourceFromForm(repayForm));
                } catch (srcErr) {
                  alert(srcErr.message);
                  return;
                }
                setBusy(true);
                try {
                  await gatewayRecordAdvanceRepayment(
                    employee._uid,
                    {
                      advanceId: repayForm.advanceId,
                      amount: repayForm.amount,
                      paymentMethod: paymentSourceToLegacyMethod(resolvePaymentSourceFromForm(repayForm)),
                      paymentSource: resolvePaymentSourceFromForm(repayForm),
                      shiftId: openShiftId || openShift?.id || null,
                    },
                    { actor: sessionActor(), idempotencyKey: newIdempotencyKey('adv_repay') },
                    businessProfile
                  );
                  await reloadFinancial();
                  setRepayForm({ advanceId: '', amount: '', paymentSource: '' });
                } catch (e) {
                  alert(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              تسديد
            </button>
          </div>
          {advances.map((a) => (
            <p key={a.id}>
              {fm(a.amount)} — متبقي {fm(a.balanceRemaining)}
            </p>
          ))}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeesView({
  uid,
  staffMembers,
  employeeBenefits,
  products,
  openShift,
  theme,
  onRefreshStaff,
  businessProfile,
  sessionActor,
  openShiftId,
  newIdempotencyKey,
  vaultBalance,
}) {
  const [detail, setDetail] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', benefitLimitILS: '20', phone: '' });
  const [loading, setLoading] = useState(false);
  const [financeIndex, setFinanceIndex] = useState({ accruals: [], advances: [], posDebts: [] });

  const refreshFinanceIndex = useCallback(async () => {
    if (!uid) return;
    try {
      const [aSnap, advSnap, posSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'payrollAccruals')),
        getDocs(collection(db, 'users', uid, 'employeeAdvances')),
        getDocs(collection(db, 'users', uid, 'employeePosDebts')),
      ]);
      setFinanceIndex({
        accruals: aSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        advances: advSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        posDebts: posSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    } catch {
      /* ignore */
    }
  }, [uid]);

  useEffect(() => {
    refreshFinanceIndex();
  }, [refreshFinanceIndex, staffMembers.length]);

  const netBalanceForStaff = (staffId) => {
    const acc = financeIndex.accruals.filter((a) => a.staffMemberId === staffId);
    const adv = financeIndex.advances.filter((a) => a.staffMemberId === staffId);
    const pos = financeIndex.posDebts.filter((p) => p.staffMemberId === staffId);
    return computeEmployeeObligationsAndEntitlements({ accruals: acc, advances: adv, posDebts: pos }).net;
  };

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    ensureEmployeeModule(uid)
      .then(() => onRefreshStaff?.())
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parent passes inline refresh handler
  }, [uid]);

  const list = staffMembers || [];

  if (detail) {
    return (
      <ProfilePanel
        employee={{ ...detail, _uid: uid }}
        benefits={employeeBenefits}
        products={products}
        openShift={openShift}
        fmtMoney={fmtMoney}
        theme={theme}
        businessProfile={businessProfile}
        sessionActor={sessionActor}
        openShiftId={openShiftId}
        newIdempotencyKey={newIdempotencyKey}
        vaultBalance={vaultBalance}
        onBack={() => {
          setDetail(null);
          refreshFinanceIndex();
        }}
        onSaveBasic={async (form) => {
          await updateEmployee(uid, detail.id, {
            name: form.name,
            phone: form.phone,
            notes: form.notes,
            benefitLimitILS: form.benefitLimitILS,
            baseSalary: form.baseSalary,
            active: form.active,
            permissions: form.permissions,
          });
          await onRefreshStaff?.();
          setDetail({ ...detail, ...form, permissions: form.permissions });
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl text-primary" style={{ fontFamily: FONT_HEADING }}>
          الموظفين
        </h2>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm"
          style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
        >
          <Plus size={16} /> موظف جديد
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500 mb-4">جاري التحديث…</p>}

      <div className="layali-card divide-y">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setDetail(s)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-start"
          >
            <div className="flex items-center gap-3">
              <User size={18} className="text-primary" />
              <div>
                <p className="font-semibold text-primary">{s.name}</p>
                <p className="text-xs text-gray-500">
                  حد استفادة {fmtMoney(s.benefitLimitILS)}/يوم
                  {s.active === false ? ' · معطّل' : ''}
                </p>
              </div>
            </div>
            <div className="text-end shrink-0 me-2">
              {(() => {
                const pres = formatEmployeeNetBalance(netBalanceForStaff(s.id));
                return (
                  <p className={`text-xs font-bold ${pres.tone === 'positive' ? 'text-emerald-700' : pres.tone === 'negative' ? 'text-rose-700' : 'text-gray-500'}`}>
                    {pres.label}
                    {pres.amount > 0 ? `: ${fmtMoney(pres.amount)}` : pres.kind === 'settled' ? '' : ''}
                  </p>
                );
              })()}
            </div>
            <ChevronRight size={16} className="text-gray-400 rotate-180" />
          </button>
        ))}
        {list.length === 0 && (
          <p className="p-8 text-center text-gray-500 text-sm">لا موظفين — أضف موظفاً أو انتظر التهيئة</p>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm border">
            <h3 className="font-bold text-primary mb-3">موظف جديد</h3>
            <input
              className="w-full mb-2 px-3 py-2 border rounded-xl text-sm"
              placeholder="الاسم"
              value={newForm.name}
              onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="w-full mb-3 px-3 py-2 border rounded-xl text-sm"
              placeholder="حد الاستفادة"
              type="number"
              value={newForm.benefitLimitILS}
              onChange={(e) => setNewForm((f) => ({ ...f, benefitLimitILS: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="py-2 rounded-xl border text-sm">
                إلغاء
              </button>
              <button
                type="button"
                className="py-2 rounded-xl text-white text-sm"
                style={{ backgroundColor: theme.primary }}
                onClick={async () => {
                  await createEmployee(uid, newForm);
                  setShowNew(false);
                  setNewForm({ name: '', benefitLimitILS: '20', phone: '' });
                  await onRefreshStaff?.();
                }}
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
