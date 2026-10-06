import { APP_NAME, resolveAppLogo } from '../branding';
import { fmtMoneyPlain, paymentMethodLabel } from '../i18n';
import { itemDetailLabel } from './productPricing';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const money = (value) => `<bdi dir="ltr">${fmtMoneyPlain(value)}</bdi>`;

function logoSrc() {
  const url = resolveAppLogo();
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

/** طباعة إيصال عبر المتصفح عند عدم توفر Bluetooth */
export function printReceiptViaBrowser(order, { businessProfile, appSettings }) {
  const orderDate = order.timestamp
    ? order.timestamp.toDate
      ? order.timestamp.toDate()
      : new Date(order.timestamp)
    : new Date();

  const itemsHtml = (order.items || [])
    .map((item) => {
      const addons =
        item.selectedAddons && item.selectedAddons.length
          ? item.selectedAddons.map((a) => `<div class="addon">+ ${esc(a.name)}</div>`).join('')
          : '';
      const detail = itemDetailLabel(item);
      return `
        <tr>
          <td>${esc(item.name)}${detail ? `<div class="addon">${detail}</div>` : ''}${addons ? `<div>${addons}</div>` : ''}</td>
          <td>${item.quantity}</td>
          <td>${money(item.price)}</td>
          <td>${money(item.price * item.quantity)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
    <title>${order.isDraft ? 'فاتورة مبدئية' : `إيصال #${order.orderNumber || ''}`}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Cairo, Tahoma, sans-serif; width: 100%; max-width: 80mm; padding: 4mm 4mm 6mm; margin: 0 auto; font-size: 12px; color: #000; }
      .logo { display: block; max-width: 34mm; max-height: 20mm; margin: 0 auto 6px; object-fit: contain; }
      h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
      .badge { text-align: center; font-weight: bold; border: 1px dashed #000; padding: 3px; margin: 0 0 8px; font-size: 12px; }
      .meta { margin-bottom: 8px; line-height: 1.5; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      td, th { padding: 3px 0; vertical-align: top; }
      th { border-bottom: 1px solid #000; text-align: right; font-size: 10px; }
      td:not(:first-child), th:not(:first-child) { text-align: left; white-space: nowrap; padding-inline-start: 4px; }
      .addon { font-size: 10px; color: #333; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
      .total { font-weight: bold; font-size: 15px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; }
      .notes { margin-top: 8px; font-size: 11px; border-top: 1px dashed #000; padding-top: 6px; }
      .footer { text-align: center; margin-top: 10px; font-size: 10px; }
    </style></head><body>
    <img class="logo" src="${logoSrc()}" alt="${APP_NAME}" />
    ${appSettings?.receiptHeader ? `<p class="footer">${esc(appSettings.receiptHeader)}</p>` : ''}
    <h1>${esc(businessProfile?.businessName || APP_NAME)}</h1>
    ${order.isDraft ? `<p class="badge">${order.isOpenBill ? 'حساب مفتوح — غير مدفوع' : 'فاتورة مبدئية — قبل الدفع'}</p>` : ''}
    <div class="meta">
      العميل: ${esc(order.customer || 'ضيف')}<br/>
      التاريخ: <bdi>${orderDate.toLocaleDateString('ar')}</bdi> — <bdi>${orderDate.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</bdi><br/>
      ${order.orderNumber ? `طلب: #${esc(order.orderNumber)}<br/>` : ''}
      ${!order.isDraft && order.paymentMethod ? `الدفع: ${esc(paymentMethodLabel(order.paymentMethod))}` : ''}
    </div>
    <table>
      <thead><tr><th>الصنف</th><th>كم</th><th>سعر</th><th>مجموع</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    ${Number(order.discountAmount) > 0 && order.paymentMethod !== 'Compliment'
      ? `<p class="row" style="margin-top:8px"><span>المجموع</span><span>${money(order.subtotal || 0)}</span></p>
    <p class="row"><span>الخصم</span><bdi dir="ltr">-${fmtMoneyPlain(order.discountAmount)}</bdi></p>`
      : ''}
    <p class="total">الإجمالي: ${money(order.total || 0)}</p>
    ${order.notes ? `<p class="notes">ملاحظات: ${esc(order.notes)}</p>` : ''}
    <p class="footer">${order.isDraft ? (order.isOpenBill ? 'حساب مفتوح — غير مدفوع' : 'قبل الدفع') : order.status === 'paid' ? 'مدفوع' : 'غير مدفوع'}</p>
    ${appSettings?.receiptFooter ? `<p class="footer">${esc(appSettings.receiptFooter)}</p>` : ''}
    <script>window.onafterprint=function(){window.close();};window.onload=function(){window.print();}</script>
    </body></html>`;

  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) {
    throw new Error('السماح بالنوافذ المنبثقة مطلوب للطباعة');
  }
  w.document.write(html);
  w.document.close();
}
