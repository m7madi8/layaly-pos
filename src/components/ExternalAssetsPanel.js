import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CornerDownLeft, Plus, Link2 } from 'lucide-react';
import { FONT_UI } from '../branding';
import { formatDuration } from '../utils/productPricing';

/**
 * الأراجيل الخارجية داخل نقطة البيع: إخراج أرجيلة مع اسم الشخص، ومتابعة ما بالخارج، وتسجيل الإرجاع.
 */
export default function ExternalAssetsPanel({
  assets,
  movements,
  busy,
  canManage,
  defaultPerson,
  linkedMovementIds,
  saleProducts,
  fmtMoney,
  onCheckout,
  onReturn,
  onAddAsset,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [assetId, setAssetId] = useState('');
  const [person, setPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [productId, setProductId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const outside = useMemo(
    () => movements.filter((m) => m.status === 'outside').sort((a, b) => a.checkoutAtMs - b.checkoutAtMs),
    [movements]
  );
  const available = useMemo(
    () => assets.filter((a) => a.status === 'available').sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true })),
    [assets]
  );

  useEffect(() => {
    if (outside.length === 0) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [outside.length]);

  const openCheckout = () => {
    setAssetId(available[0]?.id || '');
    setPerson(defaultPerson || '');
    setNotes('');
    setProductId(saleProducts[0]?.id || '');
    setCheckoutOpen(true);
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    const ok = await onCheckout({ assetId, person, notes, productId });
    if (ok) setCheckoutOpen(false);
  };

  const submitAsset = async (e) => {
    e.preventDefault();
    const ok = await onAddAsset(newName);
    if (ok) {
      setNewName('');
      setAddOpen(false);
    }
  };

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-white p-3" style={{ fontFamily: FONT_UI }} aria-label="الأراجيل الخارجية">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ArrowUpRight size={18} />
          الأراجيل الخارجية
          {outside.length > 0 && (
            <span className="text-[10px] font-bold text-white bg-accent rounded-full px-2 py-0.5">{outside.length} بالخارج</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="text-[11px] font-medium text-gray-500 hover:text-primary px-2 py-1"
            >
              + أرجيلة جديدة
            </button>
          )}
          <button
            type="button"
            disabled={busy || available.length === 0}
            onClick={openCheckout}
            className="flex items-center gap-1 text-xs font-medium text-white bg-primary rounded-lg px-3 py-1.5 disabled:opacity-40"
            title={available.length === 0 ? 'لا توجد أرجيلة متاحة' : ''}
          >
            <Plus size={13} />
            إخراج أرجيلة
          </button>
        </div>
      </div>

      {addOpen && (
        <form onSubmit={submitAsset} className="flex gap-2 mb-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: أرجيلة #24"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none"
            aria-label="اسم الأرجيلة"
          />
          <button type="submit" disabled={busy || !newName.trim()} className="px-3 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40">
            حفظ
          </button>
        </form>
      )}

      {checkoutOpen && (
        <form onSubmit={submitCheckout} className="mb-2 rounded-lg bg-gray-50 border border-gray-200 p-2.5 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none"
              aria-label="الأرجيلة"
            >
              {available.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              autoFocus
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="اسم الشخص"
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none"
              aria-label="اسم الشخص"
            />
          </div>
          {saleProducts.length > 0 ? (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none"
              aria-label="صنف الأرجيلة المباع"
            >
              {saleProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price)}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-red-600">
              لا يوجد صنف أرجيلة للبيع. {canManage ? 'أضف صنفاً في قسم «الأرجيل» من المخزون.' : 'اطلب من المدير إضافة صنف أرجيلة.'}
            </p>
          )}
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات (اختياري) — مثال: للجيران، رقم البيت"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none"
            aria-label="ملاحظات"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !assetId || !person.trim() || !productId} className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40">
              تأكيد الإخراج وإضافتها للطلب
            </button>
            <button type="button" onClick={() => setCheckoutOpen(false)} className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-500">
              إلغاء
            </button>
          </div>
          <p className="text-[10px] text-gray-400">تُضاف للطلب كمبيعات بسعرها العادي، وتُربط بالفاتورة عند الحفظ.</p>
        </form>
      )}

      {outside.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {outside.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary truncate">
                  {m.assetName} <span className="font-normal text-gray-500">· {m.person}</span>
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  منذ {formatDuration((now - m.checkoutAtMs) / 60000)}
                  {m.orderNumber ? ` · فاتورة #${m.orderNumber}` : ''}
                  {m.notes ? ` · ${m.notes}` : ''}
                </p>
              </div>
              {linkedMovementIds.has(m.id) && (
                <span className="flex items-center gap-1 text-[10px] text-accent shrink-0" title="مرتبطة بالطلب الحالي">
                  <Link2 size={12} /> بالطلب
                </span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onReturn(m)}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40 shrink-0"
              >
                <CornerDownLeft size={13} />
                تم الإرجاع
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 py-1">
          {assets.length === 0
            ? canManage
              ? 'أضف أراجيلك (مثال: أرجيلة #1) لتتبع ما يخرج من المحل.'
              : 'لم يضف المدير أراجيل للتتبع بعد.'
            : `لا توجد أرجيلة بالخارج — ${available.length} متاحة.`}
        </p>
      )}
    </section>
  );
}
