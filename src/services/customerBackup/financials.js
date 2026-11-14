const FINANCIAL_HINT = /balance|transaction|repay|payment|debt/i;

function isFinancialKey(key) {
  return FINANCIAL_HINT.test(String(key));
}

export function financialSubset(data) {
  const source = data || {};
  const out = {};
  Object.keys(source).forEach((key) => {
    if (isFinancialKey(key)) out[key] = source[key];
  });
  return out;
}

function timestampMillis(value) {
  if (!value || typeof value !== 'object' || value.__firestoreType !== 'timestamp') return null;
  if (typeof value.seconds !== 'number' || typeof value.nanoseconds !== 'number') return null;
  return value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
}

/** أحدث وقت موثوق: طابع Firestore أو حقل ينتهي بـ Ms. لا نخمن الثواني. */
export function latestActivityMs(data) {
  let best = null;
  Object.entries(data || {}).forEach(([key, value]) => {
    let ms = null;
    if (value && value.__firestoreType === 'timestamp') ms = timestampMillis(value);
    else if (typeof value === 'number' && Number.isFinite(value) && /Ms$/.test(key)) ms = value;
    else if (typeof value === 'string' && /At$/.test(key)) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) ms = parsed;
    }
    if (ms != null && (best == null || ms > best)) best = ms;
  });
  return best;
}

export function transactionIds(data) {
  const list = Array.isArray(data?.transactions) ? data.transactions : [];
  return list.map((row) => (row && row.id != null ? String(row.id) : null)).filter(Boolean);
}

/**
 * مجموع الديون من حقل balance المخزّن فقط.
 * الرصيد الغائب لا يُحسب صفراً، ويُسقط صلاحية الإجمالي.
 */
export function summarizeStoredBalances(documents) {
  let cents = 0;
  let debtorCount = 0;
  let missingBalanceCount = 0;
  documents.forEach((doc) => {
    const data = doc?.data || {};
    if (!Object.prototype.hasOwnProperty.call(data, 'balance') || data.balance === null || data.balance === '') {
      missingBalanceCount += 1;
      return;
    }
    if (typeof data.balance !== 'number' || !Number.isFinite(data.balance)) {
      missingBalanceCount += 1;
      return;
    }
    if (data.balance > 0) {
      debtorCount += 1;
      cents += Math.round(data.balance * 100);
    }
  });
  const authoritative = missingBalanceCount === 0;
  return {
    debtorCount,
    missingBalanceCount,
    knownPositiveDebt: cents / 100,
    totalOutstandingDebt: authoritative ? cents / 100 : null,
    outstandingDebtAuthoritative: authoritative,
  };
}
