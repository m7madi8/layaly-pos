import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { remainingReturnableQty } from '../utils/orderReturn';
import { roundMoney } from '../utils/employeeBenefitAccounting';
import {
  suggestedLineRefundAmount,
  REFUND_METHOD_CASH,
  REFUND_METHOD_DEBT,
  REFUND_METHOD_NONE,
} from '../utils/partialReturnRefund';

function lineProductId(item) {
  return item?.id || item?.productId || '';
}

export default function OrderPartialReturnModal({ open, order, fmtMoney, onClose, onSubmit }) {
  const lines = useMemo(() => {
    if (!order?.items) return [];
    return order.items
      .map((item, index) => ({
        item,
        index,
        productId: lineProductId(item),
        remaining: remainingReturnableQty(item),
      }))
      .filter((row) => row.productId && row.remaining > 0);
  }, [order]);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [refundCash, setRefundCash] = useState(true);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHOD_CASH);
  const [itemCondition, setItemCondition] = useState('resellable');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = lines.find((l) => l.productId === productId);

  useEffect(() => {
    if (!open) return;
    setError('');
    setReason('');
    setRestock(true);
    setRefundCash(true);
    setRefundMethod(REFUND_METHOD_CASH);
    setItemCondition('resellable');
    const first = lines[0];
    setProductId(first?.productId || '');
    setQuantity(first ? String(Math.min(1, first.remaining)) : '1');
    setRefundAmount('');
  }, [open, order?.id, lines]);

  useEffect(() => {
    if (!selected) return;
    const max = selected.remaining;
    const q = Number(quantity) || 0;
    if (q > max) setQuantity(String(max));
  }, [selected, quantity]);

  useEffect(() => {
    if (!selected || !open) return;
    const suggested = suggestedLineRefundAmount(selected.item, Number(quantity) || 0);
    if (suggested > 0 && !refundAmount) setRefundAmount(String(suggested));
  }, [selected, quantity, open, refundAmount]);

  if (!open || !order) return null;

  const parsedQty = Number(quantity) || 0;
  const parsedRefund = roundMoney(refundAmount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!productId) {
      setError('اختر صنفاً من الفاتورة');
      return;
    }
    if (!(parsedQty > 0)) {
      setError('أدخل كمية صحيحة');
      return;
    }
    if (selected && parsedQty > selected.remaining + 0.0001) {
      setError(`الحد الأقصى ${selected.remaining}`);
      return;
    }
    if (!reason.trim()) {
      setError('سبب الاسترجاع إلزامي');
      return;
    }
    if (!(parsedRefund >= 0)) {
      setError('مبلغ الاسترجاع غير صالح');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        orderId: order.id,
        productId,
        quantity: parsedQty,
        refundAmount: parsedRefund,
        reason: reason.trim(),
        restock: itemCondition !== 'damaged' && restock,
        refundCash: refundMethod === REFUND_METHOD_CASH && parsedRefund > 0,
        refundMethod,
        itemCondition,
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || 'تعذّر تنفيذ الاسترجاع');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[85]" dir="rtl">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-gray-200 shadow-xl max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg text-primary flex items-center gap-2" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              <RotateCcw size={20} />
              استرجاع جزئي
            </h3>
            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: FONT_UI }}>
              طلب #{order.orderNumber || order.id.slice(-8).toUpperCase()}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">لا توجد أصناف قابلة للاسترجاع في هذا الطلب</p>
          ) : (
            <>
              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">الصنف</label>
                <select
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    const row = lines.find((l) => l.productId === e.target.value);
                    if (row) setQuantity(String(Math.min(Number(quantity) || 1, row.remaining)));
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                >
                  {lines.map((row) => (
                    <option key={row.productId} value={row.productId}>
                      {row.item.name} — متبقي {row.remaining}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">الكمية المسترجعة</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  max={selected?.remaining || undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">مبلغ الاسترجاع (₪)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  placeholder="0"
                />
                {parsedRefund > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmtMoney(parsedRefund)}</p>
                )}
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">حالة الصنف</label>
                <select
                  value={itemCondition}
                  onChange={(e) => setItemCondition(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                >
                  <option value="resellable">قابل لإعادة البيع</option>
                  <option value="damaged">تالف — بدون إرجاع مخزون</option>
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">طريقة رد المبلغ</label>
                <select
                  value={refundMethod}
                  onChange={(e) => {
                    setRefundMethod(e.target.value);
                    setRefundCash(e.target.value === REFUND_METHOD_CASH);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                >
                  <option value={REFUND_METHOD_NONE}>بدون رد مالي</option>
                  <option value={REFUND_METHOD_CASH}>نقداً من الصندوق</option>
                  <option value={REFUND_METHOD_DEBT}>خصم من دين العميل</option>
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium text-gray-600">السبب *</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  placeholder="إلزامي"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="rounded" />
                إرجاع الكمية للمخزون
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundCash}
                  onChange={(e) => setRefundCash(e.target.checked)}
                  disabled={!(parsedRefund > 0)}
                  className="rounded"
                />
                استرداد نقدي من الصندوق (وردية مفتوحة)
              </label>
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
              style={{ fontFamily: FONT_UI }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={busy || lines.length === 0}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
              style={{ fontFamily: FONT_UI, backgroundColor: 'var(--color-primary, #5c4033)' }}
            >
              {busy ? 'جاري الحفظ...' : 'تأكيد الاسترجاع'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
