import { canonicalStringify } from './canonical';
import { sha256Hex } from './hash';
import {
  BACKUP_DATABASE_ID,
  BACKUP_KIND,
  BACKUP_SCHEMA_VERSION,
} from './constants';
import { summarizeStoredBalances } from './financials';

export function backupError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function documentsChecksum(documents) {
  return sha256Hex(canonicalStringify(documents));
}

export function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `layali-customers-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
}

export function measureBackupJson(envelope) {
  const json = JSON.stringify(envelope, null, 2);
  const byteSize = new TextEncoder().encode(json).length;
  return { json, byteSize };
}

export function buildBackupEnvelope({
  documents,
  tenantUid,
  projectId,
  databaseId = BACKUP_DATABASE_ID,
  createdAt = new Date(),
  pagesRead,
  estimatedFirestoreReads,
  backupId,
}) {
  const summary = summarizeStoredBalances(documents);
  const checksum = documentsChecksum(documents);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: BACKUP_KIND,
    backupId,
    createdAt: createdAt.toISOString(),
    createdAtMs: createdAt.getTime(),
    firebaseProjectId: projectId,
    databaseId,
    tenantUid,
    customerCount: documents.length,
    debtorCount: summary.debtorCount,
    totalOutstandingDebt: summary.totalOutstandingDebt,
    knownPositiveDebt: summary.knownPositiveDebt,
    missingBalanceCount: summary.missingBalanceCount,
    outstandingDebtAuthoritative: summary.outstandingDebtAuthoritative,
    status: 'complete',
    readSource: 'firestore-server',
    pagesRead,
    estimatedFirestoreReads,
    checksumAlgorithm: 'SHA-256',
    checksum,
    documents,
  };
}

export function validateBackupEnvelope(raw, expected = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['الملف ليس كائناً صالحاً للنسخة الاحتياطية.'], code: 'corrupt' };
  }
  if (raw.kind !== BACKUP_KIND) errors.push('نوع الملف ليس نسخة عملاء ليالي.');
  if (raw.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    errors.push(`إصدار المخطط غير مدعوم (${raw.schemaVersion ?? 'فارغ'}).`);
  }
  if (raw.status !== 'complete') errors.push('النسخة ليست مكتملة، ولن تُستخدم للاستعادة.');
  if (!Array.isArray(raw.documents)) errors.push('قائمة العملاء مفقودة أو تالفة.');

  const documents = Array.isArray(raw.documents) ? raw.documents : [];
  const ids = new Set();
  documents.forEach((row, index) => {
    if (!row || typeof row !== 'object' || !row.id || typeof row.data !== 'object' || row.data == null || Array.isArray(row.data)) {
      errors.push(`السجل رقم ${index + 1} تالف.`);
      return;
    }
    if (ids.has(row.id)) errors.push(`معرّف العميل مكرر: ${row.id}`);
    ids.add(row.id);
  });

  if (raw.customerCount !== documents.length) {
    errors.push('عدد العملاء في الترويسة لا يطابق المستندات.');
  }
  if (expected.tenantUid && raw.tenantUid !== expected.tenantUid) {
    errors.push('هذه النسخة تخص حساباً آخر. لن تُستعاد في هذا الفرع.');
  }
  if (expected.projectId && raw.firebaseProjectId !== expected.projectId) {
    errors.push('مشروع Firebase في الملف لا يطابق المشروع الحالي.');
  }
  if (expected.databaseId && raw.databaseId !== expected.databaseId) {
    errors.push('قاعدة البيانات في الملف لا تطابق القاعدة الحالية.');
  }
  if (!raw.tenantUid) errors.push('معرّف الحساب مفقود من النسخة.');
  if (!raw.firebaseProjectId) errors.push('معرّف مشروع Firebase مفقود من النسخة.');

  if (Array.isArray(raw.documents) && errors.length === 0) {
    const actual = documentsChecksum(documents);
    if (actual !== raw.checksum) errors.push('بصمة السلامة لا تطابق المحتوى. الملف تالف أو معدّل.');
  } else if (Array.isArray(raw.documents) && raw.checksum) {
    const actual = documentsChecksum(documents);
    if (actual !== raw.checksum) errors.push('بصمة السلامة لا تطابق المحتوى. الملف تالف أو معدّل.');
  }

  const code = errors.some((line) => line.includes('حساباً آخر'))
    ? 'wrong-tenant'
    : errors.some((line) => line.includes('مشروع'))
      ? 'wrong-project'
      : errors.some((line) => line.includes('بصمة') || line.includes('تالف'))
        ? 'corrupt'
        : 'invalid';

  return {
    ok: errors.length === 0,
    errors,
    code: errors.length ? code : null,
    backup: errors.length === 0 ? raw : null,
  };
}

export function parseBackupText(text, expected) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['الملف تالف أو ليس JSON صالحاً.'], code: 'corrupt', backup: null };
  }
  return validateBackupEnvelope(raw, expected);
}
