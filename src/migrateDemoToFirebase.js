import { DEMO_UID } from './demoBackend';

const DEMO_STORE_KEY = 'layali-cafe-demo-v2';

export function hasLocalDemoData() {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return false;
    const store = JSON.parse(raw);
    const prefix = `users/${DEMO_UID}/`;
    return Object.keys(store.docs || {}).some((k) => k.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * ينقل بيانات التجربة المحلية من localStorage إلى Firestore للمستخدم الحالي.
 */
export async function migrateLocalDemoToFirebase(uid, { doc, setDoc, writeBatch, db }) {
  const raw = localStorage.getItem(DEMO_STORE_KEY);
  if (!raw) return { count: 0 };

  const store = JSON.parse(raw);
  const docs = store.docs || {};
  const fromPrefix = `users/${DEMO_UID}/`;

  const entries = Object.entries(docs).filter(([key]) => key.startsWith(fromPrefix));

  if (entries.length === 0) return { count: 0 };

  let batch = writeBatch(db);
  let ops = 0;
  let total = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const [key, data] of entries) {
    const suffix = key.slice(fromPrefix.length);
    const segments = suffix.split('/').filter(Boolean);
    if (segments.length === 0) {
      await setDoc(doc(db, 'users', uid), { ...data }, { merge: true });
      total += 1;
      continue;
    }

    const path = ['users', uid, ...segments];
    batch.set(doc(db, ...path), data, { merge: true });
    ops += 1;
    total += 1;

    if (ops >= 450) await commitBatch();
  }

  await commitBatch();
  localStorage.setItem('layali-demo-migrated-to-firebase', uid);
  return { count: total };
}

export function wasDemoMigratedForUser(uid) {
  return localStorage.getItem('layali-demo-migrated-to-firebase') === uid;
}
