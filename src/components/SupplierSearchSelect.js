import React, { useMemo, useState } from 'react';
import { fmtMoney } from '../i18n';
import { resolveSupplierOutstandingBalance } from '../utils/supplierAccounting';

export default function SupplierSearchSelect({
  suppliers,
  expenses,
  value,
  onChange,
  disabled,
  showBalance,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = suppliers || [];
    if (!q) return list;
    return list.filter((s) => {
      const hay = `${s.name || ''} ${s.phone || ''} ${s.contactPerson || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, query]);

  const selected = (suppliers || []).find((s) => s.id === value);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن التاجر..."
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
        <option value="">اختر التاجر</option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {showBalance
              ? ` — مستحق: ${fmtMoney(resolveSupplierOutstandingBalance(s, expenses, s.id))}`
              : ''}
          </option>
        ))}
      </select>
      {selected && showBalance && (
        <p className="text-xs text-gray-500">
          الرصيد المستحق:{' '}
          <span className="font-semibold text-red-600">
            {fmtMoney(resolveSupplierOutstandingBalance(selected, expenses, selected.id))}
          </span>
        </p>
      )}
      {filtered.length === 0 && (
        <p className="text-xs text-amber-600">لا يوجد تاجر مطابق — أضف تاجراً من قائمة التجار</p>
      )}
    </div>
  );
}
