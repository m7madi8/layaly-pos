# تعديلات الدمج — ليالي POS (iPad)

لا تغيير على أي business logic. الملفات الجديدة تُنسخ كما هي إلى `src/`:

- `src/components/PosCart.js` (جديد)
- `src/components/PosPaymentSheets.js` (جديد)
- `src/components/PosProductCard.js` (يستبدل الموجود)
- `src/utils/friendlyError.js` (جديد)

باقي التعديلات في الملفات الموجودة أدناه، بالترتيب.

---

## 1) App.js — الاستيرادات

```js
// React
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// lucide: أضف Check إلى القائمة الحالية
// ..., PauseCircle, ArrowRight, Check } from 'lucide-react';

import PosCart from './components/PosCart';
import { PaymentChooserSheet, CashSheet, MixedSheet } from './components/PosPaymentSheets';
import { friendlyError } from './utils/friendlyError';
```

## 2) App.js — refs / effects / hooks (كلها قبل أي `return` مبكر)

أ) بجانب `cartFlashTimerRef`:

```js
const addToOrderRef = useRef(null);
```

ب) بجانب باقي الـ `useEffect` (إخفاء التنبيه تلقائياً):

```js
useEffect(() => {
  if (!suspendFeedback) return undefined;
  const t = setTimeout(() => setSuspendFeedback(''), 2600);
  return () => clearTimeout(t);
}, [suspendFeedback]);
```

ج) بعد تعريف `const addToOrder = (product) => { ... };` مباشرة:

```js
addToOrderRef.current = addToOrder;
```

د) استبدل `const filteredProducts = ...` في قسم Computed values بـ:

```js
const filteredProducts = useMemo(
  () =>
    posProducts
      .filter(
        (p) =>
          (selectedCategory === 'all' || p.category === selectedCategory) &&
          p.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
  [posProducts, selectedCategory, searchTerm]
);

// دالة ثابتة كي يعمل React.memo على البطاقات
const stableAdd = useCallback((p) => addToOrderRef.current?.(p), []);

// كمية كل منتج داخل السلة (شارة على البطاقة)
const cartQtyByProduct = useMemo(() => {
  const m = {};
  currentOrder.items.forEach((i) => {
    m[i.id] = (m[i.id] || 0) + (i.quantity || 0);
  });
  return m;
}, [currentOrder.items]);
```

## 3) App.js — دوال مساعدة (بعد `updateQuantity`)

```js
const removeCartLine = (lineKey) =>
  setCurrentOrder((prev) => ({
    ...prev,
    items: prev.items.filter((i) => (i.cartItemId || i.id) !== lineKey),
  }));

const openQuickCustomer = (prefill = '') => {
  const p = String(prefill).trim();
  const isPhone = /^[\d+\s-]+$/.test(p);
  setQuickCustomerForm({
    name: p && !isPhone ? p : '',
    phone: p && isPhone ? p : '',
    address: '',
    notes: '',
  });
  setShowQuickCustomerModal(true);
};

// الضيف: مباشرة إلى الكاش (كاش فقط أصلاً). العميل: اختيار طريقة الدفع.
const startPayment = () => {
  if (currentOrder.items.length === 0 || uploadProgress) return;
  setPaymentCustomPrice('');
  setMixedCashAmount('');
  if (!currentOrder.customerId) {
    setCashGiven('');
    setFinalTotalForPayment(cartTotal);
    setShowCashModal(true);
  } else {
    setShowPaymentModal(true);
  }
};
```

## 4) App.js — رسائل أوضح + تعليق بدون نافذة تأكيد + إشعار نجاح

**requestSuspendBill**: غيّر آخر سطر `setShowSuspendConfirm(true);` إلى:

```js
confirmSuspendBill();
```

(التعليق قابل للتراجع ويظهر إشعار «تم تعليق الفاتورة»، فلا حاجة لنافذة تأكيد. احذف كتلة JSX الخاصة بـ `showSuspendConfirm`.)

**confirmSuspendBill** — في `catch`:

```js
alert(friendlyError(error, 'تعذّر حفظ الفاتورة المعلقة. لم يضِع الطلب — السلة ما زالت كما هي.'));
```

**confirmCancelOpenBill** — في `catch`:

```js
alert(friendlyError(error, 'تعذّر إلغاء الفاتورة المعلقة. لم يتغيّر شيء، حاول مرة أخرى.'));
```

**completeOrder** — في `catch` الأخير (الذي قبل `finally { setUploadProgress(false) }`):

```js
alert(friendlyError(error, 'تعذّر إتمام الدفع. لم يُحفظ الطلب ولم يُخصم شيء من المخزون. حاول مرة أخرى.'));
```

**completeOrder** — بعد `setShowCashModal(false);` الموجودة داخل `try` بعد نجاح الـ transaction، أضف:

```js
if (!editingOrderId) {
  setSuspendFeedback(`✓ تم الدفع${createdOrderNumber ? ` · #${createdOrderNumber}` : ''}`);
}
```

**الإشعار**: استبدل كتلة `{suspendFeedback && (<div className="fixed inset-0 ... حسناً ...</div>)}` بـ:

```jsx
{suspendFeedback && (
  <div
    role="status"
    className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[90] px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-xl flex items-center gap-2"
    style={{ fontFamily: FONT_UI }}
  >
    <Check size={16} />
    {suspendFeedback}
  </div>
)}
```

## 5) App.js — الـ `<main>` (يصبح POS بدون تمرير للصفحة كاملة)

```jsx
<main className={`flex-1 bg-gray-100 ${activeView === 'pos' ? 'overflow-hidden p-3' : 'overflow-auto p-4 md:p-8'}`}>
```

## 6) App.js — كتلة POS

استبدل **الـ div الداخلي** `<div className="flex h-full flex-col lg:flex-row gap-4 xl:gap-5 items-start"> ... </div>`
(من بدايته حتى إغلاقه قبل `{/* Mobile Cart Toggle Bar */}`) بما يلي، وأبقِ الغلاف `max-w-[1600px] mx-auto h-full` وشريط الجوال كما هما:

```jsx
<div className="h-full flex flex-col lg:flex-row gap-3">
  <PosCart
    mobileOpen={isMobileCartOpen}
    onCloseMobile={() => setIsMobileCartOpen(false)}
    activeOpenBillId={activeOpenBillId}
    editingOrderId={editingOrderId}
    currentOrder={currentOrder}
    customers={customers}
    canCreateCustomers={employeeCanCreateCustomers}
    onSelectCustomer={selectOrderCustomer}
    onAddCustomer={openQuickCustomer}
    onNotesChange={(notes) => setCurrentOrder((p) => ({ ...p, notes }))}
    onGuestNameChange={(customer) => setCurrentOrder((p) => ({ ...p, customer }))}
    onQty={updateQuantity}
    onRemove={removeCartLine}
    lastAddedId={lastAddedCartId}
    subtotal={cartSubtotal}
    discount={discount}
    discountAmount={cartDiscountAmount}
    total={cartTotal}
    onDiscount={() => setShowDiscountModal(true)}
    onPay={startPayment}
    onSuspend={requestSuspendBill}
    onPrint={printDraftReceipt}
    onCancelBill={() => setShowCancelOpenBillConfirm(true)}
    onExitBill={exitOpenBillToList}
    busy={uploadProgress || openBillBusy}
  />

  <div className="flex-1 min-w-0 h-full flex flex-col">
    {/* الفواتير المعلقة: شريط أفقي أعلى المنتجات (بدل العمود الجانبي) */}
    <OpenBillsPanel
      variant="strip"
      openBills={openBills}
      fmtMoney={fmtMoney}
      theme={theme}
      FONT_UI={FONT_UI}
      FONT_HEADING={FONT_HEADING}
      busy={openBillBusy || uploadProgress}
      onOpenBill={loadOpenBillIntoCart}
      activeBillId={activeOpenBillId}
    />

    <div className="shrink-0 mb-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5 p-1 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm">
          {[
            { id: 'menu', label: 'القائمة' },
            { id: 'playstation', label: 'بلايستيشن' },
            { id: 'hookah', label: 'أراجيل' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPosSection(tab.id)}
              className={`flex-1 h-11 rounded-xl text-sm font-bold transition-colors ${
                posSection === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]'
              }`}
              style={{ fontFamily: FONT_UI }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowOpenBillsPanel(true)}
          className="lg:hidden h-[3.25rem] px-3.5 inline-flex items-center gap-2 rounded-2xl text-sm font-semibold border bg-white"
          style={{ borderColor: 'var(--color-border)', color: theme.text, fontFamily: FONT_UI }}
        >
          <PauseCircle size={18} />
          معلّقة
          {openBillsCount > 0 && (
            <span className="text-white text-[11px] min-w-[1.25rem] h-5 px-1 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
              {openBillsCount}
            </span>
          )}
        </button>
      </div>

      {posSection === 'menu' && (
        <>
          <div className="relative">
            <Search className="absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none" size={18} style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="search"
              enterKeyHint="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setSearchTerm('');
              }}
              placeholder="بحث سريع بالاسم…"
              className="layali-input w-full h-12 pe-11 ps-11 text-base shadow-sm"
              style={{ fontFamily: FONT_UI }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute start-1 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-lg text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
                aria-label="مسح البحث"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
            {posMenuTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`h-11 px-4 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                  selectedCategory === tab.id
                    ? 'text-white shadow-sm'
                    : 'bg-white border border-[var(--color-border-strong)] text-[var(--color-text-secondary)]'
                }`}
                style={selectedCategory === tab.id ? { backgroundColor: 'var(--color-accent)', fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-24 lg:pb-2">
      {posSection === 'playstation' && (
        <div ref={playstationPanelRef}>
          <PlayStationPanel
            stations={playstationSettings.stations}
            sessions={playstationSessions}
            timeProducts={timeProducts}
            fmtMoney={fmtMoney}
            busy={playstationBusy}
            onStart={handleStartPlaystation}
            onEnd={handleEndPlaystation}
            onCancel={handleCancelPlaystation}
            onAddEndedToCart={addSessionToCart}
            cartSessionIds={cartSessionIds}
          />
        </div>
      )}

      {posSection === 'hookah' && (
        <ExternalAssetsPanel
          assets={externalAssets}
          movements={assetMovements}
          busy={assetsBusy}
          canManage={!isEmployee}
          defaultPerson={currentOrder.customerId ? currentOrder.customer : ''}
          linkedMovementIds={cartMovementIds}
          saleProducts={hookahSaleProducts}
          fmtMoney={fmtMoney}
          onCheckout={handleCheckoutAsset}
          onReturn={handleReturnAsset}
          onAddAsset={handleAddAsset}
        />
      )}

      {posSection === 'menu' && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {filteredProducts.map((product) => (
              <PosProductCard
                key={product.id}
                product={product}
                qty={cartQtyByProduct[product.id] || 0}
                onAdd={stableAdd}
              />
            ))}
          </div>
          {/* أبقِ كتلة «لا نتائج / لا أصناف» الحالية هنا كما هي */}
        </>
      )}
    </div>
  </div>
</div>
```

## 7) App.js — نوافذ الدفع الثلاث

احذف الكتل الثلاث الحالية (`showPaymentModal` و`showMixedPaymentModal` و`showCashModal`) وضع مكانها:

```jsx
<PaymentChooserSheet
  open={showPaymentModal}
  total={cartTotal}
  customerName={currentOrder.customer}
  busy={uploadProgress}
  onClose={() => setShowPaymentModal(false)}
  onCash={() => {
    setCashGiven('');
    setFinalTotalForPayment(cartTotal);
    setShowPaymentModal(false);
    setShowCashModal(true);
  }}
  onMixed={() => {
    setMixedCashAmount('');
    setShowPaymentModal(false);
    setShowMixedPaymentModal(true);
  }}
  onDebt={() => completeOrder('unpaid', { paymentType: 'debt', customerId: currentOrder.customerId })}
/>

<CashSheet
  open={showCashModal}
  total={finalTotalForPayment}
  given={cashGiven}
  onGivenChange={setCashGiven}
  busy={uploadProgress}
  onClose={() => setShowCashModal(false)}
  onConfirm={() => completeOrder('paid', { paymentType: 'cash', method: 'Cash' })}
/>

<MixedSheet
  open={showMixedPaymentModal}
  total={cartTotal}
  customerName={currentOrder.customer}
  cash={mixedCashAmount}
  onCashChange={setMixedCashAmount}
  busy={uploadProgress}
  onClose={() => setShowMixedPaymentModal(false)}
  onConfirm={() =>
    completeOrder('paid', { paymentType: 'mixed', cashPaid: mixedCashAmount, customerId: currentOrder.customerId })
  }
/>
```

ملاحظة: نافذة الكاش لم تعد تُغلق قبل نتيجة `completeOrder`؛ تُغلق عند النجاح (الدالة نفسها تفعل ذلك)، وإن فشل الدفع تبقى مفتوحة مع رسالة الخطأ.

## 8) App.js — السايدبار والهيدر (أسماء الأقسام ظاهرة دائماً)

عرض الشريط المطوي: `lg:w-20` → `lg:w-24`، وزر القائمة في `nav`:

```jsx
<button
  key={item.id}
  onClick={() => {
    setCurrentView(item.id);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }}
  className={`w-full flex items-center gap-3 px-3 py-3 min-h-[56px] rounded-xl transition-colors duration-150 ${
    isSidebarOpen ? 'justify-start text-sm' : 'lg:flex-col lg:justify-center lg:gap-1 lg:py-2.5'
  } ${activeView === item.id ? 'bg-accent text-white shadow-md' : 'active:bg-white/10 text-white/70 hover:text-white'}`}
  style={{ fontFamily: FONT_UI, fontWeight: 500 }}
>
  <item.icon size={22} strokeWidth={1.5} className="flex-shrink-0" />
  <span className={`${isSidebarOpen ? 'block' : 'hidden lg:block lg:text-[11px] lg:leading-tight'} whitespace-nowrap`}>{item.label}</span>
</button>
```

زر القائمة في الهيدر: `p-1` → `w-11 h-11 grid place-items-center` (هدف لمس 44px).

## 9) OpenBillsPanel.js — وضع `strip`

أضف هذا الفرع قبل `if (variant === 'sidebar')`:

```jsx
if (variant === 'strip') {
  if (filtered.length === 0) return null;
  return (
    <section className="hidden lg:block shrink-0 mb-3" dir="rtl" aria-label="الفواتير المعلقة" style={{ fontFamily: FONT_UI }}>
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <h3 className="text-sm font-bold text-primary">فواتير معلقة</h3>
        <span className="min-w-[1.4rem] h-5 px-1.5 rounded-full text-[11px] font-bold text-white grid place-items-center tabular-nums" style={{ backgroundColor: theme.accent }}>
          {filtered.length}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtered.map((bill) => {
          const isActive = activeBillId === bill.id;
          return (
            <button
              key={bill.id}
              type="button"
              disabled={busy}
              onClick={() => onOpenBill(bill)}
              className={`shrink-0 min-w-[10.5rem] max-w-[13rem] min-h-[72px] text-start rounded-xl border px-3 py-2 disabled:opacity-50 ${
                isActive ? 'border-accent bg-[var(--color-accent-soft)]' : 'border-[var(--color-border-strong)] bg-white active:bg-[var(--color-bg-warm)]'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-[15px] text-primary truncate">{bill.customerName || 'عميل'}</span>
                <span className="font-extrabold text-accent tabular-nums shrink-0">{fmtMoney(bill.total || 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-[var(--color-text-muted)]">
                <span>{bill.itemCount || bill.items?.length || 0} أصناف</span>
                <span className="inline-flex items-center gap-1"><Clock size={11} />{formatOpenBillAge(bill.updatedAtMs) || '—'}</span>
              </div>
              <p className={`text-[11px] font-bold mt-0.5 ${isActive ? 'text-accent' : 'text-[var(--color-text-secondary)]'}`}>
                {isActive ? 'مفتوحة الآن' : 'اضغط للمتابعة'}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

وفي حقل البحث داخل الـ drawer: `py-2 ... text-xs` → `h-11 ... text-base`.

## 10) PlayStationPanel.js / ExternalAssetsPanel.js — أهداف لمس 44px+

PlayStationPanel:
- زر «إنهاء وإضافة للطلب»: `py-2 rounded-lg bg-primary text-white text-xs` → `min-h-[48px] rounded-xl bg-primary text-white text-sm`
- زر إلغاء الجلسة (X): `px-2.5 rounded-lg` → `w-12 rounded-xl grid place-items-center`
- زر «بدء جلسة»: `py-2 ... text-xs` → `min-h-[48px] ... text-sm rounded-xl`
- خيارات المنتج عند اختيار نوع الجلسة: `px-2.5 py-2 text-xs` → `px-3 min-h-[48px] text-sm`
- المؤقّت `text-xl` → `text-3xl` (رؤية من بعيد)

ExternalAssetsPanel:
- «إخراج أرجيلة»: `px-3 py-1.5 text-xs` → `px-4 min-h-[44px] text-sm rounded-xl`
- «تم الإرجاع»: `px-2.5 py-1.5 text-xs` → `px-3.5 min-h-[44px] text-sm rounded-xl`
- حقول النموذج: `py-2` → `h-12 text-base`

## 11) src/index.css

استبدل قاعدتي `.layali-product-card` و`.layali-product-card__media` بـ:

```css
.layali-product-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.layali-product-card:active:not(:disabled) { transform: scale(0.97); }
.layali-product-card__media {
  border-radius: var(--radius-sm);
  background: #ffffff;
}
```

وعدّل keyframes الوميض (أقصر ويعود للون السطر الجديد) والانتقال:

```css
.layali-cart-line-flash { animation: layaliCartFlash 0.6s ease; }
@keyframes layaliCartFlash {
  0%   { background-color: var(--color-accent-soft); }
  100% { background-color: var(--color-bg-warm); }
}
```

وأضف في آخر الملف (إصلاحات خاصة بـ iPad):

```css
/* iPad Safari يكبّر الصفحة عند التركيز على حقل خطه أقل من 16px */
@media (pointer: coarse) {
  input, select, textarea { font-size: 16px !important; }
}
button, [role='button'] {
  touch-action: manipulation;           /* يلغي تأخير/تكبير الضغط المزدوج */
  -webkit-tap-highlight-color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

`.layali-pos-toolbar` لم يعد مستخدماً ويمكن حذفه.
