import React, { useMemo, useState } from 'react';
import { fmtMoney } from '../i18n';
import { FONT_UI, FONT_HEADING } from '../branding';
import { BENEFIT_STATUS_APPROVED, BENEFIT_STATUS_CANCELLED } from '../utils/employeeBenefitAccounting';

function formatWhen(b) {
  const ms = b.createdAtMs || (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar');
}

export default function EmployeeBenefitsPanel({
  benefits,
  staffMembers,
  onCancel,
  busy,
}) {
  const [staffFilter, setStaffFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const rows = useMemo(() => {
    let list = [...(benefits || [])];
    if (staffFilter) list = list.filter((b) => b.staffMemberId === staffFilter);
    if (typeFilter !== 'all') list = list.filter((b) => b.benefitType === typeFilter);
    if (statusFilter !== 'all') list = list.filter((b) => b.status === statusFilter);
    return list.sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
  }, [benefits, staffFilter, typeFilter, statusFilter]);

  const handleCancel = async (row) => {
    if (row.status !== BENEFIT_STATUS_APPROVED) return;
    const reason = window.prompt(`سبب إلغاء استفادة ${row.staffName} (${row.benefitNumber}):`);
    if (!reason?.trim()) return;
    await onCancel(row.id, reason.trim());
  };

  return (
    <div className="layali-card p-4 mt-4">
      <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: FONT_HEADING }}>
        سجل استفادة الموظفين
      </h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="">كل الموظفين</option>
          {(staffMembers || []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="all">كل الأنواع</option>
          <option value="cash">كاش</option>
          <option value="inventory">أصناف</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="all">كل الحالات</option>
          <option value={BENEFIT_STATUS_APPROVED}>معتمدة</option>
          <option value={BENEFIT_STATUS_CANCELLED}>ملغاة</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontFamily: FONT_UI }}>
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-right py-2">الرقم</th>
              <th className="text-right py-2">الموظف</th>
              <th className="text-right py-2">النوع</th>
              <th className="text-right py-2">القيمة</th>
              <th className="text-right py-2">يوم الكاش</th>
              <th className="text-right py-2">الحالة</th>
              <th className="text-right py-2">التاريخ</th>
              <th className="text-right py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-gray-50">
                <td className="py-2 font-mono text-xs">{b.benefitNumber}</td>
                <td className="py-2">{b.staffName}</td>
                <td className="py-2">{b.benefitType === 'cash' ? 'كاش' : 'أصناف'}</td>
                <td className="py-2">{fmtMoney(b.totalValue)}</td>
                <td className="py-2 text-xs">{b.cashDayKey}</td>
                <td className="py-2">
                  {b.status === BENEFIT_STATUS_CANCELLED ? (
                    <span className="text-red-600">ملغاة</span>
                  ) : (
                    <span className="text-emerald-700">معتمدة</span>
                  )}
                  {b.override && <span className="block text-[10px] text-amber-600">تجاوز</span>}
                </td>
                <td className="py-2 text-xs">{formatWhen(b)}</td>
                <td className="py-2">
                  {b.status === BENEFIT_STATUS_APPROVED && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCancel(b)}
                      className="text-xs text-red-600 font-semibold disabled:opacity-40"
                    >
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-gray-400">لا توجد عمليات</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
