import React, { useCallback, useEffect, useState } from 'react';
import { Gamepad2, Loader2 } from 'lucide-react';
import {
  loadPlaystationCleanupPreview,
  markPlaystationSessionsTestData,
  runPlaystationCleanup,
} from '../services/playstationCleanupService';

const FONT_UI = 'Cairo, sans-serif';
const FONT_HEADING = 'Tajawal, sans-serif';

function formatSessionWhen(row) {
  const ms = row.endedAtMs || row.startedAtMs;
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RemoveOldPlaystationModal({ open, onClose, uid, fmtMoney }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const data = await loadPlaystationCleanupPreview(uid);
      setPreview(data);
      setSelected(new Set(data.recommendedIds));
    } catch (e) {
      setError(e.message || 'تعذّر تحميل الجلسات');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (open) {
      setConfirmChecked(false);
      setResult(null);
      setError('');
      refresh();
    }
  }, [open, refresh]);

  const toggle = (id, eligible) => {
    if (!eligible) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEligible = () => {
    if (!preview) return;
    setSelected(new Set(preview.eligibleIds));
  };

  const handleMarkTest = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setLoading(true);
    try {
      await markPlaystationSessionsTestData(uid, ids);
      await refresh();
    } catch (e) {
      setError(e.message || 'تعذّر التعليم');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmChecked || selected.size === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await runPlaystationCleanup(uid, [...selected]);
      setResult(res);
      await refresh();
    } catch (e) {
      setError(e.message || 'فشل الحذف');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const blockMsg = preview?.blockMessages || {};

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[90]">
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-lg border-2 border-yellow-400 max-h-[92dvh] overflow-y-auto"
        dir="rtl"
      >
        <div className="flex items-center gap-2 mb-1">
          <Gamepad2 className="text-yellow-600" size={22} />
          <h3 className="text-xl text-yellow-950" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
            ساعات البلايستيشن القديمة
          </h3>
        </div>
        <p className="text-xs text-gray-600 mb-4" style={{ fontFamily: FONT_UI }}>
          تنظيف جلسات منتهية أو ملغاة. لا تُحذف جلسات نشطة أو المفوترة ومرتبطة بطلب محفوظ إلا بعد تعليمها وهمية أو إزالة
          الطلب.
        </p>

        {loading && !preview && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
            <Loader2 className="animate-spin" size={18} />
            جاري التحميل…
          </div>
        )}

        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3 text-sm" style={{ fontFamily: FONT_UI }}>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-2">
                <p className="text-[10px] text-yellow-800">قابلة للحذف</p>
                <p className="font-bold text-yellow-950">{preview.counts.eligible}</p>
              </div>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-2">
                <p className="text-[10px] text-yellow-800">محددة / موصى بها</p>
                <p className="font-bold text-yellow-950">
                  {selected.size} / {preview.counts.recommended}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                disabled={loading}
                onClick={selectAllEligible}
                className="text-xs font-medium text-yellow-900 underline"
              >
                تحديد كل القابلة للحذف
              </button>
              <button
                type="button"
                disabled={loading || selected.size === 0}
                onClick={handleMarkTest}
                className="text-xs font-medium text-yellow-900 underline"
              >
                تعليم المحددة كوهمية
              </button>
            </div>

            <ul className="space-y-1.5 max-h-52 overflow-y-auto mb-3 border border-yellow-100 rounded-xl p-2 bg-yellow-50/40">
              {preview.rows.length === 0 && (
                <li className="text-xs text-center text-gray-500 py-4">لا توجد جلسات منتهية</li>
              )}
              {preview.rows.map((row) => (
                <li
                  key={row.id}
                  className={`flex items-start gap-2 text-xs p-2 rounded-lg border ${
                    row.eligible ? 'bg-white border-yellow-100' : 'bg-gray-50 border-gray-100 opacity-70'
                  }`}
                  style={{ fontFamily: FONT_UI }}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(row.id)}
                    disabled={!row.eligible}
                    onChange={() => toggle(row.id, row.eligible)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-primary truncate">
                      {row.stationName} · {row.productName}
                      {row.isTestData ? ' · وهمية' : ''}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {formatSessionWhen(row)} — {row.status === 'cancelled' ? 'ملغاة' : row.billed ? 'مفوترة' : 'غير مفوترة'}
                      {row.price > 0 ? ` · ${fmtMoney ? fmtMoney(row.price) : row.price}` : ''}
                    </p>
                    {row.blockReason && (
                      <p className="text-[10px] text-amber-800 mt-0.5">{blockMsg[row.blockReason] || row.blockReason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="text-xs text-red-600 mb-2 rounded-lg bg-red-50 p-2">{error}</p>}

        {result && (
          <p
            className={`text-xs mb-2 rounded-lg p-2 border ${
              result.ok ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200'
            }`}
          >
            حُذفت {result.deleted} جلسة.
            {(result.skipped?.length || 0) > 0 && ` تخطّي: ${result.skipped.length}.`}
            {(result.errors?.length || 0) > 0 && ` أخطاء: ${result.errors.length}.`}
          </p>
        )}

        <label className="flex items-start gap-2 text-xs text-gray-700 mb-4">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            disabled={selected.size === 0}
          />
          <span>أؤكد حذف الجلسات المحددة من السجل (لا يؤثر على المخزون أو ديون العملاء).</span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-600">
            إغلاق
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm border border-yellow-300 text-yellow-900 disabled:opacity-50"
          >
            تحديث
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || !confirmChecked || selected.size === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-yellow-950 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-40 border border-yellow-500"
          >
            حذف المحدد
          </button>
        </div>
      </div>
    </div>
  );
}
