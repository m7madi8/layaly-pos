import { APP_NAME } from '../branding';
import { fmtMoneyPlain } from '../i18n';

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
          ? item.selectedAddons.map((a) => `<div class="addon">+ ${a.name}</div>`).join('')
          : '';
      return `
        <tr>
          <td>${item.name}${addons ? `<div>${addons}</div>` : ''}</td>
          <td>${item.quantity}</td>
          <td>${fmtMoneyPlain(item.price)}</td>
          <td>${fmtMoneyPlain(item.price * item.quantity)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
    <title>إيصال #${order.orderNumber || ''}</title>
    <style>
      body { font-family: Cairo, Tahoma, sans-serif; padding: 16px; max-width: 320px; margin: 0 auto; font-size: 13px; }
      h1 { font-size: 16px; margin: 0 0 8px; text-align: center; }
      .meta { margin-bottom: 12px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 4px 0; vertical-align: top; }
      th { border-bottom: 1px solid #000; text-align: right; font-size: 11px; }
      .addon { font-size: 11px; color: #444; }
      .total { font-weight: bold; font-size: 15px; margin-top: 12px; text-align: center; }
      .footer { text-align: center; margin-top: 16px; font-size: 11px; }
    </style></head><body>
    ${appSettings?.receiptHeader ? `<p>${appSettings.receiptHeader}</p>` : ''}
    <h1>${businessProfile?.businessName || APP_NAME}</h1>
    <div class="meta">
      العميل: ${order.customer || 'ضيف'}<br/>
      ${orderDate.toLocaleDateString('ar')} ${orderDate.toLocaleTimeString('ar')}<br/>
      طلب: #${order.orderNumber || '—'}<br/>
      ${order.paymentMethod ? `الدفع: ${order.paymentMethod}` : ''}
    </div>
    <table>
      <thead><tr><th>الصنف</th><th>كم</th><th>سعر</th><th>مجموع</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p class="total">الإجمالي: ${fmtMoneyPlain(order.total || 0)}</p>
    <p class="footer">${order.status === 'paid' ? 'مدفوع' : 'غير مدفوع'}</p>
    ${appSettings?.receiptFooter ? `<p class="footer">${appSettings.receiptFooter}</p>` : ''}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;

  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) {
    throw new Error('السماح بالنوافذ المنبثقة مطلوب للطباعة');
  }
  w.document.write(html);
  w.document.close();
}
