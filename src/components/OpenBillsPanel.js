import React, { useMemo, useState } from 'react';
import { Search, X, Clock, RefreshCw } from 'lucide-react';
import { formatOpenBillAge } from '../utils/openBillCart';

export default function OpenBillsPanel({
  open,
  onClose,
  openBills = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  onOpenBill,
  onRequestBill,
  busy,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = (openBills || [])
      .filter((b) => b.status === 'open')
      .slice()
      .sort((a, b) => (Number(b.updatedAtMs) || 0) - (Number(a.updatedAtMs) || 0));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (b) =>
        (b.customerName || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q)
    );
  }, [openBills, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex justify-end" dir="rtl">
      <button type="button" className="absolute inset-0 bg-black/35" aria-label="إغلاق" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col border-s border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="text-lg font-semibold text-primary" style={{ fontFamily: FONT_HEADING }}>
              الفواتير المعلقة
            </h3>
            <p className="text-xs text-gray-500" style={{ fontFamily: FONT_UI }}>
              {filtered.length} حساب مفتوح
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم العميل..."
              className="w-full pe-9 ps-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
              style={{ fontFamily: FONT_UI }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-gray-500" style={{ fontFamily: FONT_UI }}>
              لا توجد فواتير معلقة
            </div>
          )}
          {filtered.map((bill) => (
            <div
              key={bill.id}
              className="rounded-2xl border border-gray-200 p-3 hover:border-primary/40 transition-colors"
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <p className="font-semibold text-sm" style={{ fontFamily: FONT_UI, color: theme.text }}>
                    {bill.customerName || 'عميل'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: FONT_UI }}>
                    {bill.itemCount || bill.items?.length || 0} أصناف
                  </p>
                </div>
                <p className="text-base font-bold text-primary" style={{ fontFamily: FONT_UI }}>
                  {fmtMoney(bill.total || 0)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-3" style={{ fontFamily: FONT_UI }}>
                <Clock size={12} />
                {formatOpenBillAge(bill.updatedAtMs) || '—'}
                {bill.updatedBy?.role ? ` · ${bill.updatedBy.role === 'employee' ? 'موظف' : 'مدير'}` : ''}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenBill(bill)}
                  className="py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                >
                  فتح
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRequestBill(bill)}
                  className="py-2 rounded-xl text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  style={{ fontFamily: FONT_UI }}
                >
                  طلب الحساب
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t text-center">
          <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1" style={{ fontFamily: FONT_UI }}>
            <RefreshCw size={11} />
            التحديث فوري من قاعدة البيانات
          </p>
        </div>
      </div>
    </div>
  );
}
