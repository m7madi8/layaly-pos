import { canonicalStringify } from './canonical';
import { RESTORE_ROLLBACK_STRATEGY, RESTORE_WRITES_ENABLED } from './constants';
import {
  financialSubset,
  latestActivityMs,
  transactionIds,
} from './financials';

function classifyRecord(backupRow, liveRow) {
  if (!liveRow) {
    const balanceMissing = !Object.prototype.hasOwnProperty.call(backupRow.data || {}, 'balance')
      || backupRow.data.balance === null
      || typeof backupRow.data.balance !== 'number';
    return {
      id: backupRow.id,
      name: backupRow.data?.name || '',
      action: 'create',
      financialConflict: false,
      balanceMissing,
      reason: balanceMissing ? 'missing-balance' : null,
    };
  }

  const sameDocument = canonicalStringify(backupRow.data) === canonicalStringify(liveRow.data);
  if (sameDocument) {
    return {
      id: backupRow.id,
      name: backupRow.data?.name || liveRow.data?.name || '',
      action: 'unchanged',
      financialConflict: false,
      balanceMissing: false,
      reason: null,
    };
  }

  const sameMoney = canonicalStringify(financialSubset(backupRow.data)) === canonicalStringify(financialSubset(liveRow.data));
  if (sameMoney) {
    return {
      id: backupRow.id,
      name: liveRow.data?.name || backupRow.data?.name || '',
      action: 'update',
      financialConflict: false,
      balanceMissing: false,
      reason: 'profile-only',
    };
  }

  const backupBalance = backupRow.data?.balance;
  const liveBalance = liveRow.data?.balance;
  const backupBalanceMissing = typeof backupBalance !== 'number';
  const liveBalanceMissing = typeof liveBalance !== 'number';
  const liveIds = new Set(transactionIds(liveRow.data));
  const backupIds = new Set(transactionIds(backupRow.data));
  const liveHasNewerEntry = [...liveIds].some((id) => !backupIds.has(id));
  const liveMs = latestActivityMs(liveRow.data);
  const backupMs = latestActivityMs(backupRow.data);
  let reason = 'financial-drift';
  if (backupBalanceMissing || liveBalanceMissing) reason = 'missing-balance';
  else if (liveHasNewerEntry) reason = 'live-has-entries-absent-from-backup';
  else if (liveMs != null && backupMs != null && liveMs > backupMs) reason = 'live-newer';
  else if (liveMs == null || backupMs == null) reason = 'freshness-unknown';

  return {
    id: backupRow.id,
    name: liveRow.data?.name || backupRow.data?.name || '',
    action: 'conflict',
    financialConflict: true,
    balanceMissing: backupBalanceMissing || liveBalanceMissing,
    reason,
    liveBalance: liveBalanceMissing ? null : liveBalance,
    backupBalance: backupBalanceMissing ? null : backupBalance,
  };
}

/**
 * معاينة جافة. لا تحذف عميلاً غائباً عن النسخة ولا تكتب شيئاً.
 * أي تعارض مالي يمنع الاستعادة حتى لو فُتحت الكتابة لاحقاً.
 */
export function previewCustomerRestore({ backup, liveDocuments }) {
  const liveById = new Map(liveDocuments.map((row) => [row.id, row]));
  const backupIds = new Set(backup.documents.map((row) => row.id));
  const records = backup.documents.map((row) => classifyRecord(row, liveById.get(row.id)));
  const preserved = liveDocuments
    .filter((row) => !backupIds.has(row.id))
    .map((row) => ({ id: row.id, name: row.data?.name || '', action: 'preserved' }));

  const counts = {
    create: records.filter((row) => row.action === 'create').length,
    update: records.filter((row) => row.action === 'update').length,
    unchanged: records.filter((row) => row.action === 'unchanged').length,
    preserved: preserved.length,
    financialConflicts: records.filter((row) => row.financialConflict).length,
  };

  const financialBlock = counts.financialConflicts > 0
    || records.some((row) => row.balanceMissing && row.action !== 'unchanged');
  const blockReasons = ['restore-writes-disabled'];
  if (financialBlock) blockReasons.push('financial-conflicts');
  if (backup.outstandingDebtAuthoritative === false && (counts.create > 0 || counts.financialConflicts > 0)) {
    blockReasons.push('debt-total-not-authoritative');
  }

  return {
    writesEnabled: RESTORE_WRITES_ENABLED,
    blocked: true,
    requiresManualReconciliation: financialBlock,
    blockReasons,
    rollback: RESTORE_ROLLBACK_STRATEGY,
    counts,
    customerCount: backup.customerCount,
    debtorCount: backup.debtorCount,
    totalOutstandingDebt: backup.totalOutstandingDebt,
    outstandingDebtAuthoritative: backup.outstandingDebtAuthoritative === true,
    missingBalanceCount: backup.missingBalanceCount || 0,
    records,
    preserved,
    conflicts: records.filter((row) => row.financialConflict || row.balanceMissing),
  };
}

/** مسار الاستعادة الكتابية مغلق. لا يستدعي كاتب المستندات حتى لو مُرّر إليه. */
export function executeCustomerRestore(preview, deps = {}) {
  if (deps && typeof deps.writeCustomer === 'function') {
    /* الكاتب موجود للاختبار فقط، ولا يُستدعى. */
  }
  const error = new Error(
    'استعادة الإنتاج غير مفعّلة. لا توجد آلية خادم مختبرة، ولم تُكتب أي أرصدة أو حركات.'
  );
  error.code = 'restore-disabled';
  error.previewBlocked = true;
  error.blockReasons = preview?.blockReasons || ['restore-writes-disabled'];
  throw error;
}
