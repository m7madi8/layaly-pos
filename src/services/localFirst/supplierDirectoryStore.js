import {
  fetchDirectoryPage,
  searchDirectoryByName,
  upsertDirectoryRecord,
  removeDirectoryRecord,
  getDirectorySnapshot,
  getDirectoryHasMore,
  resetDirectory,
} from './paginatedDirectoryStore';

const KIND = 'suppliers';

export async function loadSuppliersPage(uid, opts) {
  return fetchDirectoryPage(uid, KIND, opts);
}

export async function searchSuppliers(uid, term) {
  const local = getDirectorySnapshot(uid, KIND);
  if (String(term || '').trim().length >= 2) {
    const remote = await searchDirectoryByName(uid, KIND, term, { max: 30 });
    const map = new Map(local.map((s) => [s.id, s]));
    remote.forEach((s) => map.set(s.id, s));
    return Array.from(map.values());
  }
  return local;
}

export function upsertSupplierLocal(uid, supplier) {
  upsertDirectoryRecord(uid, KIND, supplier);
}

export function removeSupplierLocal(uid, supplierId) {
  removeDirectoryRecord(uid, KIND, supplierId);
}

export function getSuppliersLocal(uid) {
  return getDirectorySnapshot(uid, KIND);
}

export function suppliersHasMore(uid) {
  return getDirectoryHasMore(uid, KIND);
}

export function resetSupplierDirectory(uid) {
  resetDirectory(uid, KIND);
}