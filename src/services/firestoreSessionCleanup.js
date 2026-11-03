import { clearFirestoreQueryCache } from './firestoreQueryCache';
import { resetFirestoreReadMetrics } from './firestoreReadMetrics';
import { teardownAllSharedListeners } from './firestoreSharedListeners';

/** Clear in-memory Firestore helpers when Firebase Auth session ends. */
export function clearFirestoreClientSessionState() {
  teardownAllSharedListeners();
  clearFirestoreQueryCache();
  resetFirestoreReadMetrics();
}
