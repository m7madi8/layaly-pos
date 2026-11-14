import { clearFirestoreQueryCache } from './firestoreQueryCache';
import { resetFirestoreReadMetrics } from './firestoreReadMetrics';
import { teardownAllSharedListeners } from './firestoreSharedListeners';
import { clearProductCatalog } from './localFirst/productCatalogStore';
import { clearAllDirectories } from './localFirst/paginatedDirectoryStore';
import { clearReportSummaryCache } from './localFirst/reportSummaryCache';
import { clearDashboardMetricsCache } from './localFirst/dashboardMetricsStore';
import { clearDashboardTodayMetricsCache } from './localFirst/dashboardTodayMetricsStore';
import { clearActiveOrdersCache } from './localFirst/activeOrdersStore';
import { clearSupplierExpenseReadCaches } from './supplierExpenseReads';

/** Clear in-memory Firestore helpers when Firebase Auth session ends. */
export function clearFirestoreClientSessionState() {
  teardownAllSharedListeners();
  clearFirestoreQueryCache();
  resetFirestoreReadMetrics();
  clearProductCatalog();
  clearAllDirectories();
  clearReportSummaryCache();
  clearDashboardMetricsCache();
  clearDashboardTodayMetricsCache();
  clearActiveOrdersCache();
  clearSupplierExpenseReadCaches();
}
