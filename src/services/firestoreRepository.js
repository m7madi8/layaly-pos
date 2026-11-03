/**
 * Central Firestore data-access facade (cache, shared listeners, metrics, query policies).
 */

export {
  getFirestoreReadMetrics,
  resetFirestoreReadMetrics,
  setFirestoreMetricsPage,
} from './firestoreReadMetrics';

export {
  cachedGetDoc,
  cachedGetDocs,
  invalidateFirestoreCache,
  clearFirestoreQueryCache,
} from './firestoreQueryCache';

export {
  sharedOnSnapshot,
  getActiveSharedListenerCount,
  teardownAllSharedListeners,
} from './firestoreSharedListeners';

export {
  resolveOrdersQuerySpec,
  mapOrderSnapshot,
  ORDERS_PAGE_SIZE,
  ORDERS_DASHBOARD_LIMIT,
} from '../utils/firestoreOrderQueries';

export {
  needsProductsListener,
  needsStaffListener,
  needsExpensesListener,
  needsSuppliersListener,
  needsCustomersListener,
} from '../utils/firestoreViewDataPolicy';
