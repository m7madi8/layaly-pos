import { APP_NAME, APP_LOGO } from '../branding';
import { escapeHtml, renderHtmlToPdfBlob } from './pdfExport';
import {
  formatStatementDateTime,
  formatOrderDateTime,
  orderPaymentSummary,
  resolveCustomerStatementOrders,
  computeStatementTotals,
} from './customerStatementData';

function logoUrl() {
  if (typeof window === 'undefined') return APP_LOGO;
  try {
    return new URL(APP_LOGO, window.location.origin).href;
  } catch {
    return APP_LOGO;
  }
}

function buildOrderItemsRows(order, fmtMoney) {
  const items = order.items || [];
  if (items.length > 0) {
    return items
      .map(
        (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="num">${item.quantity ?? 1}</td>
          <td class="num">${fmtMoney(item.price || 0)}</td>
          <td class="num">${fmtMoney((item.price || 0) * (item.quantity || 1))}</td>
        </tr>`
      )
      .join('');
  }

  if (Number(order.debtAmount) > 0 || order._syntheticFromTransaction) {
    const label = Number(order.cashPaid) > 0 ? 'دين متبقٍ على الطلب' : 'طلب بالدين — حساب العميل';
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">1</td>
        <td class="num">${fmtMoney(order.total || order.debtAmount || 0)}</td>
        <td class="num">${fmtMoney(order.total || order.debtAmount || 0)}</td>
      </tr>`;
  }

  return '';
}

/**
 * @param {{ customer, orders, business?, fmtMoney: (n:number)=>string }} opts
 */
export function buildCustomerStatementHtml({ customer, orders, business, fmtMoney }) {
  const businessName = business?.businessName || APP_NAME;
  const issuedAt = formatStatementDateTime(new Date());
  const statementOrders = resolveCustomerStatementOrders(customer, orders);
  const { orderCount, debtOrderCount, totalPurchases, totalCash, totalDebtOnOrders } =
    computeStatementTotals(statementOrders);

  const orderBlocks = statementOrders
    .map((order) => {
      const itemsRows = buildOrderItemsRows(order, fmtMoney);
      const hasItemsTable = itemsRows.length > 0;

      return `
      <section class="order-block">
        <div class="order-head">
          <div>
            <strong>طلب رقم ${escapeHtml(order.orderNumber || '—')}</strong>
            <span class="muted">${escapeHtml(formatOrderDateTime(order))}</span>
          </div>
          <div class="order-meta">
            <span>${escapeHtml(orderPaymentSummary(order))}</span>
            <strong class="num-inline">${fmtMoney(order.total || 0)}</strong>
          </div>
        </div>
        ${
          hasItemsTable
            ? `<table class="items">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>`
            : '<p class="muted small">لا تفاصيل أصناف — الطلب مسجّل كدين فقط.</p>'
        }
        <div class="order-foot">
          <span>إجمالي الطلب: <strong>${fmtMoney(order.total || 0)}</strong></span>
          ${Number(order.cashPaid) > 0 ? `<span>مدفوع نقداً: ${fmtMoney(order.cashPaid)}</span>` : ''}
          ${Number(order.debtAmount) > 0 ? `<span class="debt">دين على الحساب: ${fmtMoney(order.debtAmount)}</span>` : ''}
          ${order.notes ? `<span>ملاحظات: ${escapeHtml(order.notes)}</span>` : ''}
        </div>
      </section>`;
    })
    .join('');

  const txRows = (customer.transactions || [])
    .slice()
    .reverse()
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.orderNumber ? `#${t.orderNumber}` : '—')}</td>
      <td>${t.type === 'order_debt' ? 'دين من طلب' : escapeHtml(t.type || '—')}</td>
      <td class="num debt">${fmtMoney(t.amount)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>كشف حساب — ${escapeHtml(customer.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      color: #1a3328;
      background: #fff;
      padding: 28px 32px;
      max-width: 210mm;
      margin: 0 auto;
      font-size: 13px;
      line-height: 1.65;
      direction: rtl;
      text-align: right;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 3px solid #1a3328;
      margin-bottom: 24px;
    }
    .header img { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #1a3328; }
    .header .sub { color: #5a6b62; font-size: 12px; margin-top: 4px; }
    .doc-title { text-align: center; margin-bottom: 24px; }
    .doc-title h2 { font-size: 20px; color: #c17f59; font-weight: 700; }
    .doc-title p { color: #5a6b62; font-size: 12px; margin-top: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .box {
      background: #faf6ee;
      border: 1px solid rgba(26,51,40,0.1);
      border-radius: 14px;
      padding: 16px 18px;
    }
    .box h3 { font-size: 12px; color: #5a6b62; font-weight: 700; margin-bottom: 10px; }
    .box p { margin: 6px 0; font-size: 13px; }
    .box .hint { font-size: 11px; color: #8a958e; margin-top: 8px; line-height: 1.5; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat {
      background: #fff;
      border: 1px solid rgba(26,51,40,0.12);
      border-radius: 14px;
      padding: 14px;
      text-align: center;
    }
    .stat .label { font-size: 11px; color: #5a6b62; line-height: 1.4; }
    .stat .value { font-size: 17px; font-weight: 700; margin-top: 6px; direction: ltr; unicode-bidi: isolate; }
    .stat.debt .value { color: #b84233; }
    .stat.ok .value { color: #2f6b4f; }
    h4.section {
      font-size: 15px;
      font-weight: 700;
      color: #1a3328;
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #c17f59;
    }
    table.data { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    table.data th {
      background: #1a3328;
      color: #faf6ee;
      padding: 10px 8px;
      text-align: right;
      font-weight: 600;
    }
    table.data td { padding: 8px; border-bottom: 1px solid #e8e2d6; text-align: right; }
    table.data .num { text-align: left; direction: ltr; font-weight: 600; unicode-bidi: isolate; }
    table.data .debt { color: #b84233; font-weight: 700; }
    .order-block {
      border: 1px solid rgba(26,51,40,0.1);
      border-radius: 14px;
      margin-bottom: 16px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .order-head {
      background: #f5efe3;
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .order-head .muted { display: block; font-size: 11px; color: #5a6b62; font-weight: 400; margin-top: 4px; }
    .order-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px; }
    .num-inline { direction: ltr; unicode-bidi: isolate; }
    table.items { width: 100%; border-collapse: collapse; font-size: 11px; }
    table.items th { background: #ece6da; padding: 8px; text-align: right; font-weight: 600; }
    table.items td { padding: 8px; border-top: 1px solid #e8e2d6; text-align: right; }
    table.items .num { text-align: left; direction: ltr; unicode-bidi: isolate; font-weight: 600; }
    .order-foot {
      padding: 10px 14px;
      font-size: 11px;
      color: #5a6b62;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      background: #fff;
      border-top: 1px solid #f0ebe0;
    }
    .order-foot .debt { color: #b84233; font-weight: 600; }
    .muted { color: #8a958e; }
    .small { font-size: 11px; padding: 12px 14px; }
    .footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px dashed rgba(26,51,40,0.2);
      font-size: 11px;
      color: #8a958e;
      text-align: center;
      line-height: 1.6;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      font-size: 12px;
    }
    .signatures .line {
      border-top: 1px solid #1a3328;
      margin-top: 48px;
      padding-top: 8px;
      text-align: center;
    }
    @media print {
      body { padding: 12mm; }
      .order-block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1>${escapeHtml(businessName)}</h1>
      ${business?.address ? `<p class="sub">${escapeHtml(business.address)}</p>` : ''}
      ${business?.phone ? `<p class="sub">هاتف: ${escapeHtml(business.phone)}</p>` : ''}
    </div>
    <img src="${escapeHtml(logoUrl())}" alt="" crossorigin="anonymous" />
  </header>

  <div class="doc-title">
    <h2>كشف حساب العميل</h2>
    <p>تاريخ إصدار الكشف: ${escapeHtml(issuedAt)}</p>
  </div>

  <div class="grid-2">
    <div class="box">
      <h3>بيانات العميل</h3>
      <p><strong>${escapeHtml(customer.name)}</strong></p>
      ${customer.phone ? `<p>الجوال: ${escapeHtml(customer.phone)}</p>` : ''}
      ${customer.address ? `<p>العنوان: ${escapeHtml(customer.address)}</p>` : ''}
      ${customer.notes ? `<p>ملاحظات: ${escapeHtml(customer.notes)}</p>` : ''}
    </div>
    <div class="box">
      <h3>ملخص الحساب</h3>
      <p>عدد الطلبات: <strong>${orderCount}</strong>${debtOrderCount > 0 ? ` <span class="hint">(منها ${debtOrderCount} بالدين)</span>` : ''}</p>
      <p>إجمالي المشتريات: <strong>${fmtMoney(totalPurchases)}</strong></p>
      <p>إجمالي المدفوع نقداً: <strong>${fmtMoney(totalCash)}</strong></p>
      <p>إجمالي الدين على الطلبات: <strong>${fmtMoney(totalDebtOnOrders)}</strong></p>
      <p class="hint">يُحسب كل طلب مرتبط بالعميل — بما في ذلك الطلبات بالدين والدفع الجزئي.</p>
    </div>
  </div>

  <div class="summary">
    <div class="stat debt">
      <div class="label">رصيد الدين الحالي على العميل</div>
      <div class="value">${fmtMoney(customer.balance || 0)}</div>
    </div>
    <div class="stat">
      <div class="label">إجمالي المشتريات (قيمة الطلبات)</div>
      <div class="value">${fmtMoney(totalPurchases)}</div>
    </div>
    <div class="stat ok">
      <div class="label">عدد الطلبات</div>
      <div class="value">${orderCount}</div>
    </div>
  </div>

  ${
    (customer.transactions || []).length
      ? `<h4 class="section">سجل حركات الدين</h4>
  <table class="data">
    <thead><tr><th>مرجع الطلب</th><th>نوع الحركة</th><th>المبلغ</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>
  <p class="hint" style="margin-bottom:16px;font-size:11px;color:#8a958e;">كل حركة دين مرتبطة برقم طلب تظهر أيضاً في تفاصيل الطلبات أدناه.</p>`
      : ''
  }

  <h4 class="section">تفاصيل الطلبات (نقداً وديناً)</h4>
  ${statementOrders.length ? orderBlocks : '<p class="muted">لا توجد طلبات مسجّلة لهذا العميل.</p>'}

  <div class="signatures">
    <div><div class="line">توقيع المنشأة / المقهى</div></div>
    <div><div class="line">توقيع العميل</div></div>
  </div>

  <footer class="footer">
    ${escapeHtml(businessName)} — ${escapeHtml(APP_NAME)}<br/>
    كشف حساب للمتابعة المحاسبية · الأسعار بالشيكل · بدون ضريبة مضافة
  </footer>
</body>
</html>`;
}

function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة كشف الحساب');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    setTimeout(() => {
      w.focus();
      w.print();
    }, 400);
  };
}

export { resolveCustomerStatementOrders, computeStatementTotals } from './customerStatementData';

export function printCustomerAccountStatement(opts) {
  const html = buildCustomerStatementHtml(opts);
  openPrintWindow(html);
}

export async function downloadCustomerAccountStatementPdf(opts) {
  const html = buildCustomerStatementHtml(opts);
  const pdf = await renderHtmlToPdfBlob(html);
  const safeName = (opts.customer?.name || 'عميل').replace(/\s+/g, '-');
  pdf.save(`كشف-حساب-${safeName}.pdf`);
}
