import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { TEST_DATA_NOTES_MARKER } from '../utils/testDataRemovalLogic';
import {
  previewRemoveTestSales,
  executeRemoveTestSales,
  resolveOrderNumbersToIds,
  addOrdersToTestRegistry,
  markOrdersTestData,
} from '../services/removeTestSalesService';

const FONT_UI = 'Cairo, sans-serif';
const FONT_HEADING = 'Tajawal, sans-serif';

export default function RemoveTestSalesModal({ open, onClose, uid, theme, fmtMoney, onDone }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [orderNumbersInput, setOrderNumbersInput] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const refreshPreview = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const data = await previewRemoveTestSales(uid);
      setPreview(data);
    } catch (e) {
      setError(e.message || 'تعذّر تحميل المعاينة');
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
      refreshPreview();
    }
  }, [open, refreshPreview]);

  const handleAddOrderNumbers = async () => {
    const parts = orderNumbersInput
      .split(/[,،\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setLoading(true);
    setError('');
    try {
      const ids = await resolveOrderNumbersToIds(uid, parts);
      if (!ids.length) {
        setError('لم يُعثر على أرقام طلبات مطابقة');
        return;
      }
      await markOrdersTestData(uid, ids);
      await addOrdersToTestRegistry(uid, ids);
      setOrderNumbersInput('');
      await refreshPreview();
    } catch (e) {
      setError(e.message || 'تعذّر إضافة الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview || !confirmChecked) return;
    setLoading(true);
    setError('');
    try {
      const runId = `run_${Date.now()}`;
      const res = await executeRemoveTestSales(uid, {
        orderIds: preview.eligibleOrderIds,
        sessionIds: preview.eligibleSessionIds,
        runId,
      });
      setResult(res);
      onDone?.(res);
      await refreshPreview();
    } catch (e) {
      setError(e.message || 'فشل التنفيذ');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const c = preview?.counts;
  const hasEligible = (preview?.eligibleOrderIds?.length || 0) + (preview?.eligibleSessionIds?.length || 0) > 0;
  const hasBlocking = (preview?.conflicts || []).some((x) => x.code === 'cash_on_closed_shift');

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[90]">
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-lg border border-gray-200 max-h-[92dvh] overflow-y-auto"
        dir="rtl"
      >
        <h3 className="text-xl mb-1 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
          إزالة المبيعات الوهمية
        </h3>
        <p className="text-xs text-gray-500 mb-4" style={{ fontFamily: FONT_UI }}>
          تُزال فقط الطلبات والجلسات المعلَّمة صراحةً (حقل <code className="text-[10px]">isTestData</code>، سجل
          المعتمد، أو ملاحظة تحتوي «{TEST_DATA_NOTES_MARKER}»). لا يُعاد المخزون تلقائياً.
        </p>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700">إضافة طلبات بالرقم للمراجعة</p>
          <div className="flex gap-2">
            <input
              value={orderNumbersInput}
              onChange={(e) => setOrderNumbersInput(e.target.value)}
              placeholder="مثال: 0001، 0002"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
              style={{ fontFamily: FONT_UI }}
            />
            <button
              type="button"
              disabled={loading}
              onClick={handleAddOrderNumbers}
              className="px-3 py-2 rounded-lg text-white text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: theme?.primary || '#5c4033', fontFamily: FONT_UI }}
            >
              اعتماد
            </button>
          </div>
        </div>

        {loading && !preview && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
            <Loader2 className="animate-spin" size={18} />
            جاري تحميل المعاينة…
          </div>
        )}

        {preview && (
          <div className="space-y-3 mb-4 text-sm" style={{ fontFamily: FONT_UI }}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="مبيعات منتجات" value={c?.productOrders ?? 0} />
              <Stat label="طلبات بلايستيشن" value={c?.playstationOrders ?? 0} />
              <Stat label="جلسات بلايستيشن منفصلة" value={c?.standalonePlaystationSessions ?? 0} />
              <Stat label="إجمالي المبيعات" value={fmtMoney ? fmtMoney(c?.salesTotal ?? 0) : c?.salesTotal} />
              <Stat label="سجلات دفع/فواتير" value={c?.paymentRecords ?? 0} />
              <Stat label="حركات صندوق" value={c?.cashMovements ?? 0} />
              <Stat label="ملفات عملاء تتأثر" value={c?.customerBalanceTouches ?? 0} colSpan />
            </div>

            {(preview.conflicts?.length || 0) > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  تعارضات أو تحذيرات ({preview.conflicts.length})
                </p>
                <ul className="text-[11px] text-amber-900 list-disc list-inside max-h-24 overflow-y-auto">
                  {preview.conflicts.map((x, i) => (
                    <li key={i}>{x.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {!hasEligible && (
              <p className="text-xs text-gray-600 rounded-xl bg-gray-50 p-3 border border-gray-100">
                لا توجد سجلات معتمدة للإزالة. علّم الطلبات الوهمية أو أضف أرقامها أعلاه ثم حدّث المعاينة.
              </p>
            )}

            {preview.sampleOrders?.length > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">عينة من الطلبات المستهدفة:</p>
                <ul className="space-y-0.5">
                  {preview.sampleOrders.map((o) => (
                    <li key={o.id}>
                      #{o.orderNumber} — {o.customer} — {fmtMoney ? fmtMoney(o.total) : o.total}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 mb-3 rounded-lg bg-red-50 p-2 border border-red-100">{error}</p>
        )}

        {result && (
          <div
            className={`text-xs mb-3 rounded-lg p-3 border ${result.ok ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
          >
            {result.ok ? 'اكتملت الإزالة.' : 'اكتملت مع أخطاء جزئية.'}
            <br />
            طلبات: {result.ordersRemoved} · جلسات: {result.sessionsRemoved}
            {(result.errors?.length || 0) > 0 && (
              <ul className="mt-1 list-disc list-inside">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.orderId || e.sessionId}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 text-xs text-gray-700 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            disabled={!hasEligible || hasBlocking}
          />
          <span>
            راجعت المعاينة وأؤكد إزالة السجلات المعتمدة فقط. أفهم أن المخزون الحالي لن يُعدَّل، وأن الطلبات على وردية
            مغلقة لن تُحذف.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
            style={{ fontFamily: FONT_UI }}
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={refreshPreview}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 disabled:opacity-50"
            style={{ fontFamily: FONT_UI }}
          >
            تحديث المعاينة
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={loading || !confirmChecked || !hasEligible || hasBlocking}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: theme?.primary || '#5c4033', fontFamily: FONT_UI }}
          >
            {loading ? 'جاري التنفيذ…' : 'تنفيذ الإزالة'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, colSpan }) {
  return (
    <div className={`rounded-lg bg-white border border-gray-100 p-2 ${colSpan ? 'col-span-2' : ''}`}>
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-base font-semibold text-primary">{value}</p>
    </div>
  );
}
