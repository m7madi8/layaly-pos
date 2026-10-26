import { APP_NAME, SYSTEM_WHATSAPP_DISPLAY, SYSTEM_WHATSAPP_E164 } from '../branding';
import { formatOrderDateTime, formatStatementDateTime } from './customerStatementData';

const RECENT_ORDERS_LIMIT = 8;

/**
 * يحوّل رقماً محلياً أو دولياً إلى صيغة واتساب بدون + (مثل 9705xxxxxxxx).
 * @returns {string|null}
 */
export function toWhatsAppDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('970') || digits.startsWith('972')) {
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
  }

  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    digits = `970${digits.slice(1)}`;
  }

  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export function buildCustomerStatementWhatsAppText({
  customer,
  orders = [],
  business,
  fmtMoney,
  totals,
  legacyDebtTotal = 0,
}) {
  const businessName = business?.businessName || APP_NAME;
  const balance = Number(customer?.balance || 0);
  const lines = [
    `كشف حساب — ${businessName}`,
    `العميل: ${customer?.name || '—'}`,
    `التاريخ: ${formatStatementDateTime(new Date())}`,
    '',
    `الرصيد المستحق: ${fmtMoney(balance)}`,
  ];

  if (legacyDebtTotal > 0) {
    lines.push(`منها دين قديم: ${fmtMoney(legacyDebtTotal)}`);
  }

  if (totals) {
    lines.push(`عدد الطلبات: ${totals.orderCount}`);
    lines.push(`إجمالي المشتريات: ${fmtMoney(totals.totalPurchases || 0)}`);
    if (Number(totals.totalDiscounts) > 0) {
      lines.push(`إجمالي الخصومات: ${fmtMoney(totals.totalDiscounts)}`);
    }
  }

  const recent = orders.slice(0, RECENT_ORDERS_LIMIT);
  if (recent.length) {
    lines.push('', 'آخر الطلبات:');
    for (const order of recent) {
      const debt = Number(order.debtAmount || 0);
      const debtNote = debt > 0 ? ` · دين ${fmtMoney(debt)}` : '';
      lines.push(
        `• #${order.orderNumber || '—'} · ${formatOrderDateTime(order)} · ${fmtMoney(order.total || 0)}${debtNote}`
      );
    }
    if (orders.length > recent.length) {
      lines.push(`… و${orders.length - recent.length} طلبات أقدم في السجل`);
    }
  }

  lines.push('', `للاستفسار أو السداد: واتساب ${SYSTEM_WHATSAPP_DISPLAY}`);
  return lines.join('\n');
}

export function buildCustomerStatementWhatsAppUrl(customerPhone, text) {
  const digits = toWhatsAppDigits(customerPhone);
  if (!digits || !text) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function systemWhatsAppChatUrl(text) {
  const body = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${SYSTEM_WHATSAPP_E164}${body}`;
}
