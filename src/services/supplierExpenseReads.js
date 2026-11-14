import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  cachedGetDocs,
  updateDoc,
  serverTimestamp,
} from '../firebaseClient';
import { computeSupplierTotalPayable, roundMoney } from '../utils/supplierAccounting';
import { resolveExpenseSection } from '../expenseConfig';

const PAGE = 25;

const expensesCol = (uid) => collection(db, 'users', uid, 'expenses');
const supplierRef = (uid, id) => doc(db, 'users', uid, 'suppliers', id);

/** @type {Map<string, { pageCursors: object[], pageCache: Map<string, object[]>, items: object[], hasMore: boolean }>} */
const supplierPages = new Map();

function pageKey(uid, supplierId) {
  return `${uid}:${supplierId}`;
}

export function invalidateSupplierExpensePages(uid, supplierId) {
  if (supplierId) supplierPages.delete(pageKey(uid, supplierId));
  else {
    for (const k of supplierPages.keys()) {
      if (k.startsWith(`${uid}:`)) supplierPages.delete(k);
    }
  }
}

export async function fetchSupplierExpensesPage(uid, supplierId, { pageSize = PAGE, force = false } = {}) {
  const sid = String(supplierId || '').trim();
  if (!uid || !sid) return { items: [], hasMore: false };

  const key = pageKey(uid, sid);
  let state = supplierPages.get(key);
  if (!state) {
    state = { pageCursors: [], pageCache: new Map(), items: [], hasMore: true };
    supplierPages.set(key, state);
  }

  const pageIndex = state.pageCursors.length;
  const cacheId = `page:${pageIndex}`;
  if (!force && state.pageCache.has(cacheId)) {
    return { items: state.items, hasMore: state.hasMore };
  }

  let q = query(
    expensesCol(uid),
    where('supplierId', '==', sid),
    orderBy('date', 'desc'),
    limit(pageSize)
  );
  if (pageIndex > 0 && state.pageCursors[pageIndex - 1]) {
    q = query(
      expensesCol(uid),
      where('supplierId', '==', sid),
      orderBy('date', 'desc'),
      startAfter(state.pageCursors[pageIndex - 1]),
      limit(pageSize)
    );
  }

  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (snap.docs.length) state.pageCursors.push(snap.docs[snap.docs.length - 1]);
  state.pageCache.set(cacheId, rows);
  state.hasMore = snap.docs.length >= pageSize;
  const map = new Map(state.items.map((r) => [r.id, r]));
  rows.forEach((r) => map.set(r.id, r));
  state.items = Array.from(map.values());
  return { items: state.items, hasMore: state.hasMore };
}

export async function fetchAllSupplierExpenses(uid, supplierId) {
  const sid = String(supplierId || '').trim();
  if (!uid || !sid) return [];
  const q = query(expensesCol(uid), where('supplierId', '==', sid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Paginate until full supplier ledger is loaded (for reconciliation preview only). */
export async function fetchCompleteSupplierExpenseLedger(uid, supplierId, { pageSize = PAGE } = {}) {
  const sid = String(supplierId || '').trim();
  if (!uid || !sid) return { expenses: [], ledgerComplete: true, pageCount: 0 };

  const expenses = [];
  let cursor = null;
  let pageCount = 0;
  let hasMore = true;

  while (hasMore) {
    let q = query(
      expensesCol(uid),
      where('supplierId', '==', sid),
      orderBy('date', 'desc'),
      limit(pageSize)
    );
    if (cursor) {
      q = query(
        expensesCol(uid),
        where('supplierId', '==', sid),
        orderBy('date', 'desc'),
        startAfter(cursor),
        limit(pageSize)
      );
    }
    const snap = await getDocs(q);
    pageCount += 1;
    snap.docs.forEach((d) => expenses.push({ id: d.id, ...d.data() }));
    hasMore = snap.docs.length >= pageSize;
    cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    if (pageCount > 500) {
      return { expenses, ledgerComplete: false, pageCount };
    }
  }

  return { expenses, ledgerComplete: true, pageCount };
}

/**
 * Read-only reconciliation preview. Never writes supplier.balance.
 * @returns {{ state: 'VERIFIED'|'INCOMPLETE', computedBalance, storedBalance, expenseCount, ledgerComplete, mismatch }}
 */
export async function previewSupplierReconciliation(uid, supplierId) {
  const snap = await getDoc(supplierRef(uid, supplierId));
  if (!snap.exists()) {
    return {
      state: 'VERIFIED',
      computedBalance: 0,
      storedBalance: null,
      expenseCount: 0,
      ledgerComplete: true,
      mismatch: false,
    };
  }
  const supplier = { id: snap.id, ...snap.data() };
  const { expenses, ledgerComplete } = await fetchCompleteSupplierExpenseLedger(uid, supplierId);
  const computed = computeSupplierTotalPayable(supplier, expenses, supplierId);
  const stored = supplier.balance != null && supplier.balance !== '' ? roundMoney(supplier.balance) : null;
  const mismatch =
    ledgerComplete && stored != null && Math.abs(stored - computed) > 0.009;

  return {
    state: ledgerComplete ? 'VERIFIED' : 'INCOMPLETE',
    computedBalance: computed,
    storedBalance: stored,
    expenseCount: expenses.length,
    ledgerComplete,
    mismatch,
  };
}

/** Explicit balance correction — requires complete ledger; writes audit fields only when applied. */
export async function applySupplierBalanceCorrection(
  uid,
  supplierId,
  { balance, actorLabel = '', reason = '' } = {}
) {
  const preview = await previewSupplierReconciliation(uid, supplierId);
  if (!preview.ledgerComplete || preview.state === 'INCOMPLETE') {
    throw new Error('لا يمكن تطبيق تصحيح الرصيد قبل اكتمال سجل المصروفات للتاجر.');
  }
  const next = roundMoney(balance);
  await updateDoc(supplierRef(uid, supplierId), {
    balance: next,
    balanceCorrectionAtMs: Date.now(),
    balanceCorrectionBy: String(actorLabel || '').slice(0, 120),
    balanceCorrectionReason: String(reason || '').slice(0, 500),
    balanceReconciledAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
  return { balance: next, preview };
}

/** @deprecated Use previewSupplierReconciliation — no automatic writes. */
export async function reconcileSupplierBalanceFromFirestore(uid, supplierId) {
  return previewSupplierReconciliation(uid, supplierId);
}

let tradersPurchaseInflight = null;

const TRADERS_PURCHASE_SNAPSHOT_CAP = 400;

/** One-shot purchase total for traders card — may be PARTIAL (not authoritative historical total). */
export async function fetchTradersPurchaseTotalSnapshot(uid, { ttlMs = 120_000, force = false } = {}) {
  if (!uid) {
    return {
      total: 0,
      dataState: 'VERIFIED',
      docCount: 0,
      cappedAt: TRADERS_PURCHASE_SNAPSHOT_CAP,
      isPartial: false,
    };
  }
  const q = query(expensesCol(uid), orderBy('date', 'desc'), limit(TRADERS_PURCHASE_SNAPSHOT_CAP));
  if (!force && tradersPurchaseInflight) return tradersPurchaseInflight;
  tradersPurchaseInflight = cachedGetDocs(getDocs, q, { ttlMs, force }).then((snap) => {
    const docCount = snap.docs.length;
    const total = snap.docs.reduce((s, d) => {
      const e = d.data();
      if (resolveExpenseSection(e) !== 'purchase') return s;
      return s + (parseFloat(e.amount) || 0);
    }, 0);
    tradersPurchaseInflight = null;
    const isPartial = docCount >= TRADERS_PURCHASE_SNAPSHOT_CAP;
    return {
      total: roundMoney(total),
      dataState: isPartial ? 'INCOMPLETE_SNAPSHOT' : 'VERIFIED_SNAPSHOT',
      docCount,
      cappedAt: TRADERS_PURCHASE_SNAPSHOT_CAP,
      isPartial,
    };
  });
  return tradersPurchaseInflight;
}

export function invalidateTradersPurchaseSnapshot() {
  tradersPurchaseInflight = null;
}

export function clearSupplierExpenseReadCaches() {
  supplierPages.clear();
  tradersPurchaseInflight = null;
}