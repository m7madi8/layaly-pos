import { APP_NAME, APP_LOGO } from '../branding';
import { escapeHtml, downloadHtmlAsPdf } from './pdfExport';

function logoUrl() {
  if (typeof window === 'undefined') return APP_LOGO;
  try {
    return new URL(APP_LOGO, window.location.origin).href;
  } catch {
    return APP_LOGO;
  }
}

function formatExpenseDate(expense) {
  if (!expense?.date) return '—';
  const d = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
  return d.toLocaleDateString('ar-EG');
}

const baseStyles = `
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
  .header h1 { font-size: 22px; font-weight: 700; }
  .header .sub { color: #8a958e; font-size: 12px; margin-top: 4px; }
  .doc-title { text-align: center; margin-bottom: 24px; }
  .doc-title h2 { font-size: 20px; color: #c17f59; font-weight: 700; }
  .doc-title p { color: #5a6b62; font-size: 12px; margin-top: 6px; }
  .summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat {
    background: #faf6ee;
    border: 1px solid rgba(26,51,40,0.12);
    border-radius: 14px;
    padding: 14px;
  }
  .stat .label { font-size: 10px; color: #8a958e; }
  .stat .value { font-size: 17px; font-weight: 700; margin-top: 4px; }
  .stat.positive .value { color: #2f6b4f; }
  .stat.negative .value { color: #b84233; }
  h4.section {
    font-size: 14px;
    font-weight: 700;
    margin: 22px 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #c17f59;
  }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  table.data th {
    background: #1a3328;
    color: #faf6ee;
    padding: 8px;
    text-align: right;
    font-weight: 600;
  }
  table.data td { padding: 7px 8px; border-bottom: 1px solid #e8e2d6; }
  table.data .num { text-align: left; direction: ltr; font-weight: 600; }
  .footer {
    margin-top: 32px;
    padding-top: 14px;
    border-top: 1px dashed rgba(26,51,40,0.2);
    font-size: 11px;
    color: #8a958e;
    text-align: center;
  }
`;

/**
 * @param {object} opts — بيانات التقرير المحسوبة من شاشة التقارير
 */
export function buildBusinessReportHtml(opts) {
  const {
    business,
    periodLabel,
    fmtMoney,
    paymentMethodLabel,
    expenseCategoryLabel,
    totalRevenue,
    netSales,
    totalCost,
    grossProfit,
    grossProfitMargin,
    totalExpenses,
    netProfit,
    netProfitMargin,
    totalTransactions,
    totalItemsSoldPeriod,
    avgTransactionValue,
    totalDiscounts,
    totalComplimentsValue,
    salesByPaymentMethod,
    salesByCategory,
    sortedProducts,
    sortedProductDetails,
    filteredExpenses,
  } = opts;

  const businessName = business?.businessName || APP_NAME;
  const issuedAt = new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });

  const paymentRows = Object.entries(salesByPaymentMethod || {})
    .sort(([, a], [, b]) => b - a)
    .map(
      ([method, amount]) =>
        `<tr><td>${escapeHtml(paymentMethodLabel(method))}</td><td class="num">${escapeHtml(fmtMoney(amount))}</td></tr>`
    )
    .join('');

  const categoryRows = (salesByCategory || [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.category)}</td><td class="num">${escapeHtml(fmtMoney(row.amount))}</td><td class="num">${row.percentage.toFixed(1)}%</td></tr>`
    )
    .join('');

  const topProductRows = (sortedProducts || [])
    .map(([name, qty], i) => `<tr><td>${i + 1}. ${escapeHtml(name)}</td><td class="num">${qty}</td></tr>`)
    .join('');

  const productDetailRows = (sortedProductDetails || [])
    .map(
      ([name, data]) =>
        `<tr><td>${escapeHtml(name)}</td><td class="num">${data.quantity}</td><td class="num">${escapeHtml(fmtMoney(data.revenue))}</td></tr>`
    )
    .join('');

  const expenseRows = (filteredExpenses || [])
    .map(
      (e) =>
        `<tr><td>${formatExpenseDate(e)}</td><td>${escapeHtml(expenseCategoryLabel(e.category))}</td><td>${escapeHtml(e.description || '—')}</td><td class="num">${escapeHtml(fmtMoney(parseFloat(e.amount || 0)))}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير مالي — ${escapeHtml(periodLabel)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>${baseStyles}</style>
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
    <h2>تقرير المبيعات والأرباح</h2>
    <p>الفترة: ${escapeHtml(periodLabel)} · تاريخ الإصدار: ${escapeHtml(issuedAt)}</p>
  </div>

  <div class="summary">
    <div class="stat"><div class="label">إجمالي المبيعات</div><div class="value">${escapeHtml(fmtMoney(netSales))}</div></div>
    <div class="stat positive"><div class="label">إجمالي الربح (هامش ${grossProfitMargin.toFixed(1)}%)</div><div class="value">${escapeHtml(fmtMoney(grossProfit))}</div></div>
    <div class="stat negative"><div class="label">إجمالي المصروفات</div><div class="value">${escapeHtml(fmtMoney(totalExpenses))}</div></div>
    <div class="stat ${netProfit >= 0 ? 'positive' : 'negative'}"><div class="label">صافي الربح (هامش ${netProfitMargin.toFixed(1)}%)</div><div class="value">${escapeHtml(fmtMoney(netProfit))}</div></div>
    <div class="stat"><div class="label">عدد العمليات</div><div class="value">${totalTransactions}</div></div>
    <div class="stat"><div class="label">الأصناف المباعة</div><div class="value">${totalItemsSoldPeriod}</div></div>
    <div class="stat"><div class="label">متوسط قيمة العملية</div><div class="value">${escapeHtml(fmtMoney(avgTransactionValue))}</div></div>
    <div class="stat"><div class="label">الخصومات / الإهداءات</div><div class="value">-${escapeHtml(fmtMoney(totalDiscounts))} · ${escapeHtml(fmtMoney(totalComplimentsValue))}</div></div>
  </div>

  <p style="font-size:11px;color:#8a958e;margin-bottom:8px;">إجمالي الإيرادات: ${escapeHtml(fmtMoney(totalRevenue))} · تكلفة المبيعات: ${escapeHtml(fmtMoney(totalCost))}</p>

  <h4 class="section">المبيعات حسب طريقة الدفع</h4>
  <table class="data"><thead><tr><th>الطريقة</th><th>المبلغ</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="2">لا بيانات</td></tr>'}</tbody></table>

  <h4 class="section">المبيعات حسب القسم</h4>
  <table class="data"><thead><tr><th>القسم</th><th>المبلغ</th><th>النسبة</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="3">لا بيانات</td></tr>'}</tbody></table>

  <h4 class="section">الأكثر مبيعاً</h4>
  <table class="data"><thead><tr><th>الصنف</th><th>الكمية</th></tr></thead><tbody>${topProductRows || '<tr><td colspan="2">لا مبيعات</td></tr>'}</tbody></table>

  <h4 class="section">تفاصيل الأصناف المباعة</h4>
  <table class="data"><thead><tr><th>الصنف</th><th>الكمية</th><th>الإيراد</th></tr></thead><tbody>${productDetailRows || '<tr><td colspan="3">لا مبيعات</td></tr>'}</tbody></table>

  <h4 class="section">مصروفات الفترة</h4>
  <table class="data"><thead><tr><th>التاريخ</th><th>الفئة</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${expenseRows || '<tr><td colspan="4">لا مصروفات</td></tr>'}</tbody></table>

  <footer class="footer">${escapeHtml(businessName)} — ${escapeHtml(APP_NAME)} · تقرير مالي · الأسعار بدون ضريبة</footer>
</body>
</html>`;
}

export async function downloadBusinessReportPdf(opts) {
  const html = buildBusinessReportHtml(opts);
  const safePeriod = String(opts.periodLabel || 'تقرير').replace(/\s+/g, '-');
  const date = new Date().toISOString().split('T')[0];
  await downloadHtmlAsPdf(html, `تقرير-مالي-${safePeriod}-${date}.pdf`);
}
