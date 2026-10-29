import React, { useState } from 'react';
import { X } from 'lucide-react';
import { FONT_UI, FONT_HEADING, theme } from '../branding';

/**
 * إدخال سعر بيع يدوي لصنف «خدمات» — بدون تكلفة.
 */
export default function ServicePriceModal({ product, fmtMoney, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [serviceNote, setServiceNote] = useState('');

  const total = parseFloat(amount);
  let error = '';
  if (amount !== '' && !(total > 0)) error = 'أدخل مبلغاً أكبر من صفر';
  const canSubmit = total > 0 && !error;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({ amount: total, serviceNote: serviceNote.trim() });
  };

  const inputClass =
    'w-full px-3 py-3 rounded-xl border border-gray-200 outline-none text-lg font-semibold focus:border-accent';

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]"
      dir="rtl"
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm border border-gray-200"
        style={{ fontFamily: FONT_UI }}
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-lg text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
            {product?.name || 'خدمات'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">سعر البيع لهذا الطلب فقط — بدون تكلفة مخزون</p>

        <label className="block mb-3">
          <span className="block text-xs mb-1 text-gray-600">المبلغ (₪) *</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            dir="ltr"
            placeholder="0"
          />
        </label>

        <label className="block mb-4">
          <span className="block text-xs mb-1 text-gray-600">وصف الخدمة (اختياري)</span>
          <input
            type="text"
            value={serviceNote}
            onChange={(e) => setServiceNote(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
            placeholder="مثال: توصيل، خدمة خاصة…"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: theme.primary }}
          >
            إضافة {canSubmit ? fmtMoney(total) : ''}
          </button>
        </div>
      </form>
    </div>
  );
}
