import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Minus, Lock, Unlock, CalendarDays, X, ChevronLeft, Users } from 'lucide-react';
import { computeExpectedCash } from '../utils/cashShiftMath';
import { shiftPeriodLabel } from '../utils/cashDayGate';
import { listCashMovementsForShift } from '../services/cashShiftService';
import { buildWorkedStaffSnapshot, getActiveOnDutyIdsFromShift } from '../utils/shiftOnDutyRoster';
import { uniqueStaffMembersByName } from '../utils/employeeBenefitAccounting';
import OpenShiftOnDutyManageModal from './OpenShiftOnDutyManageModal';

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

function movementTypeLabel(m) {
  if (m.type === 'sale') return 'بيع كاش';
  if (m.type === 'withdrawal') {
    if (m.isClosingWithdrawal) return 'نقل للخزنة (إغلاق)';
    return 'سحب';
  }
  if (m.type === 'deposit') return 'إيداع';
  if (m.type === 'refund') return 'مرتجع';
  return m.type || '—';
}

function MovementRow({ m, fmtMoney }) {
  const out = m.type === 'withdrawal' || m.type === 'refund';
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-gray-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-primary">{movementTypeLabel(m)}</p>
        <p className="text-xs text-gray-500 truncate">{m.reason || '—'}</p>
        {m.orderNumber ? (
          <p className="text-[11px] text-gray-400 mt-0.5">طلب #{m.orderNumber}</p>
        ) : null}
        <p className="text-[11px] text-gray-400 mt-0.5">{shiftTimeLabel(m.createdAtMs)}</p>
      </div>
      <p className={`font-semibold tabular-nums shrink-0 ${out ? 'text-red-700' : 'text-green-700'}`}>
        {out ? '-' : '+'}
        {fmtMoney(m.amount)}
      </p>
    </div>
  );
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

function ShiftDetailModal({
  shift,
  movements,
  loading,
  error,
  movementsFallback,
  staffMembers = [],
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  onClose,
}) {
  const totals = useMemo(
    () => ({
      openingBalance: Number(shift.openingBalance) || 0,
      cashSales: Number(shift.cashSales) || 0,
      cashWithdrawals: Number(shift.cashWithdrawals) || 0,
      cashDeposits: Number(shift.cashDeposits) || 0,
      cashRefunds: Number(shift.cashRefunds) || 0,
    }),
    [shift]
  );
  const expected = computeExpectedCash(totals);
  const toVault =
    shift.vaultTransferOnClose != null
      ? Number(shift.vaultTransferOnClose) || 0
      : vaultTransferForShift(shift, movementsFallback);
  const list =
    movements.length > 0
      ? movements
      : (movementsFallback || []).filter((m) => m.shiftId === shift.id);

  const workedStaff = useMemo(() => {
    const snap = buildWorkedStaffSnapshot(shift);
    if (snap.length > 0) return snap;
    const byId = Object.fromEntries((staffMembers || []).map((s) => [s.id, s.name]));
    return (shift.onDutyStaffIds || []).map((id) => ({ staffId: id, name: byId[id] || '—' }));
  }, [shift, staffMembers]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col border border-gray-200 shadow-xl"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>
              {shiftDayLabel(shift)}
            </p>
            <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
              {shiftPeriodLabel(shift.shiftPeriod)}
            </h3>
            <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: FONT_UI }}>
              المشغّل: <strong>{shift.operatorName || '—'}</strong>
              {shift.status === 'open' ? (
                <span className="text-amber-700 ms-2">· مفتوحة</span>
              ) : (
                <span className="text-gray-500 ms-2">
                  · فتح {shiftTimeLabel(shift.openedAtMs)} — إغلاق {shiftTimeLabel(shift.closedAtMs)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto layali-scrollbar-none p-5 space-y-5 flex-1">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['الافتتاح', totals.openingBalance],
              ['مبيعات كاش', totals.cashSales],
              ['سحوبات', totals.cashWithdrawals],
              ['إيداعات', totals.cashDeposits],
              ['مرتجعات', totals.cashRefunds],
              ['المتوقع في الصندوق', expected],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-[var(--color-bg-warm)]/40 px-3 py-2.5">
                <p className="text-[11px] text-gray-500" style={{ fontFamily: FONT_UI }}>
                  {label}
                </p>
                <p className="text-base font-bold tabular-nums" style={{ fontFamily: FONT_UI, color: theme.text }}>
                  {fmtMoney(value)}
                </p>
              </div>
            ))}
          </div>

          {workedStaff.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
                <Users size={16} /> من داوم في الشفت
              </p>
              <ul className="flex flex-wrap gap-2">
                {workedStaff.map((s) => (
                  <li
                    key={s.staffId}
                    className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-bg-warm)] border border-gray-100"
                    style={{ fontFamily: FONT_UI }}
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shift.status === 'closed' && (
            <div className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-primary" style={{ fontFamily: FONT_UI }}>
                ملخص الإغلاق
              </p>
              <div className="flex justify-between text-sm" style={{ fontFamily: FONT_UI }}>
                <span className="text-gray-600">بقي في الصندوق</span>
                <span className="font-semibold tabular-nums">
                  {shift.actualClosingBalance != null ? fmtMoney(shift.actualClosingBalance) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm" style={{ fontFamily: FONT_UI }}>
                <span className="text-gray-600">نُقل للخزنة</span>
                <span className="font-semibold tabular-nums text-green-700">{fmtMoney(toVault)}</span>
              </div>
              {shift.difference != null && Math.abs(Number(shift.difference)) > 0.009 && (
                <div className="flex justify-between text-sm text-amber-800" style={{ fontFamily: FONT_UI }}>
                  <span>فرق عدّ</span>
                  <span className="font-semibold tabular-nums">{fmtMoney(shift.difference)}</span>
                </div>
              )}
              {shift.closingNotes ? (
                <p className="text-xs text-gray-600 pt-1 border-t border-gray-100" style={{ fontFamily: FONT_UI }}>
                  ملاحظات: {shift.closingNotes}
                </p>
              ) : null}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ fontFamily: FONT_UI }}>
              <Wallet size={16} /> كل الحركات
            </p>
            {loading && (
              <p className="text-sm text-gray-500 py-8 text-center" style={{ fontFamily: FONT_UI }}>
                جاري التحميل…
              </p>
            )}
            {!loading && error && (
              <p className="text-sm text-red-600 py-4 text-center" style={{ fontFamily: FONT_UI }}>
                {error}
              </p>
            )}
            {!loading && !error && list.length === 0 && (
              <p className="text-sm text-gray-500 py-8 text-center" style={{ fontFamily: FONT_UI }}>
                لا حركات مسجّلة لهذه الوردية
              </p>
            )}
            {!loading && !error && list.length > 0 && (
              <div className="rounded-xl border border-gray-100 px-3 max-h-64 overflow-y-auto layali-scrollbar-none">
                {list.map((m) => (
                  <MovementRow key={m.id} m={m} fmtMoney={fmtMoney} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border border-gray-200"
            style={{ fontFamily: FONT_UI }}
          >
            <ChevronLeft size={16} />
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CashShiftView({
  userId,
  openShift,
  lastClosedShift,
  shiftHistory = [],
  movements = [],
  staffMembers = [],
  canManageStaff = false,
  onCreateStaff,
  onUpdateStaff,
  staffFormBusy = false,
  onAddOnDutyStaff,
  onRemoveOnDutyStaff,
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
  const [showOnDutyModal, setShowOnDutyModal] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [detailShift, setDetailShift] = useState(null);
  const [detailMovements, setDetailMovements] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (!detailShift?.id || !userId) {
      setDetailMovements([]);
      setDetailError('');
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    listCashMovementsForShift(userId, detailShift.id)
      .then((list) => {
        if (!cancelled) setDetailMovements(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailMovements([]);
          setDetailError(err.message || 'تعذّر تحميل الحركات');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailShift?.id, userId]);

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

  const activeOnDutyNames = useMemo(() => {
    if (!openShift) return [];
    const ids = getActiveOnDutyIdsFromShift(openShift);
    const byId = Object.fromEntries(uniqueStaffMembersByName(staffMembers).map((s) => [s.id, s.name]));
    return ids.map((id) => byId[id] || '—');
  }, [openShift, staffMembers]);

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
      shiftPeriod: Number(shift.shiftPeriod) === 2 ? 2 : 1,
      operatorName: shift.operatorName || '—',
    }));
  }, [shiftHistory, movements]);

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <h2 className="text-2xl md:text-3xl text-primary mb-2" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
        الصندوق / إغلاق الكاش
      </h2>
      <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: FONT_UI }}>
        شفتان يومياً: الأول حتى تسكير الكاش الأول، الثاني حتى التسكير النهائي — الفائض يُنقل للخزنة عند كل تسكير.
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
            . الشفت الثاني يبدأ تلقائياً بعد تسكير الأول.
          </p>
          <p className="text-[11px] text-gray-400" style={{ fontFamily: FONT_UI }}>
            الشفت الأول يبدأ من نافذة «استمرار» عند فتح النظام (أو بعد 12 ظهراً ليوم جديد).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-warm)] px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-primary" style={{ fontFamily: FONT_UI }}>
                {shiftPeriodLabel(openShift.shiftPeriod)}
              </p>
              <p className="text-sm text-gray-600" style={{ fontFamily: FONT_UI }}>
                المشغّل: <strong>{openShift.operatorName || '—'}</strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600 flex-1 min-w-0" style={{ fontFamily: FONT_UI }}>
                المداومون:{' '}
                <strong>{activeOnDutyNames.length ? activeOnDutyNames.join(' · ') : '—'}</strong>
              </p>
              {onAddOnDutyStaff && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowOnDutyModal(true)}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 shrink-0"
                  style={{ fontFamily: FONT_UI }}
                >
                  إدارة المداومين
                </button>
              )}
            </div>
          </div>
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
            {Number(openShift.shiftPeriod) === 2 ? 'تسكير الشفت النهائي' : 'تسكير الشفت الأول'}
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
                <MovementRow key={m.id} m={m} fmtMoney={fmtMoney} />
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
                  <th className="text-start py-2 px-2 font-medium">الشفت</th>
                  <th className="text-start py-2 px-2 font-medium">المشغّل</th>
                  <th className="text-start py-2 px-2 font-medium">الافتتاح</th>
                  <th className="text-start py-2 px-2 font-medium">التسكير</th>
                  <th className="text-start py-2 ps-2 font-medium">للخزنة</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => {
                  const fullShift = (shiftHistory || []).find((s) => s.id === row.id);
                  return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-[var(--color-bg-warm)]/60 transition-colors"
                    onClick={() => fullShift && setDetailShift(fullShift)}
                  >
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
                    <td className="py-3 px-2 text-xs whitespace-nowrap">{shiftPeriodLabel(row.shiftPeriod)}</td>
                    <td className="py-3 px-2 text-xs max-w-[5rem] truncate">{row.operatorName}</td>
                    <td className="py-3 px-2 tabular-nums whitespace-nowrap">{fmtMoney(row.opening)}</td>
                    <td className="py-3 px-2 tabular-nums whitespace-nowrap">
                      {row.closingInDrawer != null ? fmtMoney(row.closingInDrawer) : '—'}
                    </td>
                    <td className="py-3 ps-2 tabular-nums whitespace-nowrap font-semibold text-green-700">
                      {row.status === 'closed' ? fmtMoney(row.toVault) : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3" style={{ fontFamily: FONT_UI }}>
          اضغط على أي وردية لعرض التفاصيل والحركات. التسكير = المتبقي في الصندوق. للخزنة = ما يُنقل عند الإغلاق.
        </p>
      </div>

      {detailShift && (
        <ShiftDetailModal
          shift={detailShift}
          movements={detailMovements}
          loading={detailLoading}
          error={detailError}
          movementsFallback={movements}
          staffMembers={staffMembers}
          fmtMoney={fmtMoney}
          theme={theme}
          FONT_UI={FONT_UI}
          FONT_HEADING={FONT_HEADING}
          onClose={() => setDetailShift(null)}
        />
      )}

      {showOnDutyModal && openShift && onAddOnDutyStaff && (
        <OpenShiftOnDutyManageModal
          openShift={openShift}
          staffMembers={staffMembers}
          canManageStaff={canManageStaff}
          onCreateStaff={onCreateStaff}
          onUpdateStaff={onUpdateStaff}
          staffFormBusy={staffFormBusy}
          busy={busy}
          onAddStaff={async (staffId, staffName) => {
            try {
              await onAddOnDutyStaff(staffId, staffName);
            } catch (e) {
              alert(e.message);
            }
          }}
          onRemoveStaff={async (staffId) => {
            try {
              await onRemoveOnDutyStaff?.(staffId);
            } catch (e) {
              /* alert shown in handler */
            }
          }}
          onClose={() => setShowOnDutyModal(false)}
        />
      )}

      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>
              {Number(openShift.shiftPeriod) === 2 ? 'تسكير الشفت النهائي' : 'تسكير الشفت الأول'}
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
