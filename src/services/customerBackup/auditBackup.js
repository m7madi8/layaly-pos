import { addDoc, collection, db, isDemoMode, serverTimestamp } from '../../firebaseClient';

/**
 * سجل إلحاق فقط خارج مجموعة العملاء. لا يحتوي مستندات العملاء ولا أرصدتهم التفصيلية.
 * فشل التدقيق لا يلغي ملفاً مكتملاً ولا يجعل نسخة ناقصة ناجحة.
 */
export async function writeCustomerBackupAudit(tenantUid, entry) {
  if (!tenantUid || isDemoMode || !db) return { written: false, reason: 'unavailable' };
  const debt = entry.totalOutstandingDebt;
  await addDoc(collection(db, 'users', tenantUid, 'customerBackupAudit'), {
    action: entry.action,
    status: entry.status,
    backupId: entry.backupId || null,
    customerCount: entry.customerCount ?? null,
    debtorCount: entry.debtorCount ?? null,
    totalOutstandingDebt: typeof debt === 'number' ? debt : null,
    checksum: entry.checksum || null,
    tenantUid,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return { written: true };
}
