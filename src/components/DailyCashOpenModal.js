import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { shiftPeriodLabel } from '../utils/cashDayGate';

export default function DailyCashOpenModal({
  expected,
  firstTime,
  shiftPeriod = 1,
  fmtMoney,
  theme,
  busy,
  onContinue,
}) {
  const [amount, setAmount] = useState('');
  const [operatorName, setOperatorName] = useState('');

  useEffect(() => {
    setAmount(String(expected ?? 0));
  }, [expected]);

  useEffect(() => {
    setOperatorName('');
  }, [shiftPeriod]);

  const parsed = parseFloat(amount);
  const validAmount = amount !== '' && Number.isFinite(parsed) && parsed >= 0;
  const validName = operatorName.trim().length >= 2;
  const diff = validAmount ? Math.round((parsed - (Number(expected) || 0)) * 100) / 100 : 0;
  const periodLabel = shiftPeriodLabel(shiftPeriod);

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
              {firstTime ? 'الافتتاح الأول للصندوق' : `بدء ${periodLabel}`}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: FONT_UI }}>
              {shiftPeriod === 2
                ? 'بعد إغلاق الشفت الأول — أكّد النقد في الصندوق لبدء الشفت الثاني.'
                : firstTime
                  ? 'سجّل اسمك والمبلغ في الصندوق لبدء الشفت الأول.'
                  : 'الشفت الأول — عدّ النقد واضغط استمرار.'}
            </p>
          </div>
        </div>

        <label className="block text-xs text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>اسم المشغّل *</label>
        <input
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          placeholder="مثال: أحمد"
          className="w-full px-3 py-3 rounded-xl border border-gray-200 text-base outline-none focus:ring-2 focus:ring-primary/20 mb-3"
          autoFocus
        />

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
        />

        {!firstTime && validAmount && Math.abs(diff) > 0.009 && (
          <p className="text-xs text-amber-800 mb-3" style={{ fontFamily: FONT_UI }}>
            فرق عن المتوقع: <strong>{fmtMoney(diff)}</strong>
          </p>
        )}

        <button
          type="button"
          disabled={busy || !validAmount || !validName}
          onClick={() => onContinue(parsed, operatorName.trim())}
          className="w-full py-3.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
        >
          {busy ? 'جاري الفتح…' : 'استمرار وبدء العمل'}
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-3 leading-relaxed" style={{ fontFamily: FONT_UI }}>
          الشفت الأول حتى تسكير الكاش الأول · الشفت الثاني حتى التسكير النهائي · الفائض يذهب للخزنة عند كل تسكير
        </p>
      </div>
    </div>
  );
}
