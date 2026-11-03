/**
 * Short-lived in-memory cache + in-flight deduplication for one-shot getDocs/getDoc.
 */

import {
  recordCacheHit,
  recordCacheMiss,
  recordQueryRequest,
} from './firestoreReadMetrics';

const DEFAULT_TTL_MS = 30_000;

/** @type {Map<string, { expires: number, promise?: Promise<unknown>, value?: unknown }>} */
const store = new Map();

export function cacheKeyForRef(ref) {
  return ref?.path ? `doc:${ref.path}` : 'doc:unknown';
}

export function cacheKeyForQuery(q) {
  if (q?.path) return `q:${q.path}`;
  const path = q?._query?.path?.canonicalString?.() || q?.firestore?.app?.name || 'query';
  const constraints = JSON.stringify(q?._query?.explicitOrderBy || q?.constraints || []);
  return `q:${path}:${constraints}`;
}

export function invalidateFirestoreCache(prefixOrKey) {
  const needle = String(prefixOrKey || '');
  for (const key of store.keys()) {
    if (key.includes(needle)) store.delete(key);
  }
}

export function clearFirestoreQueryCache() {
  store.clear();
}

export async function cachedGetDoc(getDocFn, ref, { ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  const key = cacheKeyForRef(ref);
  const now = Date.now();
  const hit = store.get(key);
  if (!force && hit?.value !== undefined && hit.expires > now) {
    recordCacheHit();
    return hit.value;
  }
  if (!force && hit?.promise) {
    recordCacheHit();
    return hit.promise;
  }
  recordCacheMiss();
  recordQueryRequest();
  const promise = getDocFn(ref).then((snap) => {
    store.set(key, { expires: Date.now() + ttlMs, value: snap });
    return snap;
  });
  store.set(key, { expires: now + ttlMs, promise });
  return promise;
}

export async function cachedGetDocs(getDocsFn, q, { ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  const key = cacheKeyForQuery(q);
  const now = Date.now();
  const hit = store.get(key);
  if (!force && hit?.value !== undefined && hit.expires > now) {
    recordCacheHit();
    return hit.value;
  }
  if (!force && hit?.promise) {
    recordCacheHit();
    return hit.promise;
  }
  recordCacheMiss();
  recordQueryRequest();
  const promise = getDocsFn(q).then((snap) => {
    store.set(key, { expires: Date.now() + ttlMs, value: snap });
    return snap;
  });
  store.set(key, { expires: now + ttlMs, promise });
  return promise;
}
