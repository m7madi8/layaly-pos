import {
  collection,
  query,
  where,
  limit,
  getDocs,
  getDoc,
  doc,
  db,
} from '../../firebaseClient';
import {
  fetchDirectoryPage,
  searchDirectoryByName,
  upsertDirectoryRecord,
  removeDirectoryRecord,
  getDirectorySnapshot,
  getDirectoryHasMore,
  resetDirectory,
} from './paginatedDirectoryStore';

const KIND = 'customers';

export async function loadCustomersPage(uid, opts) {
  return fetchDirectoryPage(uid, KIND, opts);
}

export async function searchCustomers(uid, term) {
  const local = getDirectorySnapshot(uid, KIND).filter((c) => {
    const s = String(term || '').trim().toLowerCase();
    if (!s) return true;
    return (
      String(c.name || '').toLowerCase().includes(s) ||
      String(c.phone || '').replace(/\D/g, '').includes(s.replace(/\D/g, ''))
    );
  });
  if (String(term || '').trim().length >= 2) {
    const remote = await searchDirectoryByName(uid, KIND, term, { max: 30 });
    const map = new Map(local.map((c) => [c.id, c]));
    remote.forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  }
  return local;
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
  resetDirectory(uid, KIND);
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

/** Billed reads: only debtors — used for dashboard totals (not full customer list). */
export async function loadCustomersWithPositiveBalance(uid, { max = 200 } = {}) {
  if (!uid) return { customers: [], total: 0, count: 0 };
  const q = query(
    collection(db, 'users', uid, 'customers'),
    where('balance', '>', 0),
    limit(max)
  );
  const snap = await getDocs(q);
  const customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const total = customers.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
  return { customers, total: Math.round(total * 100) / 100, count: customers.length };
}

/** Before debt checkout — authoritative balance from server. */
export async function fetchCustomerAuthoritative(uid, customerId) {
  if (!uid || !customerId) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'customers', customerId));
  if (!snap.exists()) return null;
  const row = { id: snap.id, ...snap.data() };
  upsertCustomerLocal(uid, row);
  return row;
}