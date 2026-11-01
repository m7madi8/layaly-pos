import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { resetOperationalData } from '../services/resetOperationalData';

const CONFIRM_WORD = 'تهيئة';

function summarizeWiped(wiped) {
  if (!wiped || typeof wiped !== 'object') return '';
  const labels = {
    orders: 'طلبات',
    openBills: 'فواتير معلقة',
    customers: 'عملاء',
    suppliers: 'تجار',
    expenses: 'مصروفات',
    cashShifts: 'ورديات صندوق',
    cashMovements: 'حركات صندوق',
    vaultMovements: 'حركات خزنة',
    employeeBenefits: 'استفادات موظفين',
    staffBenefitDaily: 'عداد استفادة اليوم',
  };
  const parts = Object.entries(labels)
    .filter(([key]) => (wiped[key] || 0) > 0)
    .map(([key, label]) => `${label}: ${wiped[key]}`);
  return parts.length ? parts.join('\n') : '—';
}

export default function SystemResetModal({
  open,
  onClose,
  uid,
  apis,
  FONT_UI,
  FONT_HEADING,
  onDone,
}) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const canRun = confirmText.trim() === CONFIRM_WORD && !busy && uid;

  const handleClose = () => {
    if (busy) return;
    setConfirmText('');
    setError('');
    onClose();
  };

  const handleReset = async () => {
    if (!canRun) return;
    setBusy(true);
    setError('');
    try {
      const result = await resetOperationalData(uid, apis);
      setConfirmText('');
      onDone?.(result);
      onClose();
      alert(
        `تمت تهيئة النظام.\n\n` +
          `• الأصناف وصورها: لم تُمس\n` +
          `• أسماء الموظفين وحدود الاستفادة: ${result.staffMembersPreserved ?? '—'} موظف (لم تُمس)\n` +
          `• سجل الاستفادات وعداد اليوم: اُمسح\n` +
          `• الخزنة والصندوق: صُفّرت\n` +
          `• مكوّنات مخزونها صُفّر: ${result.ingredientsStockZeroed ?? 0}\n\n` +
          summarizeWiped(result.wiped)
      );
    } catch (e) {
      setError(e.message || 'تعذّرت التهيئة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-gray-200 shadow-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-red-50 text-red-600 shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
              تهيئة النظام بالكامل
            </h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed" style={{ fontFamily: FONT_UI }}>
              عملية لا يمكن التراجع عنها. تُمسح كل البيانات التشغيلية وتُصفَّر الخزنة والصندوق.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm space-y-2 mb-4" style={{ fontFamily: FONT_UI }}>
          <p className="font-semibold text-amber-950">سيُحذف أو يُصفَّر:</p>
          <ul className="text-amber-900 text-xs list-disc list-inside space-y-0.5">
            <li>المبيعات، الفواتير المعلقة، العملاء والتجار</li>
            <li>المصروفات، سجل الاستفادات واستخدام اليوم، المشتريات من السجل</li>
            <li>ورديات الصندوق وحركاته، الخزنة وحركاتها</li>
            <li>جلسات البلايستيشن، الأراجيل الخارجية، حركاتها</li>
          </ul>
          <p className="font-semibold text-green-900 pt-1">يُبقى كما هو:</p>
          <ul className="text-green-900 text-xs list-disc list-inside">
            <li>كل الأصناف (الأسعار، الصور، المخزون، الوصفات)</li>
            <li>أسماء موظفي الاستفادة وحد كل موظف (₪/يوم) في الإعدادات</li>
            <li>إعدادات المتجر</li>
          </ul>
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1.5" style={{ fontFamily: FONT_UI }}>
          للتأكيد اكتب «{CONFIRM_WORD}» ثم اضغط تنفيذ
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm mb-2"
          autoComplete="off"
          disabled={busy}
        />
        {error ? (
          <p className="text-sm text-red-600 mb-2" style={{ fontFamily: FONT_UI }}>
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="py-2.5 rounded-xl border border-gray-200 text-sm disabled:opacity-50"
            style={{ fontFamily: FONT_UI }}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!canRun}
            className="py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: '#b91c1c', fontFamily: FONT_UI }}
          >
            {busy ? 'جاري التهيئة…' : 'تنفيذ التهيئة'}
          </button>
        </div>
      </div>
    </div>
  );
}
