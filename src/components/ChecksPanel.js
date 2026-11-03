import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { db, collection, onSnapshot, query, where, orderBy, limit } from '../firebaseClient';
import { filterChecksForParty } from '../utils/checksPartyFilter';
import { FONT_HEADING, FONT_UI } from '../branding';
import {
  CHECK_PENDING,
  CHECK_COLLECTED,
  CHECK_PAID_OUT,
  CHECK_RETURNED,
} from '../services/checkService';
import {
  gatewayRegisterCheck,
  gatewayCollectCheck,
  gatewayReturnCheck,
} from '../services/financialGateway';
import { newIdempotencyKey } from '../utils/idempotencyKey';

const STATUS_LABEL = {
  [CHECK_PENDING]: 'بانتظار التحصيل',
  [CHECK_COLLECTED]: 'محصّل',
  [CHECK_PAID_OUT]: 'مصروف',
  [CHECK_RETURNED]: 'مرتجع',
};

export default function ChecksPanel({
  uid,
  partyId,
  partyType = 'supplier',
  openShiftId,
  actor,
  businessProfile,
  fmtMoney,
  theme,
}) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({
    checkNumber: '',
    bankName: '',
    amount: '',
    direction: 'in',
    notes: '',
    issueDate: '',
    dueDate: '',
  });
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid || !partyId) {
      setChecks([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'users', uid, 'checks'),
      where('partyId', '==', partyId),
      orderBy('createdAtMs', 'desc'),
      limit(80)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setChecks(filterChecksForParty(raw, partyId, partyType));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid, partyId, partyType]);

  const partyChecks = useMemo(() => checks, [checks]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Math.round((Number(form.amount) || 0) * 100) / 100;
    if (!(amount > 0)) {
      setError('أدخل مبلغ الشيك');
      return;
    }
    setBusyId('register');
    try {
      await gatewayRegisterCheck(
        uid,
        {
          checkNumber: form.checkNumber,
          bankName: form.bankName,
          amount,
          partyId,
          partyType,
          direction: form.direction,
          notes: form.notes,
          issueDateMs: form.issueDate ? new Date(form.issueDate).getTime() : Date.now(),
          dueDateMs: form.dueDate ? new Date(form.dueDate).getTime() : null,
        },
        { actor, idempotencyKey: newIdempotencyKey('chk') },
        businessProfile
      );
      setForm({ checkNumber: '', bankName: '', amount: '', direction: 'in', notes: '', issueDate: '', dueDate: '' });
      setShowRegister(false);
    } catch (err) {
      setError(err?.message || 'تعذّر تسجيل الشيك');
    } finally {
      setBusyId(null);
    }
  };

  const handleCollect = async (checkId) => {
    setError('');
    setBusyId(checkId);
    try {
      await gatewayCollectCheck(uid, checkId, { actor, shiftId: openShiftId || null }, businessProfile);
    } catch (err) {
      setError(err?.message || 'تعذّر تحصيل الشيك');
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async (checkId) => {
    const reason = window.prompt('سبب إرجاع الشيك (اختياري)') || '';
    setError('');
    setBusyId(`ret_${checkId}`);
    try {
      await gatewayReturnCheck(
        uid,
        checkId,
        { actor, reason, shiftId: openShiftId || null },
        businessProfile
      );
    } catch (err) {
      setError(err?.message || 'تعذّر إرجاع الشيك');
    } finally {
      setBusyId(null);
    }
  };

  if (!uid || !partyId) return null;

  const accent = theme?.accent || '#c4a574';

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <h4 className="text-sm font-bold text-primary flex items-center gap-2" style={{ fontFamily: FONT_HEADING }}>
          <Landmark size={16} />
          الشيكات
        </h4>
        <button
          type="button"
          onClick={() => setShowRegister((v) => !v)}
          className="text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
          style={{ fontFamily: FONT_UI }}
        >
          <Plus size={14} />
          تسجيل شيك
        </button>
      </div>

      {showRegister && (
        <form onSubmit={handleRegister} className="p-3 space-y-2 border-b border-gray-100 bg-white">
          <input
            type="text"
            placeholder="رقم الشيك"
            value={form.checkNumber}
            onChange={(e) => setForm((f) => ({ ...f, checkNumber: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="المبلغ (₪)"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
          />
          <select
            value={form.direction}
            onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
          >
            <option value="in">شيك وارد (لصالحنا)</option>
            <option value="out">شيك صادر (لصالح التاجر)</option>
          </select>
          <input
            type="text"
            placeholder="ملاحظات"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
          />
          <button
            type="submit"
            disabled={busyId === 'register'}
            className="w-full py-2 rounded-xl text-white text-sm disabled:opacity-50"
            style={{ backgroundColor: accent, fontFamily: FONT_UI }}
          >
            {busyId === 'register' ? 'جاري الحفظ...' : 'حفظ الشيك'}
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs text-red-600 px-3 py-2 bg-red-50 border-b border-red-100">{error}</p>
      )}

      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
        {loading && (
          <p className="text-xs text-gray-400 text-center py-6" style={{ fontFamily: FONT_UI }}>جاري التحميل...</p>
        )}
        {!loading && partyChecks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6" style={{ fontFamily: FONT_UI }}>لا توجد شيكات مسجّلة</p>
        )}
        {partyChecks.map((check) => {
          const pending = check.status === CHECK_PENDING;
          const collected = check.status === CHECK_COLLECTED;
          const returned = check.status === CHECK_RETURNED;
          const isBusy = busyId === check.id || busyId === `ret_${check.id}`;
          return (
            <div key={check.id} className="px-3 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50">
              <div className="min-w-0">
                <span className="font-semibold text-gray-900">
                  {check.checkNumber || '—'}
                </span>
                <span className="text-gray-400"> · {fmtMoney(check.amount)}</span>
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  {STATUS_LABEL[check.status] || check.status}
                  {check.direction === 'out' ? ' · صادر' : ' · وارد'}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                {pending && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCollect(check.id)}
                      className="px-2 py-1 rounded-lg text-white text-[10px] disabled:opacity-50"
                      style={{ backgroundColor: accent }}
                    >
                      تحصيل
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReturn(check.id)}
                      className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-[10px] disabled:opacity-50"
                    >
                      إرجاع
                    </button>
                  </>
                )}
                {collected && !returned && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReturn(check.id)}
                    className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-[10px] disabled:opacity-50"
                  >
                    إرجاع
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
