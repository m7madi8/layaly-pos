/** بداية «يوم الكاش» — بعد 12 ظهراً بالتوقيت المحلي */
export const CASH_DAY_START_HOUR = 12;

export function isAfterCashDayStart(now = new Date()) {
  return now.getHours() >= CASH_DAY_START_HOUR;
}

/**
 * هل نعرض نافذة تأكيد/فتح الصندوق؟
 * — لا وردية مفتوحة
 * — أول مرة (لا ورديات): في أي وقت
 * — بعد ذلك: من 12 ظهراً فقط
 */
export function resolveDailyCashGate({ cashShifts, openShift, now = new Date() }) {
  if (openShift) {
    return { show: false, expected: 0, firstTime: false };
  }

  const shifts = cashShifts || [];
  const hasShifts = shifts.length > 0;
  if (hasShifts && !isAfterCashDayStart(now)) {
    return { show: false, expected: 0, firstTime: false };
  }

  const lastClosed = shifts
    .filter((s) => s.status === 'closed')
    .sort((a, b) => (Number(b.closedAtMs) || 0) - (Number(a.closedAtMs) || 0))[0];

  let expected = 0;
  if (lastClosed) {
    if (lastClosed.actualClosingBalance != null) {
      expected = Number(lastClosed.actualClosingBalance) || 0;
    } else if (lastClosed.expectedClosingBalance != null) {
      expected = Number(lastClosed.expectedClosingBalance) || 0;
    }
  }

  return {
    show: true,
    expected,
    firstTime: !hasShifts,
  };
}
