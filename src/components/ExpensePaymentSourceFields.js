import React from 'react';
import { fmtMoney } from '../i18n';
import {
  EXPENSE_PAYMENT_SOURCES,
  PAYMENT_SOURCE_DRAWER,
  PAYMENT_SOURCE_VAULT,
  paymentSourceToLegacyMethod,
} from '../utils/expensePaymentSource';

export default function ExpensePaymentSourceFields({
  expenseForm,
  setExpenseForm,
  openShift,
  vaultBalance,
  disabled,
  required = true,
}) {
  const source = expenseForm.paymentSource || '';

  const selectSource = (id) => {
    setExpenseForm({
      ...expenseForm,
      paymentSource: id,
      paymentMethod: paymentSourceToLegacyMethod(id),
    });
  };

  return (
    <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/40 p-3">
      <p className="text-xs font-semibold text-sky-900">
        مصدر الصرف {required ? '*' : ''}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {EXPENSE_PAYMENT_SOURCES.map((opt) => {
          const selected = source === opt.id;
          const drawerDisabled =
            opt.id === PAYMENT_SOURCE_DRAWER && !openShift;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || drawerDisabled}
              onClick={() => selectSource(opt.id)}
              className={`text-right p-3 rounded-xl border text-sm transition-colors ${
                selected
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-primary/40'
              } ${drawerDisabled && !selected ? 'opacity-50' : ''}`}
            >
              <span className="font-bold block">{opt.label}</span>
              <span className={`text-[11px] block mt-0.5 ${selected ? 'text-white/90' : 'text-gray-500'}`}>
                {opt.sublabel}
              </span>
              {opt.id === PAYMENT_SOURCE_DRAWER && (
                <span className={`text-[11px] block mt-1 tabular-nums ${selected ? 'text-white' : 'text-gray-600'}`}>
                  {openShift
                    ? 'وردية مفتوحة — يُخصم من الصندوق'
                    : 'لا توجد وردية — افتح الصندوق أو اختر الخزنة'}
                </span>
              )}
              {opt.id === PAYMENT_SOURCE_VAULT && (
                <span className={`text-[11px] block mt-1 tabular-nums ${selected ? 'text-white' : 'text-emerald-700'}`}>
                  المتاح: {fmtMoney(vaultBalance)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!source && required && (
        <p className="text-[11px] text-amber-800">يلزم اختيار مصدر الصرف قبل الحفظ.</p>
      )}
    </div>
  );
}
