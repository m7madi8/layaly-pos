import { invalidateFirestoreCache } from '../firestoreQueryCache';
import { invalidateReportSummaryCache } from './reportSummaryCache';
import { invalidateDashboardWeekCache } from './dashboardMetricsStore';
import { invalidateDashboardTodayMetrics } from './dashboardTodayMetricsStore';
import { invalidateActiveOrdersCache } from './activeOrdersStore';
import {
  invalidateSupplierExpensePages,
  invalidateTradersPurchaseSnapshot,
} from '../supplierExpenseReads';

/**
 * Targeted invalidation after financial writes — avoids wiping entire app cache.
 */
export function invalidateAfterExpenseMutation(uid, { supplierId, section } = {}) {
  if (!uid) return;
  invalidateFirestoreCache(`users/${uid}/expenses`);
  if (supplierId) invalidateSupplierExpensePages(uid, supplierId);
  if (section === 'purchase' || section === 'supplier_payment') {
    invalidateTradersPurchaseSnapshot();
    invalidateFirestoreCache(`users/${uid}/expenses`);
  }
}

export function invalidateAfterOrderMutation(uid) {
  if (!uid) return;
  invalidateDashboardWeekCache(uid);
  invalidateDashboardTodayMetrics(uid);
  invalidateActiveOrdersCache(uid);
  invalidateReportSummaryCache(uid);
}

export function invalidateAfterBusinessDayClose(uid) {
  if (!uid) return;
  invalidateDashboardWeekCache(uid);
  invalidateReportSummaryCache(uid);
}

export function invalidateAfterSupplierProfileChange(uid, supplierId) {
  if (!uid) return;
  invalidateSupplierExpensePages(uid, supplierId);
  invalidateFirestoreCache(`users/${uid}/suppliers`);
}