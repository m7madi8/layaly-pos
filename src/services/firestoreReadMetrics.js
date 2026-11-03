/**
 * In-app Firestore read telemetry (no PII).
 * Distinguishes query invocations from document counts and cache-served snapshots.
 */

const state = {
  queryRequests: 0,
  snapshotCallbacks: 0,
  documentsReturned: 0,
  billableDocumentReads: 0,
  cacheServedDocuments: 0,
  cacheHits: 0,
  cacheMisses: 0,
  activeRealtimeListeners: 0,
  readsByPage: Object.create(null),
};

let currentPageTag = 'app';

export function setFirestoreMetricsPage(tag) {
  currentPageTag = tag ? String(tag) : 'app';
}

function bumpPageReads(count) {
  if (!count) return;
  const key = currentPageTag || 'app';
  state.readsByPage[key] = (state.readsByPage[key] || 0) + count;
}

export function recordQueryRequest() {
  state.queryRequests += 1;
}

export function recordGetDocsResult(docCount, { fromCache = false } = {}) {
  const n = Math.max(0, Number(docCount) || 0);
  state.documentsReturned += n;
  if (fromCache) {
    state.cacheServedDocuments += n;
    state.cacheHits += 1;
  } else {
    state.billableDocumentReads += n;
    state.cacheMisses += 1;
    bumpPageReads(n);
  }
}

export function recordGetDocResult({ exists = false, fromCache = false } = {}) {
  const n = exists ? 1 : 0;
  state.documentsReturned += n;
  if (!n) return;
  if (fromCache) {
    state.cacheServedDocuments += n;
    state.cacheHits += 1;
  } else {
    state.billableDocumentReads += n;
    state.cacheMisses += 1;
    bumpPageReads(n);
  }
}

export function recordSnapshotDelivery(docCount, { fromCache = false, isInitial = false, changedCount = 0 } = {}) {
  state.snapshotCallbacks += 1;
  const n = Math.max(0, Number(docCount) || 0);
  const billable = isInitial ? n : Math.max(0, Number(changedCount) || 0);
  state.documentsReturned += n;
  if (fromCache) {
    state.cacheServedDocuments += billable;
    if (isInitial) state.cacheHits += 1;
  } else if (billable > 0) {
    state.billableDocumentReads += billable;
    if (isInitial) state.cacheMisses += 1;
    bumpPageReads(billable);
  }
}

export function recordCacheHit() {
  state.cacheHits += 1;
}

export function recordCacheMiss() {
  state.cacheMisses += 1;
}

export function adjustActiveListeners(delta) {
  state.activeRealtimeListeners = Math.max(0, state.activeRealtimeListeners + delta);
}

export function getFirestoreReadMetrics() {
  const totalCacheEvents = state.cacheHits + state.cacheMisses;
  return {
    ...state,
    cacheHitRate: totalCacheEvents ? state.cacheHits / totalCacheEvents : null,
    cacheMissRate: totalCacheEvents ? state.cacheMisses / totalCacheEvents : null,
    readsByPage: { ...state.readsByPage },
  };
}

export function resetFirestoreReadMetrics() {
  state.queryRequests = 0;
  state.snapshotCallbacks = 0;
  state.documentsReturned = 0;
  state.billableDocumentReads = 0;
  state.cacheServedDocuments = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.activeRealtimeListeners = 0;
  state.readsByPage = Object.create(null);
}
