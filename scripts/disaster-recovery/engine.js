/**
 * عامل نسخ ليالي خارج المتصفح. لا يُسلَّح إلا بوجود مفاتيح ومساحة خارجية وتنبيه.
 * المشي على المستندات ليس لقطة زمنية واحدة.
 */
const crypto = require('crypto');

const SCHEDULE = {
  timeZone: 'Asia/Hebron',
  hour: 3,
  minute: 0,
  dailyRetention: 30,
  weeklyRetention: 8,
  monthlyRetention: 12,
  maxAttempts: 3,
  missedAfterMs: 26 * 60 * 60 * 1000,
};

const SCHEMA_VERSION = 1;
const BACKUP_KIND = 'layali.system.backup';
const PRODUCTION_RESTORE_ENABLED = false;
const ISOLATED_CONFIRMATION = 'استعادة معزولة';

function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function checksum(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function encodeValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Buffer.isBuffer(value)) {
    return { __firestoreType: 'bytes', base64: value.toString('base64') };
  }
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && typeof value.isEqual === 'function') {
    return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === 'string' && value.firestore && typeof value.id === 'string') {
    return { __firestoreType: 'reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map((item) => encodeValue(item));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const encoded = encodeValue(value[key]);
      if (encoded !== undefined) out[key] = encoded;
    });
    return out;
  }
  return null;
}

function hebronParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  fmt.formatToParts(date).forEach((part) => {
    parts[part.type] = part.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function tagsFor(date) {
  const parts = hebronParts(date);
  const tags = ['daily'];
  if (parts.weekday === 'Sun') tags.push('weekly');
  if (parts.day === 1) tags.push('monthly');
  return tags;
}

function retentionPlan(records, limits = SCHEDULE) {
  const sorted = [...records].sort((a, b) => b.createdAtMs - a.createdAtMs);
  const keep = new Set();
  const take = (tag, limit) => {
    let kept = 0;
    sorted.forEach((record) => {
      if (!record.tags.includes(tag)) return;
      if (kept >= limit) return;
      keep.add(record.id);
      kept += 1;
    });
  };
  take('daily', limits.dailyRetention);
  take('weekly', limits.weeklyRetention);
  take('monthly', limits.monthlyRetention);
  return {
    keep: sorted.filter((record) => keep.has(record.id)),
    delete: sorted.filter((record) => !keep.has(record.id)),
  };
}

function missedSchedule(lastSuccessMs, nowMs) {
  if (!lastSuccessMs) return { missed: true, reason: 'never-succeeded' };
  const age = nowMs - lastSuccessMs;
  return { missed: age > SCHEDULE.missedAfterMs, reason: age > SCHEDULE.missedAfterMs ? 'stale' : 'within-window', ageMs: age };
}

function assessInfrastructure(env = {}) {
  const missing = [];
  if (env.LAYALI_BACKUP_ARMED !== 'yes') missing.push('LAYALI_BACKUP_ARMED');
  if (!env.GOOGLE_APPLICATION_CREDENTIALS && !env.LAYALI_BACKUP_SERVICE_ACCOUNT_JSON) missing.push('service-account');
  if (!env.LAYALI_BACKUP_BUCKET) missing.push('offsite-bucket');
  if (!env.LAYALI_BACKUP_ALERT_WEBHOOK) missing.push('alert-webhook');
  if (env.LAYALI_BACKUP_BUCKET && String(env.LAYALI_BACKUP_BUCKET).startsWith('gs://layaly-cafe')) {
    missing.push('bucket-must-not-be-the-production-default');
  }
  return {
    ok: missing.length === 0,
    armed: missing.length === 0,
    missing,
    architecture: 'external-admin-worker',
    nativeExportAvailable: false,
    consistency: 'best-effort-walk',
    message: missing.length
      ? 'النسخ الكامل غير مسلّح. لن تُقرأ قاعدة الإنتاج ولن يُنشأ ملف جزئي.'
      : 'العامل مستوفٍ لشروط التشغيل.',
  };
}

async function exportFirestore(source) {
  const documents = [];
  const inventory = [];
  let estimatedReads = 0;

  async function walk(parentPath) {
    const collections = await source.listCollections(parentPath);
    for (let index = 0; index < collections.length; index += 1) {
      const col = collections[index];
      const page = await source.readCollection(col.path);
      const docs = page.documents || [];
      const reads = Number.isInteger(page.reads) ? page.reads : (docs.length === 0 ? 1 : docs.length);
      estimatedReads += reads;
      inventory.push({ path: col.path, count: docs.length });
      for (let docIndex = 0; docIndex < docs.length; docIndex += 1) {
        const row = docs[docIndex];
        const path = `${col.path}/${row.id}`;
        documents.push({ path, id: row.id, data: encodeValue(row.data || {}) });
        await walk(path);
      }
    }
  }

  await walk('');
  return { documents, inventory, estimatedReads };
}

function buildBundle({ firestore, authUsers, storageObjects, projectId, databaseId, createdAt }) {
  const payload = {
    firestoreDocuments: firestore.documents,
    authUsers,
    storageObjects,
  };
  const digest = checksum(payload);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: BACKUP_KIND,
    backupId: crypto.randomUUID(),
    createdAt: createdAt.toISOString(),
    createdAtMs: createdAt.getTime(),
    firebaseProjectId: projectId,
    databaseId,
    backupType: 'full-system',
    status: 'complete',
    consistency: 'best-effort-walk',
    consistencyNote: 'المشي المتتالي ليس لقطة زمنية واحدة. مستند قد يتغير أثناء النسخ.',
    documentCount: firestore.documents.length,
    authUserCount: authUsers.length,
    storageObjectCount: storageObjects.length,
    collectionInventory: firestore.inventory,
    estimatedFirestoreReads: firestore.estimatedReads,
    firestoreWrites: 0,
    checksumAlgorithm: 'SHA-256',
    checksum: digest,
    tags: tagsFor(createdAt),
    payload,
  };
}

function verifyBundle(bundle) {
  if (!bundle || bundle.kind !== BACKUP_KIND || bundle.status !== 'complete') {
    return { ok: false, code: 'invalid', errors: ['الحزمة ليست نسخة نظام مكتملة.'] };
  }
  const actual = checksum(bundle.payload);
  if (actual !== bundle.checksum) return { ok: false, code: 'corrupt', errors: ['البصمة لا تطابق المحتوى.'] };
  if (bundle.documentCount !== bundle.payload.firestoreDocuments.length) {
    return { ok: false, code: 'corrupt', errors: ['عدد المستندات لا يطابق الحمولة.'] };
  }
  return { ok: true, errors: [] };
}

async function createFullBackup(deps) {
  const createdAt = deps.now ? deps.now() : new Date();
  let firestore;
  let authUsers;
  let storageObjects;
  try {
    firestore = await exportFirestore(deps.source);
    authUsers = await deps.exportAuthUsers();
    storageObjects = await deps.exportStorageObjects();
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      code: 'incomplete',
      error: error.message,
      bundle: null,
    };
  }
  if (!Array.isArray(authUsers) || !Array.isArray(storageObjects)) {
    return { ok: false, status: 'failed', code: 'incomplete', error: 'مصادر المصادقة أو التخزين لم تُرجع قائمة.', bundle: null };
  }
  const bundle = buildBundle({
    firestore,
    authUsers,
    storageObjects,
    projectId: deps.projectId,
    databaseId: deps.databaseId || '(default)',
    createdAt,
  });
  const verified = verifyBundle(bundle);
  if (!verified.ok) {
    return { ok: false, status: 'failed', code: verified.code, error: verified.errors.join(' '), bundle: null };
  }
  try {
    await deps.sink.begin(bundle.backupId);
    const body = JSON.stringify(bundle);
    await deps.sink.writeBody(bundle.backupId, body);
    const readBack = JSON.parse(await deps.sink.readBody(bundle.backupId));
    if (verifyBundle(readBack).ok !== true) {
      await deps.sink.abort(bundle.backupId);
      return { ok: false, status: 'failed', code: 'storage-integrity', error: 'الملف المكتوب لا يطابق البصمة.', bundle: null };
    }
    await deps.sink.commit(bundle.backupId, {
      backupId: bundle.backupId,
      createdAtMs: bundle.createdAtMs,
      tags: bundle.tags,
      bytes: Buffer.byteLength(body),
      checksum: bundle.checksum,
      documentCount: bundle.documentCount,
    });
  } catch (error) {
    if (deps.sink.abort) {
      try { await deps.sink.abort(bundle.backupId); } catch { /* ignore cleanup failure */ }
    }
    return { ok: false, status: 'failed', code: 'storage-failure', error: error.message, bundle: null };
  }
  return { ok: true, status: 'complete', bundle };
}

async function runBackupJob(deps) {
  const gate = assessInfrastructure(deps.env || {});
  if (!gate.ok) {
    return { ok: false, status: 'not-armed', attempts: 0, gate, notified: false };
  }
  let lastError = null;
  for (let attempt = 1; attempt <= SCHEDULE.maxAttempts; attempt += 1) {
    const result = await createFullBackup(deps);
    if (result.ok) {
      return { ...result, attempts: attempt, gate, notified: false };
    }
    lastError = result;
    if (attempt < SCHEDULE.maxAttempts && deps.wait) {
      await deps.wait(attempt);
    }
  }
  if (deps.notify) {
    await deps.notify({
      event: 'backup-failed',
      error: lastError.error,
      code: lastError.code,
    });
  }
  return { ...lastError, attempts: SCHEDULE.maxAttempts, gate, notified: Boolean(deps.notify) };
}

const FINANCIAL_PATH = /\/(customers|suppliers|vault|cashShifts|employeePosDebts|employeeAdvances|payrollPayments)\//;

function activityMs(data) {
  if (!data) return null;
  if (data.updatedAt && data.updatedAt.__firestoreType === 'timestamp') {
    return data.updatedAt.seconds * 1000;
  }
  if (typeof data.updatedAtMs === 'number') return data.updatedAtMs;
  return null;
}

function detectFinancialConflicts(backupDocuments, liveDocuments) {
  const liveByPath = new Map(liveDocuments.map((row) => [row.path, row]));
  const conflicts = [];
  backupDocuments.forEach((row) => {
    if (!FINANCIAL_PATH.test(`${row.path}/`)) return;
    const live = liveByPath.get(row.path);
    if (!live) return;
    const same = canonical(row.data) === canonical(live.data);
    if (same) return;
    const liveMs = activityMs(live.data);
    const backupMs = activityMs(row.data);
    conflicts.push({
      path: row.path,
      reason: liveMs != null && backupMs != null && liveMs > backupMs ? 'live-newer' : 'financial-drift',
    });
  });
  return conflicts;
}

function planRestore(bundle, target, confirmation) {
  const verified = verifyBundle(bundle);
  if (!verified.ok) return { ok: false, ...verified, writes: false };
  if (target.expectedProjectId && bundle.firebaseProjectId !== target.expectedProjectId) {
    return { ok: false, code: 'wrong-project', errors: ['ملف النسخة لا يخص مشروع ليالي الحالي.'], writes: false };
  }
  if (target.role !== 'isolated' || target.isolatedDatabase !== true) {
    return {
      ok: false,
      code: 'production-restore-disabled',
      errors: ['استعادة الإنتاج مغلقة. الهدف المسموح بيئة معزولة فقط، وبعد معاينة.'],
      writes: false,
    };
  }
  if (confirmation !== ISOLATED_CONFIRMATION) {
    return { ok: false, code: 'confirmation-required', errors: ['يلزم تأكيد صريح للاستعادة المعزولة.'], writes: false };
  }
  const conflicts = detectFinancialConflicts(bundle.payload.firestoreDocuments, target.liveDocuments || []);
  if (conflicts.length) {
    return {
      ok: false,
      code: 'financial-conflicts',
      errors: ['توجد سجلات مالية مختلفة. لا دمج تلقائي ولا استبدال للأرصدة الأحدث.'],
      conflicts,
      writes: false,
    };
  }
  return {
    ok: true,
    writes: false,
    code: 'preview',
    documentCount: bundle.documentCount,
    inventory: bundle.collectionInventory,
    createdAt: bundle.createdAt,
    projectId: bundle.firebaseProjectId,
    conflicts,
    note: 'المعاينة لا تكتب على أي قاعدة.',
  };
}

async function executeIsolatedRestore(bundle, target, confirmation) {
  if (target.productionApply || target.role !== 'isolated') {
    const error = new Error('الاستعادة لا تكتب على الإنتاج.');
    error.code = 'production-restore-disabled';
    throw error;
  }
  const plan = planRestore(bundle, target, confirmation);
  if (!plan.ok) {
    const error = new Error(plan.errors.join(' '));
    error.code = plan.code;
    throw error;
  }
  if (typeof target.apply !== 'function') {
    const error = new Error('الهدف المعزول بلا دالة كتابة.');
    error.code = 'isolated-target-missing';
    throw error;
  }
  await target.apply(bundle.payload.firestoreDocuments);
  return { ok: true, written: bundle.payload.firestoreDocuments.length, target: 'isolated' };
}

module.exports = {
  SCHEDULE,
  SCHEMA_VERSION,
  BACKUP_KIND,
  PRODUCTION_RESTORE_ENABLED,
  ISOLATED_CONFIRMATION,
  checksum,
  encodeValue,
  hebronParts,
  tagsFor,
  retentionPlan,
  missedSchedule,
  assessInfrastructure,
  exportFirestore,
  verifyBundle,
  createFullBackup,
  runBackupJob,
  detectFinancialConflicts,
  planRestore,
  executeIsolatedRestore,
};
