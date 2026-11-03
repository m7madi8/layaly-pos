const CASH_DAY_START_HOUR = 12;

function getCashDayKey(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < CASH_DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = { CASH_DAY_START_HOUR, getCashDayKey };
