import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fmtMoney } from '../i18n';
import StaffSearchSelect from './StaffSearchSelect';
import {
  BENEFIT_TYPE_CASH,
  BENEFIT_TYPE_INVENTORY,
  sumApprovedBenefitsUsage,
  resolveBenefitLines,
  computeBenefitQuota,
  roundMoney,
} from '../utils/employeeBenefitAccounting';
import { getCashDayKey } from '../utils/cashDayPeriod';
import { getProductType } from '../utils/productPricing';

export default function EmployeeBenefitFields({
  expenseForm,
  setExpenseForm,
  staffMembers,
  employeeBenefits,
  products,
  openShift,
  isAdmin,
  disabled,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cashDayKey = getCashDayKey();
  const staffId = expenseForm.staffMemberId || '';
  const selectedStaff = staffMembers.find((s) => s.id === staffId);

  const usedToday = useMemo(
    () => sumApprovedBenefitsUsage(employeeBenefits, staffId, cashDayKey),
    [employeeBenefits, staffId, cashDayKey]
  );

  const productsById = useMemo(
    () => Object.fromEntries((products || []).map((p) => [p.id, p])),
    [products]
  );

  const sellableProducts = useMemo(
    () =>
      (products || []).filter((p) => {
        const t = getProductType(p);
        return t === 'standard' || t === 'weight';
      }),
    [products]
  );

  const preview = useMemo(() => {
    try {
      if (expenseForm.benefitType === BENEFIT_TYPE_CASH) {
        const proposed = roundMoney(expenseForm.amount);
        const limit = roundMoney(selectedStaff?.benefitLimitILS);
        return {
          ok: proposed > 0,
          total: proposed,
          quota: computeBenefitQuota({ limit, used: usedToday, proposed }),
          lines: [],
        };
      }
      const { lines, totalValue } = resolveBenefitLines(productsById, expenseForm.inventoryLines || []);
      const limit = roundMoney(selectedStaff?.benefitLimitILS);
      return {
        ok: true,
        total: totalValue,
        lines,
        quota: computeBenefitQuota({ limit, used: usedToday, proposed: totalValue }),
      };
    } catch (e) {
      return { ok: false, error: e.message, total: 0, lines: [], quota: null };
    }
  }, [expenseForm, selectedStaff, usedToday, productsById]);

  const addLine = () => {
    const lines = [...(expenseForm.inventoryLines || []), { productId: '', quantity: 1, weightGrams: '' }];
    setExpenseForm({ ...expenseForm, inventoryLines: lines });
  };

  const updateLine = (idx, patch) => {
    const lines = (expenseForm.inventoryLines || []).map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setExpenseForm({ ...expenseForm, inventoryLines: lines });
  };

  const removeLine = (idx) => {
    const lines = (expenseForm.inventoryLines || []).filter((_, i) => i !== idx);
    setExpenseForm({ ...expenseForm, inventoryLines: lines });
  };

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <StaffSearchSelect
        staffMembers={staffMembers}
        value={staffId}
        onChange={(id) => setExpenseForm({ ...expenseForm, staffMemberId: id })}
        disabled={disabled}
        usedToday={usedToday}
      />

      <div>
        <label className="block text-xs mb-1.5 font-medium text-gray-600">نوع الاستفادة</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: BENEFIT_TYPE_CASH, label: 'كاش' },
            { id: BENEFIT_TYPE_INVENTORY, label: 'أصناف من المقهى' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => setExpenseForm({ ...expenseForm, benefitType: opt.id })}
              className={`py-2.5 rounded-xl text-sm font-semibold border ${
                expenseForm.benefitType === opt.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white border-gray-200 text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {expenseForm.benefitType === BENEFIT_TYPE_CASH && (
        <div>
          <label className="block text-xs mb-1.5 font-medium text-gray-600">مبلغ الكاش (₪)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
            disabled={disabled}
          />
        </div>
      )}

      {expenseForm.benefitType === BENEFIT_TYPE_INVENTORY && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">الأصناف</span>
            <button
              type="button"
              onClick={addLine}
              disabled={disabled}
              className="text-xs flex items-center gap-1 text-primary font-semibold"
            >
              <Plus size={14} /> إضافة صنف
            </button>
          </div>
          {(expenseForm.inventoryLines || []).map((line, idx) => {
            const product = productsById[line.productId];
            const type = product ? getProductType(product) : 'standard';
            return (
              <div key={idx} className="p-2 rounded-xl border border-gray-100 space-y-2">
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(idx, { productId: e.target.value })}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  disabled={disabled}
                >
                  <option value="">اختر الصنف</option>
                  {sellableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — مخزون {p.stock ?? 0}
                    </option>
                  ))}
                </select>
                {type === 'weight' && (
                  <input
                    type="number"
                    placeholder="الوزن (غ)"
                    value={line.weightGrams}
                    onChange={(e) => updateLine(idx, { weightGrams: e.target.value })}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm"
                    disabled={disabled}
                  />
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    placeholder="الكمية"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    className="flex-1 px-2 py-2 rounded-lg border border-gray-200 text-sm"
                    disabled={disabled}
                  />
                  <button type="button" onClick={() => removeLine(idx)} className="p-2 text-red-500" disabled={disabled}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {product && (
                  <p className="text-[11px] text-gray-500">
                    تكلفة تقديرية:{' '}
                    {(() => {
                      try {
                        const { totalValue } = resolveBenefitLines(productsById, [line]);
                        return fmtMoney(totalValue);
                      } catch {
                        return '—';
                      }
                    })()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label className="block text-xs mb-1.5 font-medium text-gray-600">ملاحظة</label>
        <input
          type="text"
          value={expenseForm.notes || ''}
          onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
          placeholder="اختياري"
          disabled={disabled}
        />
      </div>

      {openShift && (
        <p className="text-[11px] text-gray-500">
          الشفت المفتوح: #{openShift.id.slice(0, 6)}… —{' '}
          {Number(openShift.shiftPeriod) === 2 ? 'الشفت الثاني' : 'الشفت الأول'}
        </p>
      )}

      {preview.quota?.exceeds && isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={Boolean(expenseForm.override)}
              onChange={(e) => setExpenseForm({ ...expenseForm, override: e.target.checked })}
              disabled={disabled}
            />
            موافقة إدارية على تجاوز الحد
          </label>
          {expenseForm.override && (
            <input
              type="text"
              value={expenseForm.overrideReason || ''}
              onChange={(e) => setExpenseForm({ ...expenseForm, overrideReason: e.target.value })}
              placeholder="سبب التجاوز (إلزامي)"
              className="w-full px-2 py-2 rounded-lg border border-amber-200 text-sm"
              disabled={disabled}
            />
          )}
        </div>
      )}

      {preview.error && <p className="text-xs text-red-600">{preview.error}</p>}

      {preview.ok && preview.quota && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs space-y-1">
          <p>
            إجمالي العملية: <strong>{fmtMoney(preview.total)}</strong>
          </p>
          <p>
            بعد الحفظ: {fmtMoney(preview.quota.proposedTotal)} من {fmtMoney(preview.quota.limit)}
          </p>
        </div>
      )}

      {!confirmOpen ? (
        <button
          type="button"
          disabled={disabled || !preview.ok || !staffId}
          onClick={() => setConfirmOpen(true)}
          className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          مراجعة وتأكيد الحفظ
        </button>
      ) : (
        <div className="space-y-2 border border-primary/20 rounded-xl p-3">
          <p className="text-sm font-bold text-primary">تأكيد استفادة الموظف</p>
          <p className="text-xs text-gray-600">
            {selectedStaff?.name} — {expenseForm.benefitType === BENEFIT_TYPE_CASH ? 'كاش' : 'أصناف'} —{' '}
            {fmtMoney(preview.total)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm"
              onClick={() => setConfirmOpen(false)}
            >
              رجوع
            </button>
            <button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-semibold">
              تأكيد الحفظ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
