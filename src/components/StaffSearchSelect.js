import React, { useMemo, useState } from 'react';
import { fmtMoney } from '../i18n';
import { roundMoney } from '../utils/employeeBenefitAccounting';

export default function StaffSearchSelect({
  staffMembers,
  value,
  onChange,
  disabled,
  usedToday,
  limit,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (staffMembers || []).filter((s) => s.active !== false);
    if (!q) return list;
    return list.filter((s) => String(s.name || '').toLowerCase().includes(q));
  }, [staffMembers, query]);

  const selected = (staffMembers || []).find((s) => s.id === value);
  const lim = roundMoney(selected?.benefitLimitILS ?? limit ?? 0);
  const used = roundMoney(usedToday ?? 0);
  const remaining = roundMoney(Math.max(0, lim - used));

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن الموظف..."
        className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        disabled={disabled}
        dir="rtl"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white"
        disabled={disabled}
      >
        <option value="">اختر الموظف</option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — حد {fmtMoney(s.benefitLimitILS)}
          </option>
        ))}
      </select>
      {selected && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs space-y-1" style={{ fontFamily: 'inherit' }}>
          <div className="flex justify-between">
            <span className="text-gray-600">الحد اليومي (يوم الكاش)</span>
            <span className="font-bold text-primary">{fmtMoney(lim)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">المستخدم اليوم</span>
            <span className="font-semibold">{fmtMoney(used)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">المتبقي</span>
            <span className="font-bold text-emerald-700">{fmtMoney(remaining)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
