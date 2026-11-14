import {
  collection,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  getDocs,
  getDoc,
  doc,
  db,
} from '../../firebaseClient';
import {
  fetchDirectoryPage,
  searchDirectoryByName,
  searchDirectoryByPhone,
  upsertDirectoryRecord,
  removeDirectoryRecord,
  getDirectorySnapshot,
  getDirectoryHasMore,
  resetDirectory,
  getDirectoryLoading,
  getDirectoryError,
} from './paginatedDirectoryStore';
import { mergeCustomerDirectoryRows, sumPositiveBalances } from './customerDirectoryMerge';

const KIND = 'customers';
const DEBTOR_PAGE_SIZE = 100;
const DEBTOR_MAX_PAGES = 50;
const DEBTOR_SUMMARY_TTL_MS = 60_000;

/** @type {Map<string, { expires: number, data: object, inflight?: Promise<object> }>} */
const debtorSummaryCache = new Map();

export async function loadCustomersPage(uid, opts) {
  return fetchDirectoryPage(uid, KIND, opts);
}

export function getCustomersDirectoryLoading(uid) {
  return getDirectoryLoading(uid, KIND);
}

export function getCustomersDirectoryError(uid) {
  return getDirectoryError(uid, KIND);
}

function filterCustomersLocal(uid, term) {
  const s = String(term || '').trim().toLowerCase();
  if (!s) return getDirectorySnapshot(uid, KIND);
  const digits = s.replace(/\D/g, '');
  return getDirectorySnapshot(uid, KIND).filter((c) => {
    if ((c.name || '').toLowerCase().includes(s)) return true;
    if (digits.length >= 2 && String(c.phone || '').replace(/\D/g, '').includes(digits)) return true;
    return false;
  });
}

/**
 * بحث عميل — بادئة الاسم (Firestore) + بادئة الجوال إن وُجد.
 * لا يضمن البحث «يحتوي على» وسط الاسم إلا ضمن الصفحات المحمّلة محلياً.
 */
export async function searchCustomers(uid, term, { debtorSnapshot = [] } = {}) {
  const trimmed = String(term || '').trim();
  const local = filterCustomersLocal(uid, trimmed);
  if (trimmed.length < 2) {
    return mergeCustomerDirectoryRows(local, debtorSnapshot);
  }
  const digits = trimmed.replace(/\D/g, '');
  const digitHeavy = digits.length >= 2;
  let byPhone = [];
  try {
    byPhone = digitHeavy ? await searchDirectoryByPhone(uid, KIND, digits, { max: 40 }) : [];
  } catch (err) {
    console.warn('Customer phone prefix search unavailable:', err);
  }
  let byName = [];
  try {
    byName = await searchDirectoryByName(uid, KIND, trimmed, { max: 40 });
  } catch (err) {
    console.warn('Customer name prefix search failed:', err);
  }
  const remoteLocal = mergeCustomerDirectoryRows(byName, byPhone);
  return mergeCustomerDirectoryRows(local, remoteLocal, debtorSnapshot);
}

export function upsertCustomerLocal(uid, customer) {
  upsertDirectoryRecord(uid, KIND, customer);
}

export function removeCustomerLocal(uid, customerId) {
  removeDirectoryRecord(uid, KIND, customerId);
}

export function getCustomersLocal(uid) {
  return getDirectorySnapshot(uid, KIND);
}

export function customersHasMore(uid) {
  return getDirectoryHasMore(uid, KIND);
}

export function resetCustomerDirectory(uid) {
  storesDeleteDebtorCache(uid);
  resetDirectory(uid, KIND);
}

function storesDeleteDebtorCache(uid) {
  debtorSummaryCache.delete(uid);
}

/** Ledger PDF / exports — sequential pages (cached). */
export async function loadAllCustomerPages(uid, { pageSize = 50, maxPages = 40 } = {}) {
  let pages = 0;
  while (customersHasMore(uid) && pages < maxPages) {
    await fetchDirectoryPage(uid, KIND, { pageSize });
    pages += 1;
  }
  return getDirectorySnapshot(uid, KIND);
}

/**
 * استعلام صفحي لجميع العملاء ذوي الرصيد الموجب — لا اقتطاع صامت عند > 200.
 */
export async function loadAllCustomersWithPositiveBalance(uid, { pageSize = DEBTOR_PAGE_SIZE, force = false } = {}) {
  if (!uid) {
    return {
      customers: [],
      total: 0,
      count: 0,
      complete: true,
      pagesRead: 0,
      error: null,
    };
  }

  const now = Date.now();
  const cached = debtorSummaryCache.get(uid);
  if (!force && cached?.data && cached.expires > now && !cached.data.error) {
    return cached.data;
  }
  if (!force && cached?.inflight) {
    return cached.inflight;
  }

  const run = (async () => {
    const customers = [];
    let lastDoc = null;
    let pagesRead = 0;
    let complete = false;
    let queryError = null;

    try {
      for (let page = 0; page < DEBTOR_MAX_PAGES; page += 1) {
        let q = query(
          collection(db, 'users', uid, 'customers'),
          where('balance', '>', 0),
          orderBy('balance', 'desc'),
          limit(pageSize)
        );
        if (lastDoc) {
          q = query(
            collection(db, 'users', uid, 'customers'),
            where('balance', '>', 0),
            orderBy('balance', 'desc'),
            startAfter(lastDoc),
            limit(pageSize)
          );
        }
        const snap = await getDocs(q);
        pagesRead += 1;
        if (snap.empty) {
          complete = true;
          break;
        }
        snap.docs.forEach((d) => customers.push({ id: d.id, ...d.data() }));
        if (snap.docs.length < pageSize) {
          complete = true;
          break;
        }
        lastDoc = snap.docs[snap.docs.length - 1];
      }
      if (!complete && pagesRead >= DEBTOR_MAX_PAGES) {
        queryError = new Error(
          'تجاوز عدد المدينين الحد المسموح للاستعلام — راجع الفهرس والحد MAX.'
        );
      }
    } catch (err) {
      queryError = err;
    }

    const { total, count } = sumPositiveBalances(customers);
    const payload = {
      customers,
      total,
      count,
      complete: complete && !queryError,
      pagesRead,
      error: queryError,
    };
    debtorSummaryCache.set(uid, { expires: Date.now() + DEBTOR_SUMMARY_TTL_MS, data: payload });
    return payload;
  })();

  debtorSummaryCache.set(uid, {
    ...(cached || {}),
    expires: now + DEBTOR_SUMMARY_TTL_MS,
    inflight: run,
  });
  const result = await run;
  debtorSummaryCache.set(uid, { expires: Date.now() + DEBTOR_SUMMARY_TTL_MS, data: result });
  return result;
}

/** @deprecated استخدم loadAllCustomersWithPositiveBalance — يبقى للتوافق. */
export async function loadCustomersWithPositiveBalance(uid, { max = 200 } = {}) {
  const full = await loadAllCustomersWithPositiveBalance(uid, { pageSize: Math.min(max, DEBTOR_PAGE_SIZE) });
  return {
    customers: full.customers,
    total: full.total,
    count: full.count,
    complete: full.complete,
    error: full.error,
  };
}

export function invalidateCustomerDebtorSummary(uid) {
  storesDeleteDebtorCache(uid);
}

/** قبل دفع/دين — رصيد خادم حديث. */
export async function fetchCustomerAuthoritative(uid, customerId) {
  if (!uid || !customerId) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'customers', customerId));
  if (!snap.exists()) return null;
  const row = { id: snap.id, ...snap.data() };
  upsertCustomerLocal(uid, row);
  invalidateCustomerDebtorSummary(uid);
  return row;
}