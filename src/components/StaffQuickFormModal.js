import React, { useEffect, useState } from 'react';
import { FONT_HEADING, FONT_UI } from '../branding';

const emptyForm = { name: '', benefitLimitILS: '20', phone: '', notes: '' };

export default function StaffQuickFormModal({
  mode = 'create',
  initial,
  busy,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'edit' && initial) {
      setForm({
        name: initial.name || '',
        benefitLimitILS: String(initial.benefitLimitILS ?? '20'),
        phone: initial.phone || '',
        notes: initial.notes || '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [mode, initial]);

  const submit = async () => {
    setError('');
    try {
      await onSave(form);
      onClose?.();
    } catch (e) {
      setError(e.message || 'تعذّر الحفظ');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm border border-gray-200 shadow-xl">
        <h3 className="text-lg font-bold text-primary mb-3" style={{ fontFamily: FONT_HEADING }}>
          {mode === 'edit' ? 'تعديل موظف' : 'موظف جديد'}
        </h3>
        <input
          className="w-full mb-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="الاسم *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
        />
        <input
          className="w-full mb-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
          placeholder="حد الاستفادة ₪/يوم"
          type="number"
          min="0"
          step="0.01"
          value={form.benefitLimitILS}
          onChange={(e) => setForm((f) => ({ ...f, benefitLimitILS: e.target.value }))}
        />
        <input
          className="w-full mb-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
          placeholder="الجوال (اختياري)"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <textarea
          className="w-full mb-3 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
          placeholder="ملاحظات"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        {error && (
          <p className="text-xs text-red-600 mb-2" style={{ fontFamily: FONT_UI }}>
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
            style={{ fontFamily: FONT_UI }}
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={submit}
            className="py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary, #5c4033)', fontFamily: FONT_UI }}
          >
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
