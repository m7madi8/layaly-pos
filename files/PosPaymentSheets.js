import React, { useEffect } from 'react';
import { X, Wallet, User, Calculator } from 'lucide-react';
import { fmtMoney } from '../i18n';
import { FONT_UI, FONT_HEADING } from '../branding';

function Sheet({ open, onClose, title, busy, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/45" onClick={busy ? undefined : onClose}>
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[94dvh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl"
        style={{ fontFamily: FONT_UI }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="w-12 h-12 grid place-items-center rounded-full text-gray-500 active:bg-gray-100 disabled:opacity-40">
            <X size={24} />
          </button>
        </div>
        <div className="px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

function TotalBlock({ total, caption }) {
  return (
    <div className="text-center rounded-2xl bg-[var(--color-bg-warm)] border border-[var(--color-border)] py-4 mb-4">
      <p className="text-sm text-[var(--color-text-muted)] mb-1">{caption || 'الإجمالي المطلوب'}</p>
      <p className="text-5xl font-extrabold tabular-nums text-primary leading-tight">{fmtMoney(total)}</p>
    </div>
  );
}

function Row({ label, value, tone }) {
  const color = tone === 'good' ? 'text-[var(--color-success)]' : tone === 'bad' ? 'text-[var(--color-danger)]' : 'text-primary';
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-base text-[var(--color-text-secondary)]">{label}</span>
      <span className={`text-2xl font-extrabold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

const confirmBtn =
  'w-full h-16 rounded-xl text-white text-xl font-extrabold shadow-md disabled:opacity-40 transition-opacity';

/* ───── 1) اختيار طريقة الدفع (للعميل المسجّل فقط — الضيف يذهب مباشرة للكاش) ───── */
export function PaymentChooserSheet({ open, total, customerName, busy, onClose, onCash, onDebt, onMixed }) {
  const tile =
    'w-full min-h-[84px] px-4 flex items-center gap-4 rounded-2xl border-2 text-start disabled:opacity-50 active:scale-[0.99] transition-transform';
  return (
    <Sheet open={open} onClose={onClose} title="طريقة الدفع" busy={busy}>
      <TotalBlock total={total} caption={customerName ? `العميل: ${customerName}` : 'الإجمالي المطلوب'} />
      <div className="space-y-3">
        <button type="button" onClick={onCash} disabled={busy} className={`${tile} border-[var(--color-success)] bg-[var(--color-success-soft)]`}>
          <span className="w-12 h-12 rounded-full grid place-items-center bg-[var(--color-success)] text-white shrink-0"><Wallet size={24} /></span>
          <span>
            <span className="block text-xl font-extrabold text-primary">كاش</span>
            <span className="block text-sm text-[var(--color-text-secondary)]">دفع كامل نقداً</span>
          </span>
        </button>
        <button type="button" onClick={onMixed} disabled={busy} className={`${tile} border-amber-300 bg-[var(--color-warning-soft)]`}>
          <span className="w-12 h-12 rounded-full grid place-items-center bg-amber-500 text-white shrink-0"><Calculator size={24} /></span>
          <span>
            <span className="block text-xl font-extrabold text-primary">كاش + دين</span>
            <span className="block text-sm text-[var(--color-text-secondary)]">جزء نقداً والباقي على الحساب</span>
          </span>
        </button>
        <button type="button" onClick={onDebt} disabled={busy} className={`${tile} border-[var(--color-border-strong)] bg-white`}>
          <span className="w-12 h-12 rounded-full grid place-items-center bg-[var(--color-danger)] text-white shrink-0"><User size={24} /></span>
          <span>
            <span className="block text-xl font-extrabold text-primary">{busy ? 'جاري الحفظ…' : 'دين'}</span>
            <span className="block text-sm text-[var(--color-text-secondary)]">كامل المبلغ يُسجَّل على حساب العميل</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

/* ───── 2) كاش ───── */
export function CashSheet({ open, total, given, onGivenChange, busy, onClose, onConfirm }) {
  const parsed = given === '' ? total : parseFloat(given);
  const paid = Number.isFinite(parsed) ? parsed : 0;
  const change = Math.max(0, paid - total);
  const short = paid < total;
  const quick = [10, 20, 50, 100, 200];

  return (
    <Sheet open={open} onClose={onClose} title="دفع نقدي" busy={busy}>
      <TotalBlock total={total} />

      <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-1.5">
        المبلغ المُسلّم <span className="font-normal text-[var(--color-text-muted)]">— اتركه فارغاً إن دفع المبلغ بالضبط</span>
      </label>
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        min="0"
        value={given}
        onChange={(e) => onGivenChange(e.target.value)}
        placeholder={String(total)}
        dir="ltr"
        className="layali-input w-full h-16 text-center text-3xl font-extrabold tabular-nums mb-3"
      />

      <div className="grid grid-cols-3 gap-2 mb-3">
        <button type="button" onClick={() => onGivenChange(String(total))} className="col-span-3 h-14 rounded-xl border-2 border-accent text-accent text-lg font-bold active:bg-[var(--color-accent-soft)]">
          المبلغ بالضبط
        </button>
        {quick.map((a) => (
          <button key={a} type="button" onClick={() => onGivenChange(String(a))} className="h-14 rounded-xl border border-[var(--color-border-strong)] text-xl font-bold text-primary tabular-nums active:bg-[var(--color-surface-muted)]">
            {a}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] px-4 mb-4 divide-y divide-[var(--color-border)]">
        <Row label="المدفوع" value={fmtMoney(paid)} />
        {short ? (
          <Row label="ينقص" value={fmtMoney(total - paid)} tone="bad" />
        ) : (
          <Row label="الباقي للزبون" value={fmtMoney(change)} tone="good" />
        )}
      </div>

      <button type="button" onClick={onConfirm} disabled={busy || short} className={confirmBtn} style={{ backgroundColor: 'var(--color-success)' }}>
        {busy ? 'جاري المعالجة…' : `تأكيد الدفع · ${fmtMoney(total)}`}
      </button>
    </Sheet>
  );
}

/* ───── 3) كاش + دين ───── */
export function MixedSheet({ open, total, customerName, cash, onCashChange, busy, onClose, onConfirm }) {
  const cashNum = parseFloat(cash) || 0;
  const debt = Math.max(0, total - cashNum);
  const valid = cash !== '' && cashNum >= 0 && cashNum < total;

  return (
    <Sheet open={open} onClose={onClose} title="كاش + دين" busy={busy}>
      <TotalBlock total={total} caption={customerName ? `العميل: ${customerName}` : undefined} />

      <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-1.5">المبلغ الكاش</label>
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={cash}
        onChange={(e) => onCashChange(e.target.value)}
        placeholder="0"
        dir="ltr"
        className="layali-input w-full h-16 text-center text-3xl font-extrabold tabular-nums mb-4"
      />

      <div className="rounded-2xl border border-[var(--color-border)] px-4 mb-4 divide-y divide-[var(--color-border)]">
        <Row label="كاش الآن" value={fmtMoney(cashNum)} tone="good" />
        <Row label="يُسجَّل دين" value={fmtMoney(debt)} tone="bad" />
      </div>
      {cash !== '' && cashNum >= total && (
        <p className="text-sm text-[var(--color-danger)] mb-3">الكاش يغطي كامل المبلغ — استخدم «كاش» بدل الدفع الجزئي.</p>
      )}

      <button type="button" onClick={onConfirm} disabled={busy || !valid} className={confirmBtn} style={{ backgroundColor: 'var(--color-primary)' }}>
        {busy ? 'جاري المعالجة…' : 'تأكيد الدفع الجزئي'}
      </button>
    </Sheet>
  );
}
