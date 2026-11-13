import React from 'react';
import { PURCHASE_PAYMENT_METHODS, PURCHASE_PAYMENT_CASH, PURCHASE_PAYMENT_VAULT } from '../utils/purchasePayment';
import ExpensePaymentSourceFields from './ExpensePaymentSourceFields';
import { legacyMethodToPaymentSource } from '../utils/expensePaymentSource';

export default function PurchasePaymentFields({
  expenseForm,
  setExpenseForm,
  openShift,
  vaultBalance,
  disabled,
}) {
  const method = expenseForm.paymentMethod || 'Debt';
  return (
    <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
      <p className="text-xs font-semibold text-amber-900">طريقة دفع المشتريات</p>
      <div>
        <select
          value={method}
          onChange={(e) => {
            const nextMethod = e.target.value;
            const paymentSource = legacyMethodToPaymentSource(nextMethod) || '';
            setExpenseForm({ ...expenseForm, paymentMethod: nextMethod, paymentSource });
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
          disabled={disabled}
        >
          {PURCHASE_PAYMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      {method === 'Cash' && (
        <p className="text-[11px] text-gray-600">
          {openShift
            ? 'سيُسجَّل سحب من وردية الصندوق المفتوحة.'
            : 'لا توجد وردية صندوق مفتوحة — يمكن الحفظ لكن لن يُخصم من الصندوق حتى تفتح وردية.'}
        </p>
      )}
      {method === 'Vault' && (
        <p className="text-[11px] text-gray-600">
          رصيد الخزنة الحالي: <span className="font-semibold">{Number(vaultBalance) || 0} ₪</span>
        </p>
      )}
      {method === 'Debt' && (
        <p className="text-[11px] text-gray-600">يُضاف المبلغ إلى رصيد المستحق على التاجر المختار.</p>
      )}
      {(method === PURCHASE_PAYMENT_CASH || method === PURCHASE_PAYMENT_VAULT) && (
        <ExpensePaymentSourceFields
          expenseForm={expenseForm}
          setExpenseForm={setExpenseForm}
          openShift={openShift}
          vaultBalance={vaultBalance}
          disabled={disabled}
        />
      )}
      <div>
        <label className="block text-xs mb-1 font-medium text-gray-600">ملاحظات الدفع</label>
        <input
          type="text"
          value={expenseForm.notes || ''}
          onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
          placeholder="اختياري"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
