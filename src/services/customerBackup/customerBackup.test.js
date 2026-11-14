import { sha256Hex } from './hash';
import { encodeFirestoreValue } from './codec';
import { summarizeStoredBalances } from './financials';
import {
  backupFilename,
  documentsChecksum,
  parseBackupText,
  validateBackupEnvelope,
} from './backupModel';
import { createCustomerBackup, resetCustomerBackupLockForTests } from './createCustomerBackup';
import { executeCustomerRestore, previewCustomerRestore } from './restorePreview';
import { resetSessionBackupHistoryForTests, rememberSessionBackup } from './sessionHistory';
import { CLOUD_BACKUP, RESTORE_WRITES_ENABLED } from './constants';

function timestamp(seconds, nanoseconds = 125000000) {
  return {
    seconds,
    nanoseconds,
    toDate() {
      return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
    },
  };
}

function makeCustomers(count) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const indebted = n % 5 === 0;
    const data = {
      name: `عميل ${n}`,
      phone: `010${String(n).padStart(8, '0')}`,
      balance: indebted ? 25.5 : 0,
      transactions: indebted
        ? [
            { id: `debt-${n}`, type: 'order_debt', amount: 35.5, orderNumber: String(1000 + n) },
            { id: `pay-${n}`, type: 'payment', amount: 10 },
          ]
        : [],
      createdAt: timestamp(1_700_000_000 + n),
      updatedAt: timestamp(1_700_100_000 + n),
    };
    if (n % 7 !== 0) data.notes = 'ملاحظة';
    return { id: `c${String(n).padStart(4, '0')}`, data };
  });
}

function pageReader(all, { failOnPage } = {}) {
  return async ({ pageSize, cursor }) => {
    const start = cursor ? all.findIndex((row) => row.id === cursor) + 1 : 0;
    const pageNumber = Math.floor(start / pageSize) + 1;
    if (failOnPage && pageNumber === failOnPage) {
      throw new Error('page failed');
    }
    const slice = all.slice(start, start + pageSize);
    return {
      docs: slice,
      cursor: slice.length ? slice[slice.length - 1].id : null,
      lastId: slice.length ? slice[slice.length - 1].id : null,
    };
  };
}

const CREATED_AT = new Date(2026, 10, 14, 15, 5, 0);

async function backupOf(customers, { pageSize = 100, tenantUid = 'tenant-a', projectId = 'layali-prod' } = {}) {
  return createCustomerBackup({
    tenantUid,
    projectId,
    isAdmin: true,
    pageSize,
    readPage: pageReader(customers),
    auditWriter: async () => ({ written: true }),
    now: () => CREATED_AT,
  });
}

describe('customer backup', () => {
  beforeEach(() => {
    resetCustomerBackupLockForTests();
    resetSessionBackupHistoryForTests();
  });

  test('sha256 matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('preserves firestore types and does not invent a zero balance', () => {
    const encoded = encodeFirestoreValue({
      name: 'منى',
      createdAt: timestamp(10, 20),
      location: { latitude: 30.1, longitude: 31.2, isEqual() { return true; } },
      nested: { keep: true },
    });
    expect(encoded.createdAt).toEqual({ __firestoreType: 'timestamp', seconds: 10, nanoseconds: 20 });
    expect(encoded.location.__firestoreType).toBe('geopoint');
    expect(encoded.balance).toBeUndefined();
    const summary = summarizeStoredBalances([{ id: 'a', data: { name: 'منى' } }, { id: 'b', data: { balance: 10 } }]);
    expect(summary.totalOutstandingDebt).toBeNull();
    expect(summary.knownPositiveDebt).toBe(10);
    expect(summary.debtorCount).toBe(1);
    expect(summary.missingBalanceCount).toBe(1);
  });

  test.each([
    [25, 100, 1, 25],
    [300, 100, 4, 301],
    [1000, 100, 11, 1001],
  ])('backs up %i customers with page size %i', async (count, pageSize, pages, reads) => {
    const result = await backupOf(makeCustomers(count), { pageSize });
    const debtors = count / 5;
    expect(result.envelope.status).toBe('complete');
    expect(result.envelope.customerCount).toBe(count);
    expect(result.envelope.documents).toHaveLength(count);
    expect(result.envelope.debtorCount).toBe(debtors);
    expect(result.envelope.totalOutstandingDebt).toBe(debtors * 25.5);
    expect(result.envelope.outstandingDebtAuthoritative).toBe(true);
    expect(result.envelope.pagesRead).toBe(pages);
    expect(result.envelope.estimatedFirestoreReads).toBe(reads);
    expect(result.envelope.firebaseProjectId).toBe('layali-prod');
    expect(result.envelope.databaseId).toBe('(default)');
    expect(result.envelope.tenantUid).toBe('tenant-a');
    expect(result.envelope.schemaVersion).toBe(1);
    expect(result.envelope.checksum).toBe(documentsChecksum(result.envelope.documents));
    expect(result.filename).toBe('layali-customers-backup-2026-11-14-15-05.json');
    const indebted = result.envelope.documents.find((row) => row.id === 'c0005');
    expect(indebted.data.transactions).toHaveLength(2);
    expect(indebted.data.transactions[0].type).toBe('order_debt');
    expect(indebted.data.createdAt.__firestoreType).toBe('timestamp');
    const withoutNotes = result.envelope.documents.find((row) => row.id === 'c0007');
    expect(withoutNotes.data.notes).toBeUndefined();
    expect(withoutNotes.data.balance).toBe(0);
  });

  test('aborts when a page fails and does not return a complete backup', async () => {
    const audit = jest.fn(async () => ({ written: true }));
    await expect(createCustomerBackup({
      tenantUid: 'tenant-a',
      projectId: 'layali-prod',
      isAdmin: true,
      pageSize: 100,
      readPage: pageReader(makeCustomers(300), { failOnPage: 2 }),
      auditWriter: audit,
    })).rejects.toMatchObject({ code: 'backup-incomplete', documentsRead: 100 });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'aborted' }));
    expect(audit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
  });

  test('rejects a second backup while the first is running', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const readPage = async () => {
      await gate;
      return { docs: [], cursor: null, lastId: null };
    };
    const first = createCustomerBackup({
      tenantUid: 'tenant-a',
      projectId: 'layali-prod',
      isAdmin: true,
      readPage,
    });
    await expect(createCustomerBackup({
      tenantUid: 'tenant-a',
      projectId: 'layali-prod',
      isAdmin: true,
      readPage,
    })).rejects.toMatchObject({ code: 'backup-in-flight' });
    release();
    await expect(first).resolves.toMatchObject({ envelope: { customerCount: 0, status: 'complete' } });
  });

  test('rejects employees and a corrupted, foreign, or tampered file', async () => {
    await expect(createCustomerBackup({
      tenantUid: 'tenant-a',
      projectId: 'layali-prod',
      isAdmin: false,
      readPage: pageReader([]),
    })).rejects.toMatchObject({ code: 'forbidden' });

    const { envelope } = await backupOf(makeCustomers(25));
    const corrupt = parseBackupText('{', { tenantUid: 'tenant-a', projectId: 'layali-prod' });
    expect(corrupt.ok).toBe(false);
    expect(corrupt.code).toBe('corrupt');

    const flipped = envelope.checksum.endsWith('a') ? 'b' : 'a';
    const tampered = { ...envelope, checksum: `${envelope.checksum.slice(0, -1)}${flipped}` };
    expect(validateBackupEnvelope(tampered, { tenantUid: 'tenant-a', projectId: 'layali-prod' }).ok).toBe(false);

    const changedMoney = JSON.parse(JSON.stringify(envelope));
    changedMoney.documents[4].data.balance = 1;
    expect(validateBackupEnvelope(changedMoney, { tenantUid: 'tenant-a', projectId: 'layali-prod' }).code).toBe('corrupt');

    expect(validateBackupEnvelope(envelope, { tenantUid: 'other-tenant', projectId: 'layali-prod' }).code).toBe('wrong-tenant');
    expect(validateBackupEnvelope(envelope, { tenantUid: 'tenant-a', projectId: 'other-project' }).code).toBe('wrong-project');
    expect(validateBackupEnvelope(envelope, {
      tenantUid: 'tenant-a',
      projectId: 'layali-prod',
      databaseId: '(default)',
    }).ok).toBe(true);
  });

  test('preview is idempotent, keeps customers absent from the file, and blocks financial conflicts', async () => {
    const { envelope } = await backupOf(makeCustomers(25));
    const live = envelope.documents.map((row) => ({ ...row, data: { ...row.data, transactions: row.data.transactions.map((tx) => ({ ...tx })) } }));
    live.push({ id: 'kept-live', data: { name: 'غير موجود في النسخة', balance: 80, transactions: [] } });

    const first = previewCustomerRestore({ backup: envelope, liveDocuments: live });
    expect(first.counts).toMatchObject({ create: 0, update: 0, unchanged: 25, preserved: 1, financialConflicts: 0 });
    expect(first.blocked).toBe(true);
    expect(first.writesEnabled).toBe(false);
    expect(first.requiresManualReconciliation).toBe(false);

    const second = previewCustomerRestore({ backup: envelope, liveDocuments: live });
    expect(second.counts).toEqual(first.counts);

    const drifted = live.map((row) => ({ ...row, data: { ...row.data, transactions: [...row.data.transactions] } }));
    const target = drifted.find((row) => row.id === 'c0005');
    target.data = {
      ...target.data,
      balance: 15.5,
      updatedAt: { __firestoreType: 'timestamp', seconds: 1_800_000_000, nanoseconds: 0 },
      transactions: [
        ...target.data.transactions,
        { id: 'pay-new', type: 'payment', amount: 10 },
      ],
    };
    const conflicted = previewCustomerRestore({ backup: envelope, liveDocuments: drifted });
    expect(conflicted.counts.financialConflicts).toBe(1);
    expect(conflicted.requiresManualReconciliation).toBe(true);
    expect(conflicted.conflicts[0].reason).toBe('live-has-entries-absent-from-backup');
    expect(conflicted.counts.preserved).toBe(1);
    expect(conflicted.preserved[0].id).toBe('kept-live');

    const writeCustomer = jest.fn();
    expect(() => executeCustomerRestore(conflicted, { writeCustomer, confirmed: true })).toThrow(/غير مفعّلة/);
    expect(() => executeCustomerRestore(second, { writeCustomer, confirmed: true })).toThrow(/غير مفعّلة/);
    expect(writeCustomer).not.toHaveBeenCalled();
    expect(RESTORE_WRITES_ENABLED).toBe(false);
    expect(CLOUD_BACKUP.available).toBe(false);
    expect(backupFilename(new Date(2026, 0, 2, 3, 4, 0))).toBe('layali-customers-backup-2026-01-02-03-04.json');
  });

  test('session history is an in-memory download log, not a cloud backup', async () => {
    const { envelope, filename, byteSize } = await backupOf(makeCustomers(25));
    const listed = rememberSessionBackup({
      backupId: envelope.backupId,
      createdAt: envelope.createdAt,
      customerCount: envelope.customerCount,
      totalOutstandingDebt: envelope.totalOutstandingDebt,
      byteSize,
      filename,
      status: 'complete',
      envelope,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0].source).toBe('local-download');
    expect(listed[0].cloudVerified).toBe(false);
  });
});
