import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Phone, User, FileText, Search, X, Eye, Calendar, Clock, Printer, FileDown, Percent, Wallet, MessageCircle } from 'lucide-react';
import { orderDiscountValue, discountedOrders } from '../utils/customerStatementData';
import {
  printCustomerAccountStatement,
  downloadCustomerAccountStatementPdf,
  resolveCustomerStatementOrders,
  computeStatementTotals,
  computeLegacyDebtTotal,
  customerTransactionTypeLabel,
} from '../utils/customerAccountStatement';
import { orderStatusLabel, paymentTypeLabel, paymentMethodLabel } from '../i18n';
import { SYSTEM_WHATSAPP_DISPLAY } from '../branding';
import { buildCustomerStatementWhatsAppText, buildCustomerStatementWhatsAppUrl } from '../utils/whatsappStatement';

export default function CustomersView({
  customers,
  orders,
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
  onSaveCustomer,
  onAddLegacyDebt,
  onAddCustomerPayment,
  onDeleteCustomer,
  onExportCustomerFile,
  onEditOrder,
  onUpdateCustomerTransactions,
  businessProfile,
  onExportCustomersLedgerPdf,
  customersLedgerPdfLoading,
  allowOpeningDebt = true,
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
    openingDebt: '',
    openingDebtNote: '',
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [legacyForm, setLegacyForm] = useState({ amount: '', note: '' });
  const [legacySaving, setLegacySaving] = useState(false);
  const [paymentModalCustomerId, setPaymentModalCustomerId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', note: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [txForm, setTxForm] = useState({
    amount: '',
    orderNumber: '',
    description: '',
    date: '',
    cashPaid: '',
    total: '',
  });
  const [txSaving, setTxSaving] = useState(false);

  const paymentModalCustomer = customers.find((c) => c.id === paymentModalCustomerId);

  const openPaymentModal = (customerId) => {
    if (!onAddCustomerPayment) return;
    setPaymentForm({ amount: '', note: '' });
    setPaymentModalCustomerId(customerId);
    setDetailId(customerId);
    setSelectedOrder(null);
  };

  const formatOrderDate = (order) => {
    if (!order?.timestamp) return '—';
    const d = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
    return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openOrderByNumber = (orderNumber) => {
    const found = customerOrders.find((o) => String(o.orderNumber) === String(orderNumber));
    if (found) setSelectedOrder(found);
  };

  const openEditTransaction = (t) => {
    if (!t || !onUpdateCustomerTransactions) return;
    setEditingTransaction(t);
    let dateLocal = '';
    if (t.date) {
      try {
        const d = new Date(t.date);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          dateLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch {
        dateLocal = '';
      }
    }
    setTxForm({
      amount: t.amount ?? '',
      orderNumber: t.orderNumber ?? '',
      description: t.description ?? '',
      date: dateLocal,
      cashPaid: t.cashPaid ?? '',
      total: t.total ?? '',
    });
  };

  const closeTxEditor = () => {
    setEditingTransaction(null);
    setTxForm({ amount: '', orderNumber: '', description: '', date: '', cashPaid: '', total: '' });
  };

  const saveEditedTransaction = async () => {
    if (!detailCustomer || !editingTransaction || !onUpdateCustomerTransactions) return;
    const amount = Math.round((Number(txForm.amount) || 0) * 100) / 100;
    if (!(amount > 0)) {
      alert('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setTxSaving(true);
    try {
      const updated = {
        ...editingTransaction,
        amount,
        description: String(txForm.description || '').trim(),
      };
      if (txForm.date) {
        updated.date = new Date(txForm.date).toISOString();
      }
      if (editingTransaction.type === 'order_debt') {
        updated.orderNumber = String(txForm.orderNumber || '').trim() || editingTransaction.orderNumber;
        const cashPaid = Math.round((Number(txForm.cashPaid) || 0) * 100) / 100;
        const total = Math.round((Number(txForm.total) || amount + cashPaid) * 100) / 100;
        updated.cashPaid = cashPaid;
        updated.total = total;
      }
      const transactions = (detailCustomer.transactions || []).map((t) =>
        t.id === editingTransaction.id ? updated : t
      );
      await onUpdateCustomerTransactions(detailCustomer.id, transactions);
      closeTxEditor();
    } catch {
      /* alert in parent */
    } finally {
      setTxSaving(false);
    }
  };

  const deleteTransaction = async (t) => {
    if (!detailCustomer || !onUpdateCustomerTransactions || !t?.id) return;
    if (!window.confirm('حذف هذه الحركة من سجل العميل؟ سيتم تحديث الرصيد تلقائياً.')) return;
    setTxSaving(true);
    try {
      const transactions = (detailCustomer.transactions || []).filter((x) => x.id !== t.id);
      await onUpdateCustomerTransactions(detailCustomer.id, transactions);
      if (editingTransaction?.id === t.id) closeTxEditor();
    } finally {
      setTxSaving(false);
    }
  };

  const editSelectedOrder = () => {
    if (!selectedOrder) return;
    if (selectedOrder._syntheticFromTransaction) {
      const tx = (detailCustomer?.transactions || []).find(
        (t) => t.type === 'order_debt' && String(t.orderNumber) === String(selectedOrder.orderNumber)
      );
      if (tx) openEditTransaction(tx);
      else alert('لا يوجد سجل دين مرتبط لتعديله');
      return;
    }
    if (onEditOrder) {
      setSelectedOrder(null);
      onEditOrder(selectedOrder);
    }
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
    if (!detailId || !detailCustomer) return [];
    return resolveCustomerStatementOrders(detailCustomer, orders);
  }, [orders, detailId, detailCustomer]);

  const statementTotals = useMemo(() => computeStatementTotals(customerOrders), [customerOrders]);
  const customerDiscountOrders = useMemo(() => discountedOrders(customerOrders), [customerOrders]);
  const legacyDebtTotal = useMemo(
    () => (detailCustomer ? computeLegacyDebtTotal(detailCustomer) : 0),
    [detailCustomer]
  );

  const formatLegacyDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  };

  const openNew = () => {
    setForm({
      name: '',
      phone: '',
      address: '',
      notes: '',
      openingDebt: '',
      openingDebtNote: '',
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c) => {
    if (!onSaveCustomer) return;
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
      openingDebt: '',
      openingDebtNote: '',
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

  const handleSendStatementWhatsApp = () => {
    if (!detailCustomer) return;
    const phone = String(detailCustomer.phone || '').trim();
    if (!phone) {
      alert('أضف رقم جوال العميل أولاً حتى يُرسل الكشف على واتسابه.');
      return;
    }
    const text = buildCustomerStatementWhatsAppText({
      customer: detailCustomer,
      orders: customerOrders,
      business: businessProfile,
      fmtMoney,
      totals: statementTotals,
      legacyDebtTotal,
    });
    const url = buildCustomerStatementWhatsAppUrl(phone, text);
    if (!url) {
      alert('رقم جوال العميل غير صالح. اكتبه مثل 059xxxxxxx');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitCustomerPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalCustomer || paymentSaving || !onAddCustomerPayment) return;
    const amt = Number(paymentForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    setPaymentSaving(true);
    try {
      await onAddCustomerPayment(paymentModalCustomer.id, amt, paymentForm.note);
      setPaymentModalCustomerId(null);
      setPaymentForm({ amount: '', note: '' });
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleSubmitLegacyDebt = async (e) => {
    e.preventDefault();
    if (!detailCustomer || legacySaving) return;
    const amt = Number(legacyForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    if (
      !window.confirm(
        `إضافة دين قديم بقيمة ${fmtMoney(amt)} للعميل «${detailCustomer.name}»؟\nسيُزاد رصيد الدين على الحساب.`
      )
    ) {
      return;
    }
    setLegacySaving(true);
    try {
      await onAddLegacyDebt(detailCustomer.id, amt, legacyForm.note);
      setLegacyModalOpen(false);
      setLegacyForm({ amount: '', note: '' });
    } finally {
      setLegacySaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSaveCustomer || !form.name.trim()) return;
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
          {onSaveCustomer && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90"
            style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
          >
            <Plus size={16} />
            إضافة عميل
          </button>
          )}
          {customers.length > 0 && onExportCustomersLedgerPdf && (
            <button
              type="button"
              onClick={onExportCustomersLedgerPdf}
              disabled={customersLedgerPdfLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
            >
              <FileDown size={16} />
              {customersLedgerPdfLoading ? 'جاري PDF…' : 'ملخص الديون PDF'}
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
              <div
                key={c.id}
                className={`flex items-stretch gap-1 ${
                  detailId === c.id ? 'bg-accent-soft/40 border-s-4 border-accent' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDetailId(c.id);
                    setSelectedOrder(null);
                  }}
                  className="flex-1 min-w-0 text-start p-4 hover:bg-gray-50 transition-colors"
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
                {onAddCustomerPayment && (
                  <button
                    type="button"
                    onClick={() => openPaymentModal(c.id)}
                    className="shrink-0 self-center me-2 flex items-center gap-1 px-2.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50/90 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100"
                    style={{ fontFamily: FONT_UI }}
                    title="إضافة دفعة"
                  >
                    <Wallet size={14} />
                    دفعة
                  </button>
                )}
              </div>
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
                    <p className="text-sm text-gray-600 mt-1" dir="ltr" style={{ fontFamily: FONT_UI }}>
                      {detailCustomer.phone}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1" style={{ fontFamily: FONT_UI }}>
                    واتساب الكشوف: <span dir="ltr">{SYSTEM_WHATSAPP_DISPLAY}</span>
                  </p>
                  {detailCustomer.address && (
                    <p className="text-xs text-gray-500 mt-0.5">{detailCustomer.address}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSendStatementWhatsApp}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-medium hover:opacity-90"
                    style={{ backgroundColor: '#128C7E', fontFamily: FONT_UI }}
                    title={`يُفتح واتساب ${SYSTEM_WHATSAPP_DISPLAY} برسالة الكشف جاهزة`}
                  >
                    <MessageCircle size={14} />
                    إرسال عبر واتساب
                  </button>
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
                  {onAddCustomerPayment && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(detailCustomer.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <Wallet size={14} />
                      إضافة دفعة
                    </button>
                  )}
                  {onAddLegacyDebt && (
                    <button
                      type="button"
                      onClick={() => {
                        setLegacyForm({ amount: '', note: '' });
                        setLegacyModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/80 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <Plus size={14} />
                      دين قديم
                    </button>
                  )}
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
                  {onSaveCustomer && (
                    <button
                      type="button"
                      onClick={() => openEdit(detailCustomer)}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="تعديل"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {onDeleteCustomer && (
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
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-gray-50/80 border-b border-gray-100">
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400">إجمالي الدين</p>
                  <p className="text-lg font-bold text-red-600">{fmtMoney(detailCustomer.balance || 0)}</p>
                  {legacyDebtTotal > 0 && (
                    <p className="text-[10px] text-amber-700">منها دين قديم: {fmtMoney(legacyDebtTotal)}</p>
                  )}
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400">عدد الطلبات</p>
                  <p className="text-lg font-bold text-primary">{statementTotals.orderCount}</p>
                  {statementTotals.debtOrderCount > 0 && (
                    <p className="text-[10px] text-gray-500">يشمل {statementTotals.debtOrderCount} بالدين</p>
                  )}
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400">إجمالي الخصومات</p>
                  <p className="text-lg font-bold text-accent">{fmtMoney(statementTotals.totalDiscounts)}</p>
                  {statementTotals.discountOrderCount > 0 && (
                    <p className="text-[10px] text-gray-500">على {statementTotals.discountOrderCount} طلب</p>
                  )}
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
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

              <div className="px-5 pt-5">
                <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: FONT_HEADING }}>
                  <Percent size={16} />
                  الخصومات
                </h4>
                {customerDiscountOrders.length === 0 ? (
                  <p className="text-xs text-gray-400 pb-1" style={{ fontFamily: FONT_UI }}>لا توجد خصومات على طلبات هذا العميل.</p>
                ) : (
                  <div className="rounded-xl border border-gray-100 overflow-hidden" style={{ fontFamily: FONT_UI }}>
                    <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                      {customerDiscountOrders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedOrder(o)}
                          className="w-full flex items-center justify-between gap-2 text-xs px-3 py-2.5 hover:bg-gray-50 text-start"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold text-primary">#{o.orderNumber}</span>
                            <span className="text-gray-400"> · {formatOrderDate(o)}</span>
                            <span className="block text-[10px] text-gray-500 mt-0.5">
                              {fmtMoney(o.subtotal || 0)} ← {fmtMoney(o.total || 0)}
                            </span>
                          </span>
                          <span className="font-bold text-accent shrink-0">- {fmtMoney(orderDiscountValue(o))}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between items-center px-3 py-2.5 bg-gray-50 text-xs font-bold">
                      <span className="text-gray-600">إجمالي الخصومات</span>
                      <span className="text-accent">- {fmtMoney(statementTotals.totalDiscounts)}</span>
                    </div>
                  </div>
                )}
              </div>

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
                    .map((t) => {
                      if (t.type === 'legacy_debt') {
                        return (
                          <div
                            key={t.id}
                            className="w-full flex justify-between items-center gap-2 text-xs p-2.5 rounded-xl bg-amber-50/80 border border-amber-100 text-start"
                            style={{ fontFamily: FONT_UI }}
                          >
                            <span className="flex-1 min-w-0">
                              {customerTransactionTypeLabel(t.type)}
                              {t.description ? ` — ${t.description}` : ''}
                              {t.date ? (
                                <span className="block text-[10px] text-gray-400 mt-0.5">{formatLegacyDate(t.date)}</span>
                              ) : null}
                            </span>
                            <span className="font-bold text-red-600 shrink-0">+{fmtMoney(t.amount)}</span>
                            {onUpdateCustomerTransactions && (
                              <button
                                type="button"
                                onClick={() => openEditTransaction(t)}
                                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-900 shrink-0"
                                aria-label="تعديل"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        );
                      }
                      if (t.type === 'payment') {
                        return (
                          <div
                            key={t.id}
                            className="w-full flex justify-between items-center gap-2 text-xs p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100 text-start"
                            style={{ fontFamily: FONT_UI }}
                          >
                            <span className="flex-1 min-w-0">
                              {customerTransactionTypeLabel(t.type)}
                              {t.description ? ` — ${t.description}` : ''}
                              {t.date ? (
                                <span className="block text-[10px] text-gray-400 mt-0.5">{formatLegacyDate(t.date)}</span>
                              ) : null}
                            </span>
                            <span className="font-bold text-emerald-700 shrink-0">-{fmtMoney(t.amount)}</span>
                            {onUpdateCustomerTransactions && (
                              <button
                                type="button"
                                onClick={() => openEditTransaction(t)}
                                className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-900 shrink-0"
                                aria-label="تعديل"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={t.id}
                          className="w-full flex items-center gap-1 text-xs p-2.5 rounded-xl bg-gray-50 border border-gray-100"
                          style={{ fontFamily: FONT_UI }}
                        >
                          <button
                            type="button"
                            onClick={() => openOrderByNumber(t.orderNumber)}
                            className="flex-1 flex justify-between items-center text-start hover:opacity-80 min-w-0"
                          >
                            <span>
                              طلب #{t.orderNumber || '—'} — {customerTransactionTypeLabel(t.type)}
                              <span className="block text-[10px] text-gray-400 mt-0.5">عرض التفاصيل</span>
                            </span>
                            <span className="font-bold text-red-600 shrink-0 ms-2">+{fmtMoney(t.amount)}</span>
                          </button>
                          {onUpdateCustomerTransactions && (
                            <button
                              type="button"
                              onClick={() => openEditTransaction(t)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"
                              aria-label="تعديل رقم أو مبلغ"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
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
                          {(o.items || []).length > 0
                            ? `${(o.items || []).length} أصناف`
                            : Number(o.debtAmount) > 0
                              ? 'طلب بالدين'
                              : 'بدون أصناف'}
                          {' · '}
                          {formatOrderDate(o)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="font-semibold">{fmtMoney(o.total)}</span>
                        {(onEditOrder || (o._syntheticFromTransaction && onUpdateCustomerTransactions)) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (o._syntheticFromTransaction) {
                                const tx = (detailCustomer?.transactions || []).find(
                                  (t) =>
                                    t.type === 'order_debt' && String(t.orderNumber) === String(o.orderNumber)
                                );
                                if (tx) openEditTransaction(tx);
                              } else if (onEditOrder) onEditOrder(o);
                            }}
                            className="p-1 rounded-lg hover:bg-gray-100 text-primary"
                            aria-label="تعديل الفاتورة"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
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
              {orderDiscountValue(selectedOrder) > 0 && (
                <p>
                  <span className="text-gray-500">خصم: </span>
                  <span className="text-accent font-medium">- {fmtMoney(orderDiscountValue(selectedOrder))}</span>
                  <span className="text-gray-400 text-xs"> (قبل الخصم {fmtMoney(selectedOrder.subtotal || 0)})</span>
                </p>
              )}
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

            <div className="p-5 border-t border-[var(--color-border)] bg-white space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600" style={{ fontFamily: FONT_UI }}>
                  الإجمالي
                </span>
                <span className="text-xl font-bold text-accent">{fmtMoney(selectedOrder.total)}</span>
              </div>
              {(onEditOrder || onUpdateCustomerTransactions) && (
                <button
                  type="button"
                  onClick={editSelectedOrder}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 hover:opacity-90"
                  style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                >
                  <Pencil size={16} />
                  {selectedOrder._syntheticFromTransaction ? 'تعديل رقم/مبلغ السجل' : 'تعديل الفاتورة في الكاشير'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editingTransaction && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
                تعديل حركة — {customerTransactionTypeLabel(editingTransaction.type)}
              </h3>
              <button type="button" onClick={closeTxEditor} className="text-gray-400 hover:text-gray-600">
                <X size={22} />
              </button>
            </div>
            <div className="space-y-3 text-sm" style={{ fontFamily: FONT_UI }}>
              {editingTransaction.type === 'order_debt' && (
                <div>
                  <label className="block text-xs mb-1 text-gray-600">رقم الطلب / الفاتورة</label>
                  <input
                    value={txForm.orderNumber}
                    onChange={(e) => setTxForm((f) => ({ ...f, orderNumber: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs mb-1 text-gray-600">
                  {editingTransaction.type === 'payment' ? 'مبلغ الدفعة' : 'مبلغ الدين'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={txForm.amount}
                  onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                />
              </div>
              {editingTransaction.type === 'order_debt' && (
                <>
                  <div>
                    <label className="block text-xs mb-1 text-gray-600">كاش مدفوع (إن وجد)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={txForm.cashPaid}
                      onChange={(e) => setTxForm((f) => ({ ...f, cashPaid: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 text-gray-600">إجمالي الفاتورة (اختياري)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={txForm.total}
                      onChange={(e) => setTxForm((f) => ({ ...f, total: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs mb-1 text-gray-600">وصف / ملاحظة</label>
                <input
                  value={txForm.description}
                  onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                />
              </div>
              {(editingTransaction.type === 'payment' || editingTransaction.type === 'legacy_debt') && (
                <div>
                  <label className="block text-xs mb-1 text-gray-600">التاريخ</label>
                  <input
                    type="datetime-local"
                    value={txForm.date}
                    onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none"
                  />
                </div>
              )}
              <p className="text-[10px] text-gray-400">يُحدَّث رصيد العميل تلقائياً من مجموع الحركات بعد الحفظ.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => deleteTransaction(editingTransaction)}
                disabled={txSaving}
                className="px-4 py-2.5 rounded-xl text-sm text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                حذف
              </button>
              <button
                type="button"
                onClick={closeTxEditor}
                className="flex-1 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-600"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveEditedTransaction}
                disabled={txSaving}
                className="flex-1 py-2.5 rounded-xl text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}
              >
                {txSaving ? 'جاري الحفظ…' : 'حفظ'}
              </button>
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
              {!editingId && allowOpeningDebt && (
                <>
                  <div>
                    <label className="block text-xs mb-1 text-gray-600">دين قديم (اختياري)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.openingDebt}
                      onChange={(e) => setForm((f) => ({ ...f, openingDebt: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                      style={{ fontFamily: FONT_UI }}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">رصيد دين سابق قبل استخدام النظام</p>
                  </div>
                  {Number(form.openingDebt) > 0 && (
                    <div>
                      <label className="block text-xs mb-1 text-gray-600">وصف الدين القديم (اختياري)</label>
                      <input
                        value={form.openingDebtNote}
                        onChange={(e) => setForm((f) => ({ ...f, openingDebtNote: e.target.value }))}
                        placeholder="مثال: رصيد من دفتر قديم"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                        style={{ fontFamily: FONT_UI }}
                      />
                    </div>
                  )}
                </>
              )}
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

      {legacyModalOpen && detailCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
                إضافة دين قديم
              </h3>
              <button
                type="button"
                onClick={() => setLegacyModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4" style={{ fontFamily: FONT_UI }}>
              للعميل: <strong>{detailCustomer.name}</strong> — الرصيد الحالي: {fmtMoney(detailCustomer.balance || 0)}
            </p>
            <form onSubmit={handleSubmitLegacyDebt} className="space-y-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">المبلغ</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  autoFocus
                  value={legacyForm.amount}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">ملاحظة (اختياري)</label>
                <input
                  value={legacyForm.note}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="دين قديم"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLegacyModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium"
                  style={{ fontFamily: FONT_UI }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={legacySaving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                >
                  {legacySaving ? 'جاري الحفظ…' : 'تأكيد الإضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
                إضافة دفعة
              </h3>
              <button
                type="button"
                onClick={() => setPaymentModalCustomerId(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4" style={{ fontFamily: FONT_UI }}>
              للعميل: <strong>{paymentModalCustomer.name}</strong> — الرصيد الحالي:{' '}
              {fmtMoney(paymentModalCustomer.balance || 0)}
            </p>
            <form onSubmit={handleSubmitCustomerPayment} className="space-y-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">مبلغ الدفعة</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  autoFocus
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">ملاحظة (اختياري)</label>
                <input
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="دفعة على الحساب"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                  style={{ fontFamily: FONT_UI }}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalCustomerId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium"
                  style={{ fontFamily: FONT_UI }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={paymentSaving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                >
                  {paymentSaving ? 'جاري الحفظ…' : 'تسجيل الدفعة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
