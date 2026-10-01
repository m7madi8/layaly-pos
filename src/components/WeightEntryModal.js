import React, { useState } from 'react';
import { X } from 'lucide-react';
import { FONT_UI, FONT_HEADING, theme } from '../branding';
import { amountFromWeight, weightFromAmount, weightPricePerUnit, productPriceLabel } from '../utils/productPricing';

/**
 * إدخال الوزن أو المبلغ لصنف بالوزن — كل حقل يحسب الآخر مباشرة.
 * يُعيد { weightGrams, amount } عبر onConfirm.
 */
export default function WeightEntryModal({ product, fmtMoney, onConfirm, onClose }) {
  const [weight, setWeight] = useState('');
  const [amount, setAmount] = useState('');
  const perUnit = weightPricePerUnit(product);
  const stock = Number(product.stock);

  const onWeightChange = (value) => {
    setWeight(value);
    const g = Number(value);
    setAmount(g > 0 ? String(amountFromWeight(product, g)) : '');
  };

  const onAmountChange = (value) => {
    setAmount(value);
    const a = Number(value);
    setWeight(a > 0 ? String(weightFromAmount(product, a)) : '');
  };

  const grams = Number(weight);
  const total = Number(amount);
  let error = '';
  if (weight !== '' && !(grams > 0)) error = 'الوزن يجب أن يكون أكبر من صفر';
  else if (amount !== '' && !(total > 0)) error = 'المبلغ يجب أن يكون أكبر من صفر';
  else if (grams > 0 && Number.isFinite(stock) && stock <= 0) error = 'المخزون فارغ — حدّث الكمية بالغرام من صفحة المخزون';
  else if (grams > 0 && Number.isFinite(stock) && grams > stock) error = `الكمية المتوفرة ${stock} غ فقط`;
  const canSubmit = grams > 0 && total > 0 && !error && perUnit > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({ weightGrams: grams, amount: total });
  };

  const inputClass = 'w-full px-3 py-3 rounded-xl border border-gray-200 outline-none text-lg font-semibold focus:border-accent';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]" dir="rtl">
      <form
        onSubmit={submit}
        className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm border border-gray-200"
        style={{ fontFamily: FONT_UI }}
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-lg text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>{product.name}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {productPriceLabel(product, fmtMoney)} · {fmtMoney(perUnit)} للغرام
          {Number.isFinite(stock) ? ` · المتوفر ${stock} غ` : ''}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="block text-xs mb-1 text-gray-600">الوزن (غرام)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              value={weight}
              onChange={(e) => onWeightChange(e.target.value)}
              className={inputClass}
              dir="ltr"
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="block text-xs mb-1 text-gray-600">المبلغ (₪)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className={inputClass}
              dir="ltr"
              placeholder="0"
            />
          </label>
        </div>

        <p className={`text-xs mb-3 min-h-[1rem] ${error ? 'text-red-600' : 'text-gray-500'}`} role={error ? 'alert' : undefined}>
          {error || (canSubmit ? `${grams} غ = ${fmtMoney(total)}` : 'أدخل الوزن أو المبلغ')}
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: theme.primary }}
        >
          إضافة للطلب
        </button>
      </form>
    </div>
  );
}
