import React, { useMemo, useState } from 'react';
import { Landmark, Plus, ArrowDownToLine } from 'lucide-react';

const typeLabel = (type) => {
  switch (type) {
    case 'capital':
      return 'رأس مال';
    case 'deposit':
      return 'إيداع';
    case 'from_cash_close':
      return 'من إغلاق الكاش';
    case 'from_cash':
      return 'من الصندوق';
    default:
      return type || 'حركة';
  }
};

export default function VaultView({
  vault,
  movements = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  busy,
  onAddCapital,
  onManualDeposit,
}) {
  const [capitalAmount, setCapitalAmount] = useState('');
  const [capitalNote, setCapitalNote] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');

  const balance = Number(vault?.balance) || 0;
  const totalCapitalIn = Number(vault?.totalCapitalIn) || 0;

  const list = useMemo(
    () =>
      (movements || [])
        .slice()
        .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0))
        .slice(0, 80),
    [movements]
  );

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <h2 className="text-2xl md:text-3xl text-primary mb-2" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
        الخزنة
      </h2>
      <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: FONT_UI }}>
        رصيد النقد المحفوظ خارج الصندوق. عند إغلاق الكاش يُنقل الفائض تلقائياً إلى الخزنة.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5" style={{ fontFamily: FONT_UI }}>
            <Landmark size={14} /> الرصيد الحالي
          </p>
          <p className="text-3xl font-bold text-primary tabular-nums" style={{ fontFamily: FONT_UI }}>
            {fmtMoney(balance)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>إجمالي رأس المال المُضاف</p>
          <p className="text-2xl font-bold text-[var(--color-text-secondary)] tabular-nums" style={{ fontFamily: FONT_UI }}>
            {fmtMoney(totalCapitalIn)}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
            <Plus size={16} className="text-primary" /> إضافة رأس مال للخزنة
          </p>
          <input
            type="number"
            min="0"
            step="0.01"
            value={capitalAmount}
            onChange={(e) => setCapitalAmount(e.target.value)}
            placeholder="المبلغ (₪)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
          />
          <input
            type="text"
            value={capitalNote}
            onChange={(e) => setCapitalNote(e.target.value)}
            placeholder="ملاحظة (مثلاً: رأس مال ابتدائي)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
          />
          <button
            type="button"
            disabled={busy || !(parseFloat(capitalAmount) > 0)}
            onClick={async () => {
              await onAddCapital(capitalAmount, capitalNote);
              setCapitalAmount('');
              setCapitalNote('');
            }}
            className="w-full py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
          >
            تسجيل رأس المال
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
            <ArrowDownToLine size={16} className="text-green-600" /> إيداع نقدي في الخزنة
          </p>
          <p className="text-[11px] text-gray-500 leading-relaxed" style={{ fontFamily: FONT_UI }}>
            لإيداع من خارج الصندوق (لا يخصم من وردية الكاش).
          </p>
          <input
            type="number"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="المبلغ (₪)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
          />
          <input
            type="text"
            value={depositNote}
            onChange={(e) => setDepositNote(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
          />
          <button
            type="button"
            disabled={busy || !(parseFloat(depositAmount) > 0)}
            onClick={async () => {
              await onManualDeposit(depositAmount, depositNote);
              setDepositAmount('');
              setDepositNote('');
            }}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#16a34a', fontFamily: FONT_UI }}
          >
            تسجيل الإيداع
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-sm font-semibold mb-3" style={{ fontFamily: FONT_UI }}>سجل الخزنة</p>
        <div className="space-y-2 max-h-80 overflow-y-auto layali-scrollbar-none">
          {list.length === 0 && (
            <p className="text-sm text-gray-500 py-8 text-center" style={{ fontFamily: FONT_UI }}>
              لا حركات بعد — أضف رأس مال أو أغلق الكاش لنقل الفائض هنا.
            </p>
          )}
          {list.map((m) => (
            <div key={m.id} className="flex justify-between gap-3 text-sm border-b border-gray-100 py-2">
              <div className="min-w-0">
                <p className="font-medium text-primary" style={{ fontFamily: FONT_UI }}>{typeLabel(m.type)}</p>
                <p className="text-xs text-gray-500 truncate">{m.reason || '—'}</p>
              </div>
              <p className="font-bold text-green-700 shrink-0 tabular-nums" style={{ fontFamily: FONT_UI }}>
                +{fmtMoney(m.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
