import { clearFirestoreClientSessionState } from './firestoreSessionCleanup';
import { sharedOnSnapshot, getActiveSharedListenerCount, teardownAllSharedListeners } from './firestoreSharedListeners';
import { getFirestoreReadMetrics } from './firestoreReadMetrics';

describe('firestoreSessionCleanup', () => {
  afterEach(() => teardownAllSharedListeners());

  test('clears shared listeners and metrics', () => {
    sharedOnSnapshot(
      'staff:u1',
      (deliver) => {
        deliver([]);
        return () => {};
      },
      null,
      () => {},
      null
    );
    expect(getActiveSharedListenerCount()).toBe(1);
    clearFirestoreClientSessionState();
    expect(getActiveSharedListenerCount()).toBe(0);
    expect(getFirestoreReadMetrics().billableDocumentReads).toBe(0);
  });
});
