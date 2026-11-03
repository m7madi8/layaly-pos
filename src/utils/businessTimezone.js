/** Business calendar boundaries — Asia/Hebron (Palestine). */
export const BUSINESS_TZ = 'Asia/Hebron';

function ymdInTimeZone(date, timeZone) {
  return date.toLocaleDateString('en-CA', { timeZone });
}

/** Midnight at start of the calendar day in BUSINESS_TZ, as a Date instant. */
export function getBusinessCalendarDayStart(reference = new Date()) {
  const d = reference instanceof Date ? reference : new Date(reference);
  const dateStr = ymdInTimeZone(d, BUSINESS_TZ);
  const [y, m, day] = dateStr.split('-').map(Number);
  const low = Date.UTC(y, m - 1, day - 1, 0, 0, 0);
  const high = Date.UTC(y, m - 1, day + 1, 23, 59, 59);
  for (let t = low; t <= high; t += 60_000) {
    const probe = new Date(t);
    if (ymdInTimeZone(probe, BUSINESS_TZ) !== dateStr) continue;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(probe);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 99);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 99);
    if (hour === 0 && minute === 0) return probe;
  }
  return new Date(y, m - 1, day);
}
