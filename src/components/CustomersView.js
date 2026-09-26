import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Phone, User, FileText, Search, X, Eye, Calendar, Clock, Printer, FileDown } from 'lucide-react';
import {
  printCustomerAccountStatement,
  downloadCustomerAccountStatementPdf,
} from '../utils/customerAccountStatement';
import { orderStatusLabel, paymentTypeLabel, paymentMethodLabel } from '../i18n';

export default function CustomersView({
  customers,
  orders,
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  onSaveCustomer,
  onDeleteCustomer,
  onExportCustomerFile,
  onClearAllCustomers,
  businessProfile,
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [selectedOrder, setSelectedOrder] = useState(null);

  const formatOrderDate = (order) => {
    if (!order?.timestamp) return '—';
    const d = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
    return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openOrderByNumber = (orderNumber) => {
    const found = customerOrders.find((o) => String(o.orderNumber) === String(orderNumber));
    if (found) setSelectedOrder(found);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    return customers
      .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.notes || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [customers, search]);

  const detailCustomer = customers.find((c) => c.id === detailId);
  const customerOrders = useMemo(() => {
    if (!detailId) return [];
    return orders
      .filter((o) => o.customerId === detailId || (o.customer && detailCustomer && o.customer === detailCustomer.name))
      .sort((a, b) => {
        const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return tb - ta;
      });
  }, [orders, detailId, detailCustomer]);

  const openNew = () => {
    setForm({ name: '', phone: '', address: '', notes: '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const statementOpts = () => ({
    customer: detailCustomer,
    orders: customerOrders,
    business: businessProfile,
    fmtMoney,
  });

  const handlePrintStatement = () => {
    if (!detailCustomer) return;
    printCustomerAccountStatement(statementOpts());
  };

  const handleDownloadStatementPdf = async () => {
    if (!detailCustomer || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadCustomerAccountStatementPdf(statementOpts());
    } catch (e) {
      alert(e.message || 'تعذّر إنشاء ملف PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await onSaveCustomer({ ...form, name: form.name.trim() }, editingId);
    setShowForm(false);
    setEditingId(null);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl md:text-3xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
          العملاء
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90"
            style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
          >
            <Plus size={16} />
            إضافة عميل
          </button>
          {customers.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearAllCustomers?.();
                setDetailId(null);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50"
              style={{ fontFamily: FONT_UI }}
            >
              <Trash2 size={16} />
              مسح كل العملاء
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الجوال..."
              className="w-full pe-10 ps-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              style={{ fontFamily: FONT_UI }}
            />
          </div>

          <div className="layali-card divide-y divide-[var(--color-border)] max-h-[70vh] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-gray-500" style={{ fontFamily: FONT_UI }}>
                لا يوجد عملاء — أضف عميلاً جديداً
              </p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setDetailId(c.id);
                  setSelectedOrder(null);
                }}
                className={`w-full text-start p-4 hover:bg-gray-50 transition-colors ${
                  detailId === c.id ? 'bg-accent-soft/40 border-s-4 border-accent' : ''
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-primary text-sm" style={{ fontFamily: FONT_UI }}>
                      {c.name}
                    </p>
                    {c.phone ? (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Phone size={12} /> {c.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-[10px] text-gray-400">رصيد الدين</p>
                    <p className={`text-sm font-bold ${Number(c.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtMoney(c.balance || 0)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {!detailCustomer ? (
            <div className="layali-card border-dashed p-12 text-center text-gray-500 text-sm" style={{ fontFamily: FONT_UI }}>
              <User size={40} className="mx-auto mb-3 opacity-30" />
              اختر عميلاً لعرض ملفه (الطلبات، الديون، الملاحظات)
            </div>
          ) : (
            <div className="layali-card overflow-hidden p-0">
              <div className="p-5 border-b border-gray-100 flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h3 className="text-xl text-primary font-bold" style={{ fontFamily: FONT_HEADING }}>
                    ملف العميل: {detailCustomer.name}
                  </h3>
                  {detailCustomer.phone && (
                    <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: FONT_UI }}>
                      {detailCustomer.phone}
                    </p>
                  )}
                  {detailCustomer.address && (
                    <p className="text-xs text-gray-500 mt-0.5">{detailCustomer.address}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadStatementPdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                  >
                    <FileDown size={14} />
                    {pdfLoading ? 'جاري التحميل…' : 'كشف حساب PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintStatement}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50"
                    style={{ fontFamily: FONT_UI }}
                  >
                    <Printer size={14} />
                    طباعة
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportCustomerFile(detailCustomer, customerOrders)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50"
                    style={{ fontFamily: FONT_UI }}
                  >
                    <Download size={14} />
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(detailCustomer)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600"
                    title="تعديل"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`حذف العميل «${detailCustomer.name}»؟`)) {
                        onDeleteCustomer(detailCustomer.id);
                        setDetailId(null);
                      }
                    }}
                    className="p-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-600"
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5 bg-gray-50/80 border-b border-gray-100">
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400">إجمالي الدين</p>
                  <p className="text-lg font-bold text-red-600">{fmtMoney(detailCustomer.balance || 0)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400">عدد الطلبات</p>
                  <p className="text-lg font-bold text-primary">{customerOrders.length}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-gray-400">آخر نشاط</p>
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {customerOrders[0]?.orderNumber ? `#${customerOrders[0].orderNumber}` : '—'}
                  </p>
                </div>
              </div>

              {detailCustomer.notes ? (
                <div className="px-5 py-3 border-b border-gray-100 text-sm text-gray-600" style={{ fontFamily: FONT_UI }}>
                  <span className="font-medium text-gray-800">ملاحظات: </span>
                  {detailCustomer.notes}
                </div>
              ) : null}

              <div className="p-5">
                <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: FONT_HEADING }}>
                  <FileText size={16} />
                  سجل الطلبات والديون
                </h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(detailCustomer.transactions || []).length === 0 && customerOrders.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">لا توجد حركات بعد</p>
                  )}
                  {(detailCustomer.transactions || [])
                    .slice()
                    .reverse()
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openOrderByNumber(t.orderNumber)}
                        className="w-full flex justify-between items-center text-xs p-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-accent/40 hover:bg-accent-soft/30 transition-colors text-start"
                        style={{ fontFamily: FONT_UI }}
                      >
                        <span>
                          طلب #{t.orderNumber || '—'} — {t.type === 'order_debt' ? 'دين' : t.type}
                          <span className="block text-[10px] text-gray-400 mt-0.5">اضغط لعرض تفاصيل الطلب</span>
                        </span>
                        <span className="font-bold text-red-600 shrink-0 ms-2">+{fmtMoney(t.amount)}</span>
                      </button>
                    ))}
                  {customerOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrder(o)}
                      className="w-full flex justify-between items-center gap-2 text-xs p-2.5 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-gray-50 transition-colors text-start"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-semibold text-primary">#{o.orderNumber}</span>
                        {' — '}
                        {paymentTypeLabel(o.paymentType) ||
                          (o.paymentType === 'debt' ? 'دين' : o.paymentType === 'mixed' ? 'كاش + دين' : 'كاش')}
                        <span className="block text-[10px] text-gray-400 mt-0.5 truncate">
                          {(o.items || []).length} أصناف · {formatOrderDate(o)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="font-semibold">{fmtMoney(o.total)}</span>
                        <Eye size={14} className="text-gray-400" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[55]">
          <div
            className="layali-card w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden p-0 shadow-layali-lg"
            role="dialog"
            aria-labelledby="customer-order-detail-title"
          >
            <div className="p-5 border-b border-[var(--color-border)] flex justify-between items-start gap-3">
              <div>
                <h3
                  id="customer-order-detail-title"
                  className="text-lg font-bold text-primary"
                  style={{ fontFamily: FONT_HEADING }}
                >
                  طلب #{selectedOrder.orderNumber || '—'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2" style={{ fontFamily: FONT_UI }}>
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {formatOrderDate(selectedOrder)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {orderStatusLabel(selectedOrder.status)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                aria-label="إغلاق"
              >
                <X size={22} />
              </button>
            </div>

            <div className="px-5 py-3 bg-gray-50/80 border-b border-[var(--color-border)] text-sm space-y-1" style={{ fontFamily: FONT_UI }}>
              <p>
                <span className="text-gray-500">الدفع: </span>
                <span className="font-medium">
                  {paymentTypeLabel(selectedOrder.paymentType) ||
                    paymentMethodLabel(selectedOrder.paymentMethod) ||
                    '—'}
                </span>
              </p>
              {Number(selectedOrder.cashPaid) > 0 && (
                <p>
                  <span className="text-gray-500">كاش: </span>
                  {fmtMoney(selectedOrder.cashPaid)}
                </p>
              )}
              {Number(selectedOrder.debtAmount) > 0 && (
                <p className="text-red-600">
                  <span className="text-gray-500">دين: </span>
                  {fmtMoney(selectedOrder.debtAmount)}
                </p>
              )}
              {selectedOrder.notes ? (
                <p>
                  <span className="text-gray-500">ملاحظات: </span>
                  {selectedOrder.notes}
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="text-xs font-bold text-gray-500 mb-3" style={{ fontFamily: FONT_UI }}>
                الأصناف
              </h4>
              {!selectedOrder.items?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">لا توجد أصناف مسجّلة في هذا الطلب</p>
              ) : (
                <ul className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <li
                      key={`${item.id}-${idx}`}
                      className="flex justify-between gap-3 p-3 rounded-xl bg-[var(--color-bg-warm)] border border-[var(--color-border)] text-sm"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-primary">{item.name}</p>
                        {item.selectedAddons?.length > 0 && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {item.selectedAddons.map((a) => a.name).join('، ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">الكمية: {item.quantity}</p>
                      </div>
                      <p className="font-semibold shrink-0">{fmtMoney((item.price || 0) * (item.quantity || 1))}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-5 border-t border-[var(--color-border)] bg-white">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600" style={{ fontFamily: FONT_UI }}>
                  الإجمالي
                </span>
                <span className="text-xl font-bold text-accent">{fmtMoney(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
                {editingId ? 'تعديل العميل' : 'عميل جديد'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">الاسم *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  placeholder="اسم العميل"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">الجوال</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  placeholder="05xxxxxxxx"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">العنوان</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none resize-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
              >
                {editingId ? 'حفظ التعديلات' : 'إضافة العميل'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
