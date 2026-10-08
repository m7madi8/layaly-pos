import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';

export default function DailyCashOpenModal({
  expected,
  firstTime,
  fmtMoney,
  theme,
  busy,
  onContinue,
}) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    setAmount(String(expected ?? 0));
  }, [expected]);

  const parsed = parseFloat(amount);
  const valid = amount !== '' && Number.isFinite(parsed) && parsed >= 0;
  const diff = valid ? Math.round((parsed - (Number(expected) || 0)) * 100) / 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-cash-title"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="w-12 h-12 rounded-2xl grid place-items-center text-white shrink-0"
            style={{ backgroundColor: theme.primary }}
          >
            <Wallet size={22} />
          </span>
          <div>
            <h2 id="daily-cash-title" className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
              {firstTime ? 'الافتتاح الأول للصندوق' : 'تأكيد نقد الصندوق'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: FONT_UI }}>
              {firstTime
                ? 'سجّل المبلغ الموجود في الصندوق الآن لبدء العمل.'
                : 'المبلغ المتوقع من إغلاق آخر وردية — عدّ النقد وتأكد قبل الاستمرار.'}
            </p>
          </div>
        </div>

        {!firstTime && (
          <p className="text-sm text-gray-700 mb-3 rounded-xl bg-[var(--color-bg-warm)] px-3 py-2.5" style={{ fontFamily: FONT_UI }}>
            المتوقع في الصندوق: <strong className="text-primary">{fmtMoney(expected)}</strong>
          </p>
        )}

        <label className="block text-xs text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>
          {firstTime ? 'رصيد الافتتاح (₪)' : 'المبلغ الفعلي في الصندوق (₪)'}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-3.5 rounded-xl border border-gray-200 text-xl font-bold text-center outline-none focus:ring-2 focus:ring-primary/20 mb-2"
          autoFocus
        />

        {!firstTime && valid && Math.abs(diff) > 0.009 && (
          <p className="text-xs text-amber-800 mb-3" style={{ fontFamily: FONT_UI }}>
            فرق عن المتوقع: <strong>{fmtMoney(diff)}</strong> — سيُفتح اليوم على المبلغ الذي أدخلته.
          </p>
        )}

        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => onContinue(parsed)}
          className="w-full py-3.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
        >
          {busy ? 'جاري الفتح…' : 'استمرار وبدء العمل'}
        </button>

        {!firstTime && (
          <p className="text-[11px] text-gray-400 text-center mt-3" style={{ fontFamily: FONT_UI }}>
            تظهر هذه النافذة يومياً بعد 12 ظهراً عند عدم وجود وردية مفتوحة.
          </p>
        )}
      </div>
    </div>
  );
}
