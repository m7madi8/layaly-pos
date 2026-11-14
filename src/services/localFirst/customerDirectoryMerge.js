/** دمج قوائم العملاء في الذاكرة — يفضّل السجل الأغنى مالياً دون الكتابة على Firestore. */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function balanceScore(row) {
  const b = row?.balance;
  if (b === undefined || b === null || b === '') return -1;
  const n = Number(b);
  return Number.isFinite(n) ? 1 : -1;
}

function txLen(row) {
  return Array.isArray(row?.transactions) ? row.transactions.length : 0;
}

/** يدمج عميلين بنفس الـ id؛ يفضّل الرصيد المعرّف والسجل الأطول. */
export function mergeCustomerPair(prev, next) {
  if (!prev) return next ? { ...next } : null;
  if (!next) return { ...prev };
  const merged = { ...prev, ...next };
  const pickBalanceFrom =
    balanceScore(next) > balanceScore(prev) ? next : balanceScore(prev) > balanceScore(next) ? prev : next;
  if (balanceScore(pickBalanceFrom) >= 0) {
    merged.balance = pickBalanceFrom.balance;
  }
  const txSource = txLen(next) >= txLen(prev) ? next : prev;
  if (Array.isArray(txSource?.transactions)) {
    merged.transactions = txSource.transactions;
  }
  return merged;
}

/** @param {object[][]} lists */
export function mergeCustomerDirectoryRows(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      if (!row?.id) continue;
      map.set(row.id, mergeCustomerPair(map.get(row.id), row));
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar')
  );
}

export function sumPositiveBalances(customers = []) {
  const total = (customers || []).reduce((sum, c) => {
    const n = money(c?.balance);
    return n > 0 ? sum + n : sum;
  }, 0);
  return { total: money(total), count: (customers || []).filter((c) => money(c?.balance) > 0).length };
}