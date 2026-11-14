import { CUSTOMERS_BACKUP_PAGE_SIZE } from './constants';
import { backupError, backupFilename, buildBackupEnvelope, measureBackupJson } from './backupModel';
import { paginateCustomerDocuments } from './paginateCustomers';

let backupLock = null;

export function resetCustomerBackupLockForTests() {
  backupLock = null;
}

function newBackupId() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `bak_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * ينشئ نسخة مكتملة من قارئ صفحات خادمي. لا يعلّم النسخة ناجحة إذا سقطت صفحة.
 * لا يلمس مستندات العملاء.
 */
export async function createCustomerBackup({
  tenantUid,
  projectId,
  isAdmin,
  readPage,
  pageSize = CUSTOMERS_BACKUP_PAGE_SIZE,
  onProgress,
  auditWriter,
  now = () => new Date(),
  databaseId,
}) {
  if (!isAdmin) {
    throw backupError('forbidden', 'النسخ الاحتياطي متاح للمدير فقط.');
  }
  if (!tenantUid) {
    throw backupError('missing-tenant', 'حساب المقهى غير محدد.');
  }
  if (!projectId) {
    throw backupError('missing-project', 'معرّف مشروع Firebase غير متاح.');
  }
  if (backupLock) {
    throw backupError('backup-in-flight', 'يوجد طلب نسخ قيد التنفيذ. انتظر اكتماله.');
  }

  const run = (async () => {
    const createdAt = now();
    let paged;
    try {
      paged = await paginateCustomerDocuments({ readPage, pageSize, onProgress });
    } catch (error) {
      if (auditWriter) {
        try {
          await auditWriter({
            action: 'customer_backup',
            status: 'aborted',
            tenantUid,
            customerCount: error.documentsRead ?? null,
          });
        } catch {
          /* فشل التدقيق لا يحوّل النسخة الناقصة إلى نجاح. */
        }
      }
      throw error;
    }

    const envelope = buildBackupEnvelope({
      documents: paged.documents,
      tenantUid,
      projectId,
      databaseId,
      createdAt,
      pagesRead: paged.pagesRead,
      estimatedFirestoreReads: paged.estimatedFirestoreReads,
      backupId: newBackupId(),
    });
    if (envelope.status !== 'complete' || envelope.customerCount !== envelope.documents.length) {
      throw backupError('backup-incomplete', 'رُفضت النسخة لأنها غير مكتملة.');
    }

    const packed = measureBackupJson(envelope);
    let audit = { written: false };
    if (auditWriter) {
      try {
        audit = await auditWriter({
          action: 'customer_backup',
          status: 'complete',
          backupId: envelope.backupId,
          tenantUid,
          customerCount: envelope.customerCount,
          debtorCount: envelope.debtorCount,
          totalOutstandingDebt: envelope.totalOutstandingDebt,
          checksum: envelope.checksum,
        });
      } catch (auditError) {
        audit = { written: false, warning: 'تعذر تسجيل التدقيق. ملف النسخة نفسه مكتمل.', auditError };
      }
    }

    return {
      envelope,
      filename: backupFilename(createdAt),
      json: packed.json,
      byteSize: packed.byteSize,
      audit,
      source: 'local-download',
    };
  })();

  backupLock = run;
  try {
    return await run;
  } finally {
    if (backupLock === run) backupLock = null;
  }
}
