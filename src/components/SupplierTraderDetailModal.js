import React, { useEffect, useMemo, useState } from 'react';
import { X, Wallet, FileText } from 'lucide-react';
import { fmtMoney, supplierPaymentMethodLabel } from '../i18n';
import { FONT_HEADING, FONT_UI } from '../branding';
import {
  nextBalanceAfterPayment,
  resolveSupplierOutstandingBalance,
  supplierLedgerEntries,
  SUPPLIER_PAYMENT_METHODS,
  validateSupplierPaymentInput,
} from '../utils/supplierAccounting';
import { newIdempotencyKey } from '../utils/idempotencyKey';
import SupplierSearchSelect from './SupplierSearchSelect';

function formatLedgerDate(entry) {
  if (!entry?.date) return '—';
  const d = entry.date.toDate ? entry.date.toDate() : new Date(entry.date);
  return d.toLocaleDateString('ar');
}

export default function SupplierTraderDetailModal({
  supplier,
  suppliers,
  expenses,
  theme,
  onClose,
  onReconcile,
  onSubmitPayment,
  uploadProgress,
}) {
  const [showPayForm, setShowPayForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (supplier?.id && onReconcile) onReconcile(supplier.id);
  }, [supplier?.id, onReconcile]);

  const outstanding = useMemo(
    () => resolveSupplierOutstandingBalance(supplier, expenses, supplier?.id),
    [supplier, expenses]
  );

  const ledger = useMemo(
    () => supplierLedgerEntries(expenses, supplier?.id),
    [expenses, supplier?.id]
  );

  if (!supplier) return null;

  const parsedAmount = Math.round((Number(amount) || 0) * 100) / 100;
  const afterBalance = nextBalanceAfterPayment(outstanding, parsedAmount);

  const handleConfirm = async () => {
    const validation = validateSupplierPaymentInput({
      amount: parsedAmount,
      supplierId: supplier.id,
      suppliers,
    });
    if (!validation.ok) {
      alert(validation.errors.join(' — '));
      return;
    }
    const idem = newIdempotencyKey('sup_pay');
    const result = await onSubmitPayment({
      supplierId: supplier.id,
      amount: parsedAmount,
      date,
      paymentMethod,
      notes,
      idempotencyKey: idem,
    });
    if (result) {
      setShowPayForm(false);
      setConfirmOpen(false);
      setAmount('');
      setNotes('');
      alert(`تم تسجيل الدفعة بنجاح.\nرقم السند: ${result.paymentRef}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl border border-gray-200 max-h-[92dvh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h3 className="text-xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              {supplier.name}
            </h3>
            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: FONT_UI }}>
              {supplier.phone || supplier.contactPerson || 'ملف التاجر'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-red-50/50 p-4">
              <p className="text-[10px] text-gray-500 mb-1">الرصيد المستحق للتاجر</p>
              <p className="text-2xl font-bold text-red-600" style={{ fontFamily: FONT_UI }}>
                {fmtMoney(outstanding)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex flex-col justify-center">
              <button
                type="button"
                onClick={() => setShowPayForm((v) => !v)}
                className="w-full py-2.5 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2"
                style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
              >
                <Wallet size={16} />
                دفع للتاجر
              </button>
            </div>
          </div>

          {showPayForm && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50/80">
              <p className="text-sm font-semibold text-primary" style={{ fontFamily: FONT_UI }}>دفع للتاجر</p>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">اسم التاجر</label>
                <p className="text-sm font-medium text-gray-900 px-3 py-2 bg-white rounded-xl border border-gray-200">
                  {supplier.name}
                </p>
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">مبلغ الدفعة (₪) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                >
                  {SUPPLIER_PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">تاريخ الدفع</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">ملاحظات</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  placeholder="اختياري"
                />
              </div>
              {!confirmOpen ? (
                <button
                  type="button"
                  disabled={uploadProgress || !(parsedAmount > 0)}
                  onClick={() => setConfirmOpen(true)}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: theme.primary }}
                >
                  مراجعة الدفعة
                </button>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
                  <p>مبلغ الدفعة: <strong>{fmtMoney(parsedAmount)}</strong></p>
                  <p>الرصيد بعد الدفع: <strong>{fmtMoney(afterBalance)}</strong></p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="flex-1 py-2 rounded-xl bg-white border border-gray-200 text-sm"
                    >
                      رجوع
                    </button>
                    <button
                      type="button"
                      disabled={uploadProgress}
                      onClick={handleConfirm}
                      className="flex-1 py-2 rounded-xl text-white text-sm disabled:opacity-50"
                      style={{ backgroundColor: theme.accent }}
                    >
                      {uploadProgress ? 'جاري الحفظ...' : 'تأكيد الدفع'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: FONT_HEADING }}>
              <FileText size={16} />
              سجل المشتريات والدفعات
            </h4>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {ledger.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">لا توجد حركات مالية بعد</p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {ledger.map((row) => (
                    <div key={row.id} className="px-3 py-2.5 text-xs flex justify-between gap-2 hover:bg-gray-50">
                      <div className="min-w-0">
                        <span className={`font-semibold ${row.kind === 'payment' ? 'text-green-700' : 'text-orange-700'}`}>
                          {row.kind === 'payment' ? 'دفعة' : 'مشتريات'}
                        </span>
                        <span className="text-gray-400"> · {formatLedgerDate(row)}</span>
                        {row.kind === 'payment' && row.paymentRef && (
                          <span className="block text-[10px] text-gray-500 mt-0.5">سند: {row.paymentRef}</span>
                        )}
                        {row.notes && (
                          <span className="block text-[10px] text-gray-500 truncate">{row.notes}</span>
                        )}
                        {row.recordedBy?.role && (
                          <span className="block text-[10px] text-gray-400">بواسطة: {row.recordedBy.role === 'admin' ? 'مدير' : 'موظف'}</span>
                        )}
                      </div>
                      <div className="text-left shrink-0">
                        <span className="font-bold text-gray-900">{fmtMoney(row.amount)}</span>
                        {row.kind === 'payment' && row.paymentMethod && (
                          <span className="block text-[10px] text-gray-500">{supplierPaymentMethodLabel(row.paymentMethod)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Standalone payment fields for expense modal (supplier picker). */
export function SupplierPaymentFields({
  expenseForm,
  setExpenseForm,
  suppliers,
  expenses,
  disabled,
}) {
  return (
    <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <p className="text-xs font-semibold text-emerald-800">صرف للتاجر</p>
      <div>
        <label className="block text-xs mb-1 font-medium text-gray-600">اختيار التاجر *</label>
        <SupplierSearchSelect
          suppliers={suppliers}
          expenses={expenses}
          value={expenseForm.supplierId}
          onChange={(id) => setExpenseForm({ ...expenseForm, supplierId: id })}
          disabled={disabled}
          showBalance
        />
      </div>
      <div>
        <label className="block text-xs mb-1 font-medium text-gray-600">طريقة الدفع</label>
        <select
          value={expenseForm.paymentMethod || 'Cash'}
          onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
          disabled={disabled}
        >
          {SUPPLIER_PAYMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1 font-medium text-gray-600">ملاحظات</label>
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
