import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart, X, ArrowRight, Printer, Trash2, Percent, Search, Plus, User, Pencil, Check,
} from 'lucide-react';
import { fmtMoney } from '../i18n';
import { FONT_UI, FONT_HEADING } from '../branding';
import { getProductType, formatDuration } from '../utils/productPricing';

/* ───────────── بحث العميل بالاسم (حقل مباشر + نتائج) ───────────── */
function CustomerSearch({ customers, selectedId, selectedName, canCreate, onSelect, onAdd, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (selectedId) setQ('');
  }, [selectedId]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = s
      ? customers.filter(
          (c) =>
            (c.name || '').toLowerCase().includes(s) ||
            (c.phone || '').replace(/\s/g, '').includes(s.replace(/\s/g, ''))
        )
      : customers;
    return arr.slice(0, 40);
  }, [customers, q]);

  const pick = (id) => {
    onSelect(id);
    setQ('');
    setOpen(false);
  };

  if (selectedId) {
    return (
      <div className="w-full min-h-[56px] px-3 flex items-center gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-accent-soft)]/40">
        <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-primary text-white">
          <User size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-[var(--color-text-muted)] leading-none mb-1">العميل</span>
          <span className="block text-base font-bold text-primary truncate leading-tight">{selectedName || 'عميل'}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => pick('')}
          className="h-10 px-3 rounded-lg text-sm font-semibold text-[var(--color-text-secondary)] active:bg-white/80"
        >
          تغيير
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={18} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          disabled={disabled}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="ابحث عن العميل بالاسم…"
          className="layali-input w-full h-14 pe-11 ps-3 text-base"
          autoComplete="off"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              inputRef.current?.focus();
            }}
            className="absolute start-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-[var(--color-text-muted)]"
            aria-label="مسح"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 inset-x-0 top-[calc(100%+0.35rem)] max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border-strong)] bg-white shadow-xl">
          <button
            type="button"
            onClick={() => pick('')}
            className="w-full min-h-[48px] px-3 flex items-center justify-between gap-2 text-start border-b border-[var(--color-border)] active:bg-[var(--color-bg-warm)]"
          >
            <span className="font-bold text-primary">ضيف (بدون ملف)</span>
            <span className="text-xs text-[var(--color-text-muted)]">كاش فقط</span>
          </button>
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className="w-full min-h-[52px] px-3 flex items-center justify-between gap-2 text-start border-b border-[var(--color-border)] last:border-0 active:bg-[var(--color-bg-warm)]"
            >
              <span className="min-w-0">
                <span className="block font-bold text-primary truncate">{c.name}</span>
                {c.phone ? (
                  <span dir="ltr" className="inline-block text-xs text-[var(--color-text-muted)] tabular-nums">{c.phone}</span>
                ) : null}
              </span>
              {c.id === selectedId && <Check size={18} className="text-accent shrink-0" />}
            </button>
          ))}
          {list.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">لا يوجد عميل بهذا الاسم</p>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd(q);
              }}
              className="w-full min-h-[48px] px-3 flex items-center justify-center gap-2 text-accent font-bold border-t border-[var(--color-border)] active:bg-[var(--color-accent-soft)]"
            >
              <Plus size={16} />
              {q.trim() ? `إضافة «${q.trim()}»` : 'إضافة عميل جديد'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── سطر السلة ───────────── */
function CartLine({ item, flash, onQty, onRemove }) {
  const lineKey = item.cartItemId || item.id;
  const type = getProductType(item);
  const addons = (item.selectedAddons || []).map((a) => a.name).join('، ');
  const detailChip =
    'inline-flex items-center h-11 px-3 rounded-xl bg-white border border-[var(--color-border-strong)] text-base font-bold tabular-nums text-primary';

  return (
    <div
      className={`rounded-xl p-3 border border-[var(--color-border-strong)] bg-[var(--color-bg-warm)] ${flash ? 'layali-cart-line-flash' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-primary">{item.name}</p>
          {addons && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">+ {addons}</p>}
          {type === 'standard' && item.quantity > 1 && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 tabular-nums">{fmtMoney(item.price)} للحبة</p>
          )}
        </div>
        <p className="text-lg font-extrabold tabular-nums text-primary shrink-0">{fmtMoney(item.price * item.quantity)}</p>
      </div>

      <div className="flex items-center justify-between mt-2">
        {type === 'weight' ? (
          <span className={detailChip}>{item.weightGrams} غ</span>
        ) : type === 'time' ? (
          <span className={detailChip}>
            {formatDuration(item.durationMinutes)}
            {item.billableMinutes && Math.round(item.billableMinutes) !== Math.round(item.durationMinutes)
              ? ` · يُحتسب ${formatDuration(item.billableMinutes)}`
              : ''}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onQty(lineKey, -1)}
              aria-label="إنقاص"
              className="w-11 h-11 rounded-xl bg-white border border-[var(--color-border-strong)] text-2xl leading-none font-bold text-primary active:bg-[var(--color-surface-muted)]"
            >
              −
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums text-primary">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onQty(lineKey, 1)}
              aria-label="زيادة"
              className="w-11 h-11 rounded-xl bg-primary text-white text-2xl leading-none font-bold active:opacity-80"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => onRemove(lineKey)}
          aria-label={`حذف ${item.name}`}
          className="w-11 h-11 grid place-items-center rounded-xl text-[var(--color-danger)] active:bg-[var(--color-danger-soft)]"
        >
          <Trash2 size={19} />
        </button>
      </div>
    </div>
  );
}

/* ───────────── لوحة الطلب الحالي ───────────── */
export default function PosCart({
  mobileOpen,
  onCloseMobile,
  activeOpenBillId,
  editingOrderId,
  currentOrder,
  customers,
  canCreateCustomers,
  onSelectCustomer,
  onAddCustomer,
  onNotesChange,
  onGuestNameChange,
  onQty,
  onRemove,
  lastAddedId,
  subtotal,
  discount,
  discountAmount,
  total,
  onDiscount,
  onPay,
  onSuspend,
  onPrint,
  onCancelBill,
  onExitBill,
  busy,
}) {
  const [notesToggle, setNotesToggle] = useState(false);

  const items = currentOrder.items;
  const hasItems = items.length > 0;
  const itemCount = items.reduce((a, i) => a + (i.quantity || 0), 0);
  const customerId = currentOrder.customerId || '';
  const customer = customerId ? customers.find((c) => c.id === customerId) : null;
  const canSuspend = !!customerId && !editingOrderId;
  const notesOpen = notesToggle || !!currentOrder.notes || (!customerId && !!currentOrder.customer);

  const rootBase =
    'shrink-0 flex-col bg-white border border-[var(--color-border)] shadow-xl lg:flex lg:relative lg:h-full lg:w-[26rem] xl:w-[28rem] lg:rounded-2xl lg:z-auto';
  const rootState = mobileOpen
    ? 'flex fixed inset-y-0 right-0 z-50 w-[min(100%,28rem)] h-[100dvh] rounded-none'
    : 'hidden';

  return (
    <>
      {mobileOpen && (
        <button type="button" aria-label="إغلاق الطلب" onClick={onCloseMobile} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      )}

      <aside className={`${rootBase} ${rootState}`} dir="rtl" style={{ fontFamily: FONT_UI }}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>الطلب الحالي</h3>
                {activeOpenBillId && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--color-warning-soft)] text-amber-900 border border-amber-200">فاتورة معلقة</span>
                )}
                {editingOrderId && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">تعديل طلب محفوظ</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 tabular-nums">{itemCount} صنف</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activeOpenBillId && (
                <button
                  type="button"
                  onClick={onExitBill}
                  title="الفاتورة تبقى معلّقة"
                  className="h-11 px-3 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-strong)] text-sm font-semibold text-primary active:bg-[var(--color-surface-muted)]"
                >
                  <ArrowRight size={16} /> رجوع
                </button>
              )}
              <button type="button" onClick={onCloseMobile} aria-label="إغلاق" className="lg:hidden w-11 h-11 grid place-items-center rounded-full text-gray-500 active:bg-gray-100">
                <X size={24} />
              </button>
            </div>
          </div>

          <CustomerSearch
            customers={customers}
            selectedId={customerId}
            selectedName={currentOrder.customer || customer?.name}
            canCreate={canCreateCustomers}
            disabled={busy}
            onSelect={onSelectCustomer}
            onAdd={onAddCustomer}
          />

          {notesOpen ? (
            <div className="mt-2 space-y-2">
              {!customerId && (
                <input
                  type="text"
                  value={currentOrder.customer}
                  onChange={(e) => onGuestNameChange(e.target.value)}
                  placeholder="اسم الضيف (اختياري)"
                  className="layali-input w-full h-11 px-3 text-base"
                />
              )}
              <input
                type="text"
                value={currentOrder.notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="ملاحظات (اختياري)"
                className="layali-input w-full h-11 px-3 text-base"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotesToggle(true)}
              className="mt-1 h-11 px-1 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
            >
              <Pencil size={14} /> {customerId ? 'إضافة ملاحظة' : 'اسم الضيف / ملاحظة'}
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
          {!hasItems ? (
            <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center px-4 text-[var(--color-text-muted)]">
              <ShoppingCart size={30} className="mb-2 opacity-40" />
              <p className="text-sm font-semibold text-primary">لا أصناف بعد</p>
              <p className="text-xs mt-1">اضغط على صنف لإضافته</p>
            </div>
          ) : (
            items.map((item) => {
              const k = item.cartItemId || item.id;
              return <CartLine key={k} item={item} flash={!!lastAddedId && lastAddedId === k} onQty={onQty} onRemove={onRemove} />;
            })
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--color-border-strong)] bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
          {hasItems && (
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={onDiscount} className="h-11 px-3 -ms-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold text-accent active:bg-[var(--color-accent-soft)]">
                <Percent size={15} /> {discount > 0 ? 'تعديل الخصم' : 'إضافة خصم'}
              </button>
              {discount > 0 && (
                <div className="text-end text-sm tabular-nums">
                  <span className="text-[var(--color-text-muted)]">{fmtMoney(subtotal)}</span>
                  <span className="ms-3 font-bold text-[var(--color-danger)]">− {fmtMoney(discountAmount)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end justify-between">
            <span className="text-base font-semibold text-[var(--color-text-secondary)]">الإجمالي</span>
            <span className="text-4xl font-extrabold tabular-nums text-primary leading-none">{fmtMoney(total)}</span>
          </div>

          {activeOpenBillId && !hasItems ? (
            <button
              type="button"
              onClick={onCancelBill}
              disabled={busy}
              className="w-full h-14 rounded-xl text-white font-bold disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-danger)' }}
            >
              إلغاء الفاتورة المعلقة
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onPay}
                disabled={!hasItems || busy}
                className="w-full h-16 rounded-xl text-white text-xl font-extrabold shadow-md disabled:opacity-40 active:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--color-success)' }}
              >
                {busy ? 'جاري المعالجة…' : hasItems ? `دفع · ${fmtMoney(total)}` : 'دفع'}
              </button>
              <div className={`grid gap-2 ${canSuspend ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {canSuspend && (
                  <button
                    type="button"
                    onClick={onSuspend}
                    disabled={!hasItems || busy}
                    className="h-12 rounded-xl text-base font-bold border bg-[var(--color-warning-soft)] text-amber-900 border-amber-200 disabled:opacity-40"
                  >
                    {activeOpenBillId ? 'حفظ الفاتورة' : 'تعليق'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onPrint}
                  disabled={!hasItems}
                  className="h-12 rounded-xl text-base font-semibold border border-[var(--color-border-strong)] bg-white text-primary flex items-center justify-center gap-2 disabled:opacity-40 active:bg-[var(--color-surface-muted)]"
                >
                  <Printer size={17} /> طباعة مبدئية
                </button>
              </div>
              {hasItems && !customerId && !editingOrderId && (
                <p className="text-[11px] text-center text-[var(--color-text-muted)]">ضيف: كاش فقط — ابحث عن عميل للتعليق أو الدين</p>
              )}
              {editingOrderId && (
                <p className="text-[11px] text-center text-[var(--color-text-muted)]">تعديل طلب محفوظ — التعليق غير متاح</p>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
