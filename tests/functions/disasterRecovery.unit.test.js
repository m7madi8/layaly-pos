const {
  SCHEDULE,
  PRODUCTION_RESTORE_ENABLED,
  ISOLATED_CONFIRMATION,
  tagsFor,
  retentionPlan,
  missedSchedule,
  assessInfrastructure,
  createFullBackup,
  runBackupJob,
  verifyBundle,
  planRestore,
  executeIsolatedRestore,
  encodeValue,
} = require('../../scripts/disaster-recovery/engine');

function timestamp(seconds) {
  return { seconds, nanoseconds: 0, toDate() { return new Date(seconds * 1000); } };
}

function memorySource(tree, options = {}) {
  const reads = { calls: 0 };
  return {
    reads,
    async listCollections(parentPath) {
      return (tree[parentPath] || []).map((col) => ({ path: parentPath ? `${parentPath}/${col.id}` : col.id }));
    },
    async readCollection(collectionPath) {
      reads.calls += 1;
      if (options.failOn === collectionPath) throw new Error(`read failed ${collectionPath}`);
      const col = findCol(tree, collectionPath);
      const documents = col ? col.docs : [];
      return { documents, reads: documents.length === 0 ? 1 : documents.length };
    },
  };
}

function findCol(tree, collectionPath) {
  const segments = collectionPath.split('/');
  let parent = '';
  let colId = segments[0];
  if (segments.length > 1) {
    parent = segments.slice(0, -1).join('/');
    colId = segments[segments.length - 1];
  }
  return (tree[parent] || []).find((col) => col.id === colId);
}

function sampleTree() {
  return {
    '': [
      {
        id: 'users',
        docs: [{ id: 'cafe', data: { businessName: 'ليالي' } }],
      },
    ],
    'users/cafe': [
      {
        id: 'customers',
        docs: [{
          id: 'c1',
          data: {
            name: 'أحمد',
            balance: 40,
            transactions: [{ id: 'p1', type: 'payment', amount: 10 }],
            updatedAt: timestamp(1_700_000_000),
          },
        }],
      },
      {
        id: 'vault',
        docs: [{ id: 'main', data: { balance: 250, updatedAtMs: 1_700_000_000_000 } }],
      },
      {
        id: 'notes',
        docs: [{ id: 'n1', data: { text: 'ملاحظة داخلية' } }],
      },
    ],
    'users/cafe/customers/c1': [
      { id: 'privateNotes', docs: [{ id: 'x', data: { body: 'متداخل' } }] },
    ],
  };
}

function memorySink() {
  const bodies = new Map();
  const committed = new Map();
  return {
    committed,
    async begin() {},
    async writeBody(id, body) { bodies.set(id, body); },
    async readBody(id) { return bodies.get(id); },
    async commit(id, meta) { committed.set(id, meta); },
    async abort(id) { bodies.delete(id); committed.delete(id); },
  };
}

const armedEnv = {
  LAYALI_BACKUP_ARMED: 'yes',
  GOOGLE_APPLICATION_CREDENTIALS: 'C:\\secrets\\layali-backup.json',
  LAYALI_BACKUP_BUCKET: 'gs://layali-backups-offsite',
  LAYALI_BACKUP_ALERT_WEBHOOK: 'https://alerts.example/layali',
};

function deps(overrides = {}) {
  return {
    env: armedEnv,
    projectId: 'layaly-cafe-13c2b',
    databaseId: '(default)',
    source: memorySource(sampleTree()),
    exportAuthUsers: async () => [{ uid: 'admin', email: 'admin@layali.cafe' }],
    exportStorageObjects: async () => [{ path: 'logos/cafe/logo.png', md5: 'abc', bytes: 12 }],
    sink: memorySink(),
    now: () => new Date('2026-11-01T01:00:00Z'),
    ...overrides,
  };
}

describe('full system disaster recovery worker', () => {
  test('stays disarmed without credentials and does not read', async () => {
    const source = memorySource(sampleTree());
    const result = await runBackupJob(deps({ env: {}, source }));
    expect(result.status).toBe('not-armed');
    expect(result.gate.missing).toEqual(expect.arrayContaining(['service-account', 'offsite-bucket', 'alert-webhook']));
    expect(source.reads.calls).toBe(0);
    expect(assessInfrastructure({ LAYALI_BACKUP_BUCKET: 'gs://layaly-cafe-prod' }).ok).toBe(false);
    expect(PRODUCTION_RESTORE_ENABLED).toBe(false);
  });

  test('exports nested collections, auth, and storage with a verifiable manifest', async () => {
    const result = await createFullBackup(deps());
    expect(result.status).toBe('complete');
    expect(result.bundle.documentCount).toBe(5);
    expect(result.bundle.collectionInventory.map((row) => row.path)).toEqual(expect.arrayContaining([
      'users',
      'users/cafe/customers',
      'users/cafe/customers/c1/privateNotes',
      'users/cafe/vault',
    ]));
    expect(result.bundle.payload.firestoreDocuments.find((row) => row.path === 'users/cafe/customers/c1').data.balance).toBe(40);
    expect(result.bundle.payload.firestoreDocuments.find((row) => row.path === 'users/cafe/customers/c1').data.updatedAt.__firestoreType).toBe('timestamp');
    expect(result.bundle.payload.authUsers).toHaveLength(1);
    expect(result.bundle.estimatedFirestoreReads).toBe(5);
    expect(result.bundle.firestoreWrites).toBe(0);
    expect(result.bundle.consistency).toBe('best-effort-walk');
    expect(verifyBundle(result.bundle).ok).toBe(true);
    expect(result.bundle.checksum).toHaveLength(64);
  });

  test('does not encode a missing balance as zero', () => {
    expect(encodeValue({ name: 'بلا رصيد' }).balance).toBeUndefined();
  });

  test('aborts when a nested read fails and does not commit', async () => {
    const sink = memorySink();
    const result = await createFullBackup(deps({
      source: memorySource(sampleTree(), { failOn: 'users/cafe/vault' }),
      sink,
    }));
    expect(result.status).toBe('failed');
    expect(result.code).toBe('incomplete');
    expect(result.bundle).toBeNull();
    expect(sink.committed.size).toBe(0);
  });

  test('storage failure is not a successful backup', async () => {
    const sink = memorySink();
    sink.writeBody = async () => { throw new Error('disk full'); };
    const result = await createFullBackup(deps({ sink }));
    expect(result.code).toBe('storage-failure');
    expect(sink.committed.size).toBe(0);
  });

  test('retries then notifies after three failures', async () => {
    const notify = jest.fn(async () => {});
    let calls = 0;
    const source = memorySource(sampleTree());
    source.readCollection = async () => {
      calls += 1;
      throw new Error('unavailable');
    };
    const result = await runBackupJob(deps({ source, notify, wait: async () => {} }));
    expect(result.status).toBe('failed');
    expect(calls).toBe(SCHEDULE.maxAttempts);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'backup-failed' }));
  });

  test('rejects a corrupted bundle and a foreign project', async () => {
    const { bundle } = await createFullBackup(deps());
    const tampered = { ...bundle, checksum: `${bundle.checksum.slice(0, -1)}${bundle.checksum.endsWith('a') ? 'b' : 'a'}` };
    expect(verifyBundle(tampered).code).toBe('corrupt');
    const foreign = planRestore(bundle, {
      expectedProjectId: 'other-project',
      role: 'isolated',
      isolatedDatabase: true,
    }, ISOLATED_CONFIRMATION);
    expect(foreign.code).toBe('wrong-project');
  });

  test('blocks production restore and financial overwrite, then restores into an isolated store', async () => {
    const { bundle } = await createFullBackup(deps());
    const production = planRestore(bundle, {
      expectedProjectId: 'layaly-cafe-13c2b',
      role: 'production',
      projectId: 'layaly-cafe-13c2b',
      databaseId: '(default)',
    }, ISOLATED_CONFIRMATION);
    expect(production.code).toBe('production-restore-disabled');

    const liveNewer = planRestore(bundle, {
      expectedProjectId: 'layaly-cafe-13c2b',
      role: 'isolated',
      isolatedDatabase: true,
      liveDocuments: [{
        path: 'users/cafe/customers/c1',
        data: { name: 'أحمد', balance: 55, transactions: [{ id: 'p1', type: 'payment', amount: 10 }, { id: 'p2', type: 'payment', amount: 15 }], updatedAt: { __firestoreType: 'timestamp', seconds: 1_800_000_000, nanoseconds: 0 } },
      }],
    }, ISOLATED_CONFIRMATION);
    expect(liveNewer.code).toBe('financial-conflicts');

    const isolated = new Map();
    const productionApply = jest.fn();
    await expect(executeIsolatedRestore(bundle, {
      expectedProjectId: 'layaly-cafe-13c2b',
      role: 'production',
      productionApply,
    }, ISOLATED_CONFIRMATION)).rejects.toMatchObject({ code: 'production-restore-disabled' });
    expect(productionApply).not.toHaveBeenCalled();

    const applied = await executeIsolatedRestore(bundle, {
      expectedProjectId: 'layaly-cafe-13c2b',
      role: 'isolated',
      isolatedDatabase: true,
      liveDocuments: [],
      apply: async (documents) => {
        documents.forEach((row) => isolated.set(row.path, row.data));
      },
    }, ISOLATED_CONFIRMATION);
    expect(applied.written).toBe(5);
    expect(isolated.get('users/cafe/customers/c1').balance).toBe(40);
    expect(isolated.get('users/cafe/vault/main').balance).toBe(250);
    expect(isolated.get('users/cafe/customers/c1/privateNotes/x').body).toBe('متداخل');
    expect(productionApply).not.toHaveBeenCalled();
  });

  test('retention keeps daily, weekly, and monthly slots and detects a missed run', () => {
    const records = [];
    for (let day = 1; day <= 40; day += 1) {
      const createdAt = new Date(Date.UTC(2026, 0, day, 1, 0, 0));
      records.push({ id: `b${day}`, createdAtMs: createdAt.getTime(), tags: tagsFor(createdAt), bytes: 10 });
    }
    const plan = retentionPlan(records);
    const newest = [...records].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, SCHEDULE.dailyRetention);
    newest.forEach((row) => {
      expect(plan.keep.map((kept) => kept.id)).toContain(row.id);
    });
    expect(plan.delete.length).toBeGreaterThan(0);
    expect(missedSchedule(Date.now() - (3 * 24 * 60 * 60 * 1000), Date.now()).missed).toBe(true);
    expect(missedSchedule(Date.now() - (60 * 60 * 1000), Date.now()).missed).toBe(false);
    expect(missedSchedule(null, Date.now()).reason).toBe('never-succeeded');
  });
});
