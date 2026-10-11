/** بداية «يوم الكاش» للشفت الأول بعد إغلاق الشفت النهائي */
export const CASH_DAY_START_HOUR = 12;

export function isAfterCashDayStart(now = new Date()) {
  return now.getHours() >= CASH_DAY_START_HOUR;
}

export function shiftPeriodLabel(period) {
  return Number(period) === 2 ? 'الشفت الثاني' : 'الشفت الأول';
}

export function getLastClosedCashShift(shifts = []) {
  return (
    shifts
      .filter((s) => s.status === 'closed')
      .sort((a, b) => (Number(b.closedAtMs) || 0) - (Number(a.closedAtMs) || 0))[0] || null
  );
}

/** الشفت التالي: بعد إغلاق الأول → الثاني، بعد إغلاق الثاني → الأول */
export function resolveNextShiftPeriod(lastClosed) {
  if (!lastClosed) return 1;
  const p = Number(lastClosed.shiftPeriod) || 1;
  return p === 1 ? 2 : 1;
}

/**
 * نافذة فتح الصندوق:
 * — الشفت 1: أول مرة فوراً، أو بعد 12 ظهراً بعد إغلاق الشفت النهائي
 * — الشفت 2: فوراً بعد إغلاق الشفت الأول (تسكير كاش)
 */
export function resolveDailyCashGate({ cashShifts, openShift, now = new Date() }) {
  if (openShift) {
    return { show: false, expected: 0, firstTime: false, shiftPeriod: 1 };
  }

  const shifts = cashShifts || [];
  const hasShifts = shifts.length > 0;
  const firstTime = !hasShifts;
  const lastClosed = getLastClosedCashShift(shifts);
  const shiftPeriod = resolveNextShiftPeriod(lastClosed);

  let expected = 0;
  if (lastClosed) {
    if (lastClosed.actualClosingBalance != null) {
      expected = Number(lastClosed.actualClosingBalance) || 0;
    } else if (lastClosed.expectedClosingBalance != null) {
      expected = Number(lastClosed.expectedClosingBalance) || 0;
    }
  }

  if (shiftPeriod === 2) {
    return { show: true, expected, firstTime: false, shiftPeriod: 2 };
  }

  if (firstTime) {
    return { show: true, expected: 0, firstTime: true, shiftPeriod: 1 };
  }

  if (!isAfterCashDayStart(now)) {
    return { show: false, expected, firstTime: false, shiftPeriod: 1 };
  }

  return { show: true, expected, firstTime: false, shiftPeriod: 1 };
}
