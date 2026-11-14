/**
 * Cursor-paginated Firestore directory with in-memory page cache.
 * CACHE_FIRST — pages are keyed by cursor token; reuse without re-read.
 */

import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
  db,
} from '../../firebaseClient';
import { cachedGetDocs, invalidateFirestoreCache } from '../../firebaseClient';

const DEFAULT_PAGE = 25;

/**
 * @typedef {object} DirectoryState
 * @property {object[]} items
 * @property {import('firebase/firestore').QueryDocumentSnapshot[]} pageCursors
 * @property {Map<string, object[]>} pageCache
 * @property {boolean} hasMore
 * @property {boolean} loading
 */

/** @type {Map<string, DirectoryState>} */
const stores = new Map();

function storeKey(uid, kind) {
  return `${kind}:${uid}`;
}

function emptyState() {
  return {
    items: [],
    pageCursors: [],
    pageCache: new Map(),
    hasMore: true,
    loading: false,
  };
}

function getStore(uid, kind) {
  const key = storeKey(uid, kind);
  if (!stores.has(key)) stores.set(key, emptyState());
  return stores.get(key);
}

function colRef(uid, kind) {
  return collection(db, 'users', uid, kind);
}

function mergeById(existing, incoming) {
  const map = new Map(existing.map((r) => [r.id, r]));
  for (const row of incoming) map.set(row.id, row);
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar')
  );
}

export async function fetchDirectoryPage(
  uid,
  kind,
  { pageSize = DEFAULT_PAGE, force = false } = {}
) {
  const state = getStore(uid, kind);
  if (state.loading) return { items: state.items, hasMore: state.hasMore };
  const pageIndex = state.pageCursors.length;
  const cacheKey = `page:${pageIndex}`;
  if (!force && state.pageCache.has(cacheKey)) {
    const cached = state.pageCache.get(cacheKey);
    state.items = mergeById(state.items, cached);
    return { items: state.items, hasMore: state.hasMore };
  }

  state.loading = true;
  try {
    let q = query(colRef(uid, kind), orderBy('name', 'asc'), limit(pageSize));
    if (pageIndex > 0) {
      const cursor = state.pageCursors[pageIndex - 1];
      if (!cursor) {
        state.hasMore = false;
        return { items: state.items, hasMore: false };
      }
      q = query(colRef(uid, kind), orderBy('name', 'asc'), startAfter(cursor), limit(pageSize));
    }
    const snap = await cachedGetDocs(getDocs, q, { ttlMs: 120_000, force });
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (snap.docs.length) {
      state.pageCursors.push(snap.docs[snap.docs.length - 1]);
    }
    state.pageCache.set(cacheKey, rows);
    state.hasMore = snap.docs.length >= pageSize;
    state.items = mergeById(state.items, rows);
    return { items: state.items, hasMore: state.hasMore };
  } finally {
    state.loading = false;
  }
}

export async function searchDirectoryByName(uid, kind, term, { max = 30 } = {}) {
  const needle = String(term || '').trim();
  if (!needle || needle.length < 2) return [];
  const start = needle;
  const end = `${needle}\uf8ff`;
  const q = query(
    colRef(uid, kind),
    orderBy('name', 'asc'),
    where('name', '>=', start),
    where('name', '<=', end),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function upsertDirectoryRecord(uid, kind, record) {
  const state = getStore(uid, kind);
  state.items = mergeById(state.items, [record]);
}

export function removeDirectoryRecord(uid, kind, id) {
  const state = getStore(uid, kind);
  state.items = state.items.filter((r) => r.id !== id);
}

export function getDirectorySnapshot(uid, kind) {
  return getStore(uid, kind).items;
}

export function getDirectoryHasMore(uid, kind) {
  return getStore(uid, kind).hasMore;
}

export function resetDirectory(uid, kind) {
  stores.delete(storeKey(uid, kind));
  invalidateFirestoreCache(`users/${uid}/${kind}`);
}

export function clearAllDirectories() {
  stores.clear();
}