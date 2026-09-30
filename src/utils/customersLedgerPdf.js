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

/**
 * ملخص جميع العملاء مع أرصدتهم — للمراجعة المحاسبية
 */
export function buildCustomersLedgerHtml({ customers, business, fmtMoney }) {
  const businessName = business?.businessName || APP_NAME;
  const issuedAt = new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
  const sorted = [...(customers || [])].sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const totalDebt = sorted.reduce((s, c) => s + Number(c.balance || 0), 0);

  const rows = sorted
    .map(
      (c) =>
        `<tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.phone || '—')}</td>
          <td class="num debt">${escapeHtml(fmtMoney(c.balance || 0))}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>ملخص حسابات العملاء</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', sans-serif; color: #1a3328; padding: 28px 32px; font-size: 13px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    .sub { color: #8a958e; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #1a3328; color: #fff; padding: 10px; text-align: right; }
    td { padding: 8px; border-bottom: 1px solid #e8e2d6; }
    .num { text-align: left; direction: ltr; font-weight: 600; }
    .debt { color: #b84233; }
    .total { margin-top: 16px; font-weight: 700; text-align: left; direction: ltr; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a3328; padding-bottom: 16px; }
    .header img { width: 56px; height: 56px; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ملخص حسابات العملاء (الديون)</h1>
      <p class="sub">${escapeHtml(businessName)} · ${escapeHtml(issuedAt)}</p>
    </div>
    <img src="${escapeHtml(logoUrl())}" alt="" crossorigin="anonymous" />
  </div>
  <table>
    <thead><tr><th>العميل</th><th>الجوال</th><th>رصيد الدين</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">لا عملاء</td></tr>'}</tbody>
  </table>
  <p class="total">إجمالي الديون: ${escapeHtml(fmtMoney(totalDebt))}</p>
  <p style="margin-top:24px;font-size:11px;color:#8a958e;text-align:center">${escapeHtml(APP_NAME)} — لكشف تفصيلي لكل عميل استخدم «كشف حساب PDF» من ملف العميل</p>
</body>
</html>`;
}

export async function downloadCustomersLedgerPdf(opts) {
  const html = buildCustomersLedgerHtml(opts);
  const date = new Date().toISOString().split('T')[0];
  await downloadHtmlAsPdf(html, `ملخص-حسابات-العملاء-${date}.pdf`);
}
