import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { APP_NAME, APP_LOGO } from '../branding';
import { orderStatusLabel, paymentTypeLabel, paymentMethodLabel } from '../i18n';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatOrderDate(order) {
  if (!order?.timestamp) return '—';
  const d = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
  return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

function paymentLabel(order) {
  return (
    paymentTypeLabel(order.paymentType) ||
    paymentMethodLabel(order.paymentMethod) ||
    '—'
  );
}

function logoUrl() {
  if (typeof window === 'undefined') return APP_LOGO;
  try {
    return new URL(APP_LOGO, window.location.origin).href;
  } catch {
    return APP_LOGO;
  }
}

/**
 * @param {{ customer, orders, business?, fmtMoney: (n:number)=>string }} opts
 */
export function buildCustomerStatementHtml({ customer, orders, business, fmtMoney }) {
  const businessName = business?.businessName || APP_NAME;
  const issuedAt = new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
  const sortedOrders = [...orders].sort((a, b) => {
    const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
    const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
    return tb - ta;
  });

  const totalPurchases = sortedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalCash = sortedOrders.reduce((s, o) => s + Number(o.cashPaid || 0), 0);
  const totalDebtLines = sortedOrders.reduce((s, o) => s + Number(o.debtAmount || 0), 0);

  const orderBlocks = sortedOrders
    .map((order) => {
      const items = order.items || [];
      const itemsRows = items
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

      return `
      <section class="order-block">
        <div class="order-head">
          <div>
            <strong>طلب #${escapeHtml(order.orderNumber || '—')}</strong>
            <span class="muted">${formatOrderDate(order)}</span>
          </div>
          <div class="order-meta">
            <span>${escapeHtml(paymentLabel(order))}</span>
            <span>${escapeHtml(orderStatusLabel(order.status))}</span>
            <strong>${fmtMoney(order.total)}</strong>
          </div>
        </div>
        ${
          items.length
            ? `<table class="items">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>`
            : '<p class="muted small">لا توجد أصناف مسجّلة</p>'
        }
        <div class="order-foot">
          ${Number(order.cashPaid) > 0 ? `<span>كاش: ${fmtMoney(order.cashPaid)}</span>` : ''}
          ${Number(order.debtAmount) > 0 ? `<span class="debt">دين: ${fmtMoney(order.debtAmount)}</span>` : ''}
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
      <td>#${escapeHtml(t.orderNumber || '—')}</td>
      <td>${t.type === 'order_debt' ? 'دين على الطلب' : escapeHtml(t.type)}</td>
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
      font-family: 'Cairo', sans-serif;
      color: #1a3328;
      background: #fff;
      padding: 28px 32px;
      max-width: 210mm;
      margin: 0 auto;
      font-size: 13px;
      line-height: 1.5;
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
    .header .sub { color: #8a958e; font-size: 12px; margin-top: 4px; }
    .doc-title {
      text-align: center;
      margin-bottom: 24px;
    }
    .doc-title h2 {
      font-size: 20px;
      color: #c17f59;
      font-weight: 700;
    }
    .doc-title p { color: #5a6b62; font-size: 12px; margin-top: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .box {
      background: #faf6ee;
      border: 1px solid rgba(26,51,40,0.1);
      border-radius: 14px;
      padding: 16px 18px;
    }
    .box h3 { font-size: 11px; color: #8a958e; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.02em; }
    .box p { margin: 4px 0; }
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
    .stat .label { font-size: 10px; color: #8a958e; }
    .stat .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .stat.debt .value { color: #b84233; }
    .stat.ok .value { color: #2f6b4f; }
    h4.section {
      font-size: 14px;
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
    table.data td { padding: 8px; border-bottom: 1px solid #e8e2d6; }
    table.data .num { text-align: left; direction: ltr; font-weight: 600; }
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
    .order-head .muted { display: block; font-size: 11px; color: #8a958e; font-weight: 400; margin-top: 2px; }
    .order-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 12px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 11px; }
    table.items th { background: #ece6da; padding: 8px; text-align: right; font-weight: 600; }
    table.items td { padding: 8px; border-top: 1px solid #e8e2d6; }
    table.items .num { text-align: left; direction: ltr; }
    .order-foot {
      padding: 10px 14px;
      font-size: 11px;
      color: #5a6b62;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      background: #fff;
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
      <p class="sub">${escapeHtml(business?.address || '')}</p>
      <p class="sub">${business?.phone ? `هاتف: ${escapeHtml(business.phone)}` : ''}</p>
    </div>
    <img src="${escapeHtml(logoUrl())}" alt="" crossorigin="anonymous" />
  </header>

  <div class="doc-title">
    <h2>كشف حساب العميل</h2>
    <p>تاريخ الإصدار: ${escapeHtml(issuedAt)}</p>
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
      <p>عدد الطلبات: <strong>${sortedOrders.length}</strong></p>
      <p>إجمالي المشتريات: <strong>${fmtMoney(totalPurchases)}</strong></p>
      <p>إجمالي الكاش: <strong>${fmtMoney(totalCash)}</strong></p>
      <p>مجموع الديون على الطلبات: <strong>${fmtMoney(totalDebtLines)}</strong></p>
    </div>
  </div>

  <div class="summary">
    <div class="stat debt">
      <div class="label">رصيد الدين الحالي</div>
      <div class="value">${fmtMoney(customer.balance || 0)}</div>
    </div>
    <div class="stat">
      <div class="label">إجمالي المشتريات</div>
      <div class="value">${fmtMoney(totalPurchases)}</div>
    </div>
    <div class="stat ok">
      <div class="label">عدد الطلبات</div>
      <div class="value">${sortedOrders.length}</div>
    </div>
  </div>

  ${
    (customer.transactions || []).length
      ? `<h4 class="section">حركات الدين</h4>
  <table class="data">
    <thead><tr><th>الطلب</th><th>النوع</th><th>المبلغ</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>`
      : ''
  }

  <h4 class="section">تفاصيل الطلبات والأصناف</h4>
  ${sortedOrders.length ? orderBlocks : '<p class="muted">لا توجد طلبات مسجّلة لهذا العميل.</p>'}

  <div class="signatures">
    <div><div class="line">توقيع المنشأة</div></div>
    <div><div class="line">توقيع العميل</div></div>
  </div>

  <footer class="footer">
    ${escapeHtml(businessName)} — ${escapeHtml(APP_NAME)} · هذا الكشف للاطلاع والمتابعة · الأسعار بدون ضريبة
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

async function renderHtmlToPdfBlob(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((resolve) => {
    iframe.onload = resolve;
    setTimeout(resolve, 800);
  });

  const body = iframe.contentDocument.body;
  const canvas = await html2canvas(body, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: body.scrollWidth,
    windowHeight: body.scrollHeight,
  });

  document.body.removeChild(iframe);

  const imgWidth = 210;
  const pageHeight = 297;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  const imgData = canvas.toDataURL('image/png');

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf;
}

/** فتح نافذة طباعة (حفظ كـ PDF من المتصفح) */
export function printCustomerAccountStatement(opts) {
  const html = buildCustomerStatementHtml(opts);
  openPrintWindow(html);
}

/** تنزيل ملف PDF مباشرة */
export async function downloadCustomerAccountStatementPdf(opts) {
  const html = buildCustomerStatementHtml(opts);
  const pdf = await renderHtmlToPdfBlob(html);
  const safeName = (opts.customer?.name || 'عميل').replace(/\s+/g, '-');
  pdf.save(`كشف-حساب-${safeName}.pdf`);
}
