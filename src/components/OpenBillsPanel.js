import React, { useMemo, useState } from 'react';
import { Search, X, Clock } from 'lucide-react';
import { formatOpenBillAge } from '../utils/openBillCart';

/** قائمة الفواتير المعلقة — sidebar مدمج أو drawer للجوال */
export default function OpenBillsPanel({
  open = true,
  onClose,
  openBills = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  onOpenBill,
  busy,
  variant = 'sidebar',
  activeBillId = null,
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

  const body = (
    <>
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-bg-warm)]">
        <div>
          <h3 className="text-sm font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
            الفواتير المعلقة
          </h3>
          <p className="text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: FONT_UI }}>
            {filtered.length} حساب مفتوح — اضغط للفتح
          </p>
        </div>
        {variant === 'drawer' && onClose && (
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/80 text-gray-500">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="p-2 border-b border-[var(--color-border)] shrink-0">
        <div className="relative">
          <Search className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالعميل..."
            className="w-full pe-8 ps-2.5 h-11 rounded-xl border border-[var(--color-border)] text-base outline-none bg-white"
            style={{ fontFamily: FONT_UI }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {filtered.length === 0 && (
          <div className="text-center py-12 px-3">
            <p className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: FONT_UI }}>
              لا توجد فواتير معلقة
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1 opacity-80" style={{ fontFamily: FONT_UI }}>
              علّق طلباً لعميل مسجّل ليظهر هنا
            </p>
          </div>
        )}
        {filtered.map((bill) => {
          const isActive = activeBillId === bill.id;
          return (
            <button
              key={bill.id}
              type="button"
              disabled={busy}
              onClick={() => onOpenBill(bill)}
              className={`w-full text-start rounded-xl border px-3 py-2.5 transition-all disabled:opacity-50 ${
                isActive
                  ? 'border-accent bg-[var(--color-accent-soft)] shadow-sm'
                  : 'border-[var(--color-border)] bg-white hover:border-accent/50 hover:bg-[var(--color-bg-warm)]'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="font-bold text-sm leading-snug truncate" style={{ fontFamily: FONT_UI, color: theme.text }}>
                  {bill.customerName || 'عميل'}
                </p>
                <p className="text-sm font-bold text-accent shrink-0 tabular-nums" style={{ fontFamily: FONT_UI }}>
                  {fmtMoney(bill.total || 0)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: FONT_UI }}>
                  {bill.itemCount || bill.items?.length || 0} أصناف
                </p>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: FONT_UI }}>
                  <Clock size={10} />
                  {formatOpenBillAge(bill.updatedAtMs) || '—'}
                </div>
              </div>
              {isActive && (
                <p className="text-[10px] text-accent font-semibold mt-1.5" style={{ fontFamily: FONT_UI }}>
                  مفتوحة الآن في الطلب
                </p>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  if (variant === 'strip') {
    if (filtered.length === 0) return null;
    return (
      <section className="hidden lg:block shrink-0 mb-3" dir="rtl" aria-label="الفواتير المعلقة" style={{ fontFamily: FONT_UI }}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <h3 className="text-sm font-bold text-primary">فواتير معلقة</h3>
          <span className="min-w-[1.4rem] h-5 px-1.5 rounded-full text-[11px] font-bold text-white grid place-items-center tabular-nums" style={{ backgroundColor: theme.accent }}>
            {filtered.length}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filtered.map((bill) => {
            const isActive = activeBillId === bill.id;
            return (
              <button
                key={bill.id}
                type="button"
                disabled={busy}
                onClick={() => onOpenBill(bill)}
                className={`shrink-0 min-w-[10.5rem] max-w-[13rem] min-h-[72px] text-start rounded-xl border px-3 py-2 disabled:opacity-50 ${
                  isActive ? 'border-accent bg-[var(--color-accent-soft)]' : 'border-[var(--color-border-strong)] bg-white active:bg-[var(--color-bg-warm)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-[15px] text-primary truncate">{bill.customerName || 'عميل'}</span>
                  <span className="font-extrabold text-accent tabular-nums shrink-0">{fmtMoney(bill.total || 0)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-[var(--color-text-muted)]">
                  <span>{bill.itemCount || bill.items?.length || 0} أصناف</span>
                  <span className="inline-flex items-center gap-1"><Clock size={11} />{formatOpenBillAge(bill.updatedAtMs) || '—'}</span>
                </div>
                <p className={`text-[11px] font-bold mt-0.5 ${isActive ? 'text-accent' : 'text-[var(--color-text-secondary)]'}`}>
                  {isActive ? 'مفتوحة الآن' : 'اضغط للمتابعة'}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (variant === 'sidebar') {
    return (
      <aside
        className="hidden lg:flex w-60 xl:w-64 shrink-0 flex-col bg-white shadow-xl border border-[var(--color-border)] rounded-2xl sticky top-20 self-start h-[calc(100vh-6.5rem)] max-h-[calc(100vh-6.5rem)] overflow-hidden"
        dir="rtl"
      >
        {body}
      </aside>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex justify-start lg:hidden" dir="ltr">
      <button type="button" className="absolute inset-0 bg-black/35" aria-label="إغلاق" onClick={onClose} />
      <div
        className="relative w-[min(100%,19rem)] h-full bg-white shadow-2xl flex flex-col border-e border-[var(--color-border)]"
        dir="rtl"
      >
        {body}
      </div>
    </div>
  );
}
