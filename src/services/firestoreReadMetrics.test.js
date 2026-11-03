import {
  getFirestoreReadMetrics,
  recordGetDocsResult,
  recordCacheHit,
  recordCacheMiss,
  resetFirestoreReadMetrics,
} from './firestoreReadMetrics';

describe('firestoreReadMetrics', () => {
  beforeEach(() => resetFirestoreReadMetrics());

  it('tracks billable reads vs cache', () => {
    recordGetDocsResult(10, { fromCache: false });
    recordGetDocsResult(5, { fromCache: true });
    recordCacheHit();
    recordCacheMiss();
    const m = getFirestoreReadMetrics();
    expect(m.billableDocumentReads).toBe(10);
    expect(m.cacheServedDocuments).toBe(5);
    expect(m.documentsReturned).toBe(15);
    expect(m.cacheHitRate).toBeGreaterThan(0);
  });
});
