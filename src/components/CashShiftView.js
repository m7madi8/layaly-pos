import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Minus, Lock, Unlock } from 'lucide-react';
import { computeExpectedCash } from '../utils/cashShiftMath';

export default function CashShiftView({
  openShift,
  lastClosedShift,
  movements = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  busy,
  onOpenShift,
  onWithdraw,
  onDeposit,
  onCloseShift,
}) {
  const [openingInput, setOpeningInput] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const totals = useMemo(() => {
    if (!openShift) return null;
    return {
      openingBalance: Number(openShift.openingBalance) || 0,
      cashSales: Number(openShift.cashSales) || 0,
      cashWithdrawals: Number(openShift.cashWithdrawals) || 0,
      cashDeposits: Number(openShift.cashDeposits) || 0,
      cashRefunds: Number(openShift.cashRefunds) || 0,
    };
  }, [openShift]);

  const expected = totals
    ? computeExpectedCash(totals)
    : 0;

  const suggestedOpening =
    lastClosedShift?.actualClosingBalance != null
      ? Number(lastClosedShift.actualClosingBalance)
      : lastClosedShift?.expectedClosingBalance != null
        ? Number(lastClosedShift.expectedClosingBalance)
        : '';

  const closingWithdrawal = Math.max(0, expected - (parseFloat(actualCash) || 0));
  const closeDifference = Math.round(((parseFloat(actualCash) || 0) - (expected - closingWithdrawal)) * 100) / 100;

  const shiftMovements = useMemo(
    () =>
      (movements || [])
        .filter((m) => openShift && m.shiftId === openShift.id)
        .slice()
        .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0)),
    [movements, openShift]
  );

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <h2 className="text-2xl md:text-3xl text-primary mb-6" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
        الصندوق / إغلاق الكاش
      </h2>

      {!openShift ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Unlock size={20} />
            <p className="font-semibold" style={{ fontFamily: FONT_UI }}>فتح وردية كاش جديدة</p>
          </div>
          {suggestedOpening !== '' && (
            <p className="text-sm text-gray-600" style={{ fontFamily: FONT_UI }}>
              رصيد إغلاق الوردية السابقة: <strong>{fmtMoney(suggestedOpening)}</strong>
            </p>
          )}
          <label className="block text-xs text-gray-500 mb-1">الرصيد الافتتاحي (₪)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingInput === '' ? (suggestedOpening !== '' ? String(suggestedOpening) : '') : openingInput}
            onChange={(e) => setOpeningInput(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-gray-200 text-lg font-bold text-center outline-none"
            placeholder="0"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const value =
                openingInput !== ''
                  ? openingInput
                  : suggestedOpening !== ''
                    ? suggestedOpening
                    : 0;
              onOpenShift(value);
              setOpeningInput('');
            }}
            className="w-full py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
          >
            فتح الصندوق
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
              ['الرصيد الافتتاحي', totals.openingBalance],
              ['مبيعات كاش', totals.cashSales],
              ['سحوبات', totals.cashWithdrawals],
              ['إيداعات', totals.cashDeposits],
              ['مرتجعات كاش', totals.cashRefunds],
              ['الرصيد المتوقع', expected],
            ].map(([label, value]) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>{label}</p>
                <p className="text-xl font-bold" style={{ color: theme.text, fontFamily: FONT_UI }}>
                  {fmtMoney(value)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
                <Minus size={16} className="text-red-500" /> سحب من الصندوق
              </p>
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="المبلغ"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <input
                type="text"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="السبب (اختياري)"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <button
                type="button"
                disabled={busy || !(parseFloat(withdrawAmount) > 0)}
                onClick={() => {
                  onWithdraw(withdrawAmount, withdrawReason);
                  setWithdrawAmount('');
                  setWithdrawReason('');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#dc2626', fontFamily: FONT_UI }}
              >
                تسجيل سحب
              </button>
              <p className="text-[11px] text-gray-500" style={{ fontFamily: FONT_UI }}>
                السحب ليس مصروفاً — هو نقل نقد من الصندوق (safe drop).
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
                <Plus size={16} className="text-green-600" /> إيداع في الصندوق
              </p>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="المبلغ"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <button
                type="button"
                disabled={busy || !(parseFloat(depositAmount) > 0)}
                onClick={() => {
                  onDeposit(depositAmount);
                  setDepositAmount('');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#16a34a', fontFamily: FONT_UI }}
              >
                تسجيل إيداع
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setActualCash(String(expected));
              setCloseNotes('');
              setShowCloseModal(true);
            }}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mb-6"
            style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
          >
            <Lock size={16} />
            إغلاق الكاش
          </button>

          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
              <Wallet size={16} /> حركة الصندوق
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {shiftMovements.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">لا حركات بعد</p>
              )}
              {shiftMovements.map((m) => (
                <div key={m.id} className="flex justify-between text-sm border-b border-gray-100 py-2">
                  <div>
                    <p style={{ fontFamily: FONT_UI }}>
                      {m.type === 'sale'
                        ? 'بيع كاش'
                        : m.type === 'withdrawal'
                          ? 'سحب'
                          : m.type === 'deposit'
                            ? 'إيداع'
                            : m.type === 'refund'
                              ? 'مرتجع'
                              : m.type}
                    </p>
                    <p className="text-xs text-gray-500">{m.reason || '—'}</p>
                  </div>
                  <p className="font-semibold" style={{ fontFamily: FONT_UI }}>
                    {m.type === 'withdrawal' || m.type === 'refund' ? '-' : '+'}
                    {fmtMoney(m.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>
              إغلاق الكاش
            </h3>
            <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: FONT_UI }}>
              الرصيد المتوقع: <strong>{fmtMoney(expected)}</strong>
            </p>
            <label className="block text-xs text-gray-500 mb-1">المبلغ الفعلي المتبقي في الصندوق (₪)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 text-lg font-bold text-center mb-3 outline-none"
              autoFocus
            />
            <p className="text-sm mb-1" style={{ fontFamily: FONT_UI }}>
              السحب عند الإغلاق: <strong>{fmtMoney(closingWithdrawal)}</strong>
            </p>
            <p className="text-sm mb-3" style={{ fontFamily: FONT_UI }}>
              الفرق: <strong>{fmtMoney(closeDifference)}</strong>
            </p>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="ملاحظات (اختياري)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm mb-4 outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="py-2.5 rounded-xl border border-gray-200 text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busy || actualCash === '' || parseFloat(actualCash) < 0}
                onClick={async () => {
                  await onCloseShift(actualCash, closeNotes);
                  setShowCloseModal(false);
                }}
                className="py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}
              >
                تأكيد الإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
