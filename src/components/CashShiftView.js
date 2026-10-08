import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Minus, Lock, Unlock, CalendarDays } from 'lucide-react';
import { computeExpectedCash } from '../utils/cashShiftMath';

function shiftDayLabel(shift) {
  const ms = Number(shift.closedAtMs) || Number(shift.openedAtMs) || 0;
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('ar-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function shiftTimeLabel(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function vaultTransferForShift(shift, movements) {
  if (shift.vaultTransferOnClose != null && shift.status === 'closed') {
    return Number(shift.vaultTransferOnClose) || 0;
  }
  if (shift.status !== 'closed') return 0;
  return (movements || [])
    .filter((m) => m.shiftId === shift.id && m.isClosingWithdrawal)
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
}

export default function CashShiftView({
  openShift,
  lastClosedShift,
  shiftHistory = [],
  movements = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  busy,
  onWithdraw,
  onDeposit,
  onCloseShift,
}) {
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

  const expected = totals ? computeExpectedCash(totals) : 0;

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

  const dailyRows = useMemo(() => {
    const list = (shiftHistory || [])
      .slice()
      .sort((a, b) => (Number(b.openedAtMs) || 0) - (Number(a.openedAtMs) || 0));
    return list.map((shift) => ({
      id: shift.id,
      day: shiftDayLabel(shift),
      openedAt: shiftTimeLabel(shift.openedAtMs),
      closedAt: shift.status === 'closed' ? shiftTimeLabel(shift.closedAtMs) : null,
      opening: Number(shift.openingBalance) || 0,
      closingInDrawer:
        shift.status === 'closed' && shift.actualClosingBalance != null
          ? Number(shift.actualClosingBalance)
          : null,
      toVault: vaultTransferForShift(shift, movements),
      status: shift.status,
    }));
  }, [shiftHistory, movements]);

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <h2 className="text-2xl md:text-3xl text-primary mb-2" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
        الصندوق / إغلاق الكاش
      </h2>
      <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: FONT_UI }}>
        عند الإغلاق: أدخل ما يبقى في الصندوق فقط — الباقي يُنقل تلقائياً إلى الخزنة.
      </p>

      {!openShift ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 mb-8">
          <div className="flex items-center gap-2 text-primary">
            <Unlock size={20} />
            <p className="font-semibold" style={{ fontFamily: FONT_UI }}>لا توجد وردية مفتوحة</p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: FONT_UI }}>
            يُفتح الصندوق تلقائياً من نافذة التأكيد عند فتح التطبيق
            {suggestedOpening !== '' ? (
              <>
                {' '}
                (المتوقع من آخر إغلاق: <strong>{fmtMoney(suggestedOpening)}</strong>)
              </>
            ) : null}
            . بعد الساعة 12 ظهراً تظهر النافذة يومياً — عدّ النقد واضغط «استمرار».
          </p>
          <p className="text-[11px] text-gray-400" style={{ fontFamily: FONT_UI }}>
            الافتتاح الأول يظهر فور تسجيل الدخول. لا حاجة لفتح الكاش يدوياً كل يوم.
          </p>
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
                سحب داخلي من الصندوق (لا يُحسب مصروفاً). التحويل للخزنة يتم فقط عند إغلاق الكاش.
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
              setActualCash(String(suggestedOpening !== '' ? suggestedOpening : expected));
              setCloseNotes('');
              setShowCloseModal(true);
            }}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mb-6"
            style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
          >
            <Lock size={16} />
            إغلاق الكاش
          </button>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-8">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
              <Wallet size={16} /> حركة الصندوق (اليوم الحالي)
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto layali-scrollbar-none">
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
                          ? m.isClosingWithdrawal
                            ? 'نقل للخزنة (إغلاق)'
                            : 'سحب'
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

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
          <CalendarDays size={16} /> سجل الورديات (يومياً)
        </p>
        {dailyRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center" style={{ fontFamily: FONT_UI }}>
            لا ورديات مسجّلة بعد
          </p>
        ) : (
          <div className="overflow-x-auto layali-scrollbar-none">
            <table className="w-full text-sm" style={{ fontFamily: FONT_UI }}>
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-start py-2 pe-2 font-medium">اليوم</th>
                  <th className="text-start py-2 px-2 font-medium">الافتتاح</th>
                  <th className="text-start py-2 px-2 font-medium">التسكير (في الصندوق)</th>
                  <th className="text-start py-2 ps-2 font-medium">للخزنة</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 pe-2 align-top">
                      <p className="font-medium text-primary">{row.day}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {row.status === 'open' ? (
                          <span className="text-amber-700">مفتوحة · من {row.openedAt}</span>
                        ) : (
                          <span>فتح {row.openedAt} · إغلاق {row.closedAt}</span>
                        )}
                      </p>
                    </td>
                    <td className="py-3 px-2 tabular-nums whitespace-nowrap">{fmtMoney(row.opening)}</td>
                    <td className="py-3 px-2 tabular-nums whitespace-nowrap">
                      {row.closingInDrawer != null ? fmtMoney(row.closingInDrawer) : '—'}
                    </td>
                    <td className="py-3 ps-2 tabular-nums whitespace-nowrap font-semibold text-green-700">
                      {row.status === 'closed' ? fmtMoney(row.toVault) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3" style={{ fontFamily: FONT_UI }}>
          التسكير = المبلغ المتبقي في الصندوق. للخزنة = الفرق الذي يُنقل تلقائياً عند الإغلاق.
        </p>
      </div>

      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>
              إغلاق الكاش
            </h3>
            <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: FONT_UI }}>
              الرصيد المتوقع في الصندوق: <strong>{fmtMoney(expected)}</strong>
            </p>
            <label className="block text-xs text-gray-500 mb-1">كم تريد أن يبقى في الصندوق؟ (₪)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 text-lg font-bold text-center mb-3 outline-none"
              autoFocus
            />
            <div className="rounded-xl bg-[var(--color-accent-soft)]/50 border border-[var(--color-border)] px-3 py-2.5 mb-3">
              <p className="text-sm" style={{ fontFamily: FONT_UI }}>
                يُنقل تلقائياً إلى الخزنة: <strong className="text-primary">{fmtMoney(closingWithdrawal)}</strong>
              </p>
              <p className="text-[11px] text-gray-600 mt-1" style={{ fontFamily: FONT_UI }}>
                لا حاجة لإدخال مبلغ الخزنة — يُحسب من الفرق تلقائياً.
              </p>
            </div>
            {Math.abs(closeDifference) > 0.009 && (
              <p className="text-sm mb-3 text-amber-800" style={{ fontFamily: FONT_UI }}>
                فرق عدّ (فائض/نقص): <strong>{fmtMoney(closeDifference)}</strong>
              </p>
            )}
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
                تأكيد الإغلاق والنقل للخزنة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
