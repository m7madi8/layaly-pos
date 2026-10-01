/**
 * Local demo backend (localStorage). Drop-in replacements for Firebase APIs used by App.js.
 */
import { ADMIN_LOGIN_EMAIL } from './adminAuth';

export const DEMO_UID = 'local-demo-user';
const STORE_KEY = 'layali-cafe-demo-v2';
const LEGACY_STORE_KEYS = ['layali-cafe-demo-v1'];
const MIGRATION_FLAG = 'layali-demo-purged-products-v2';
const CUSTOMERS_RESET_FLAG = 'layali-customers-reset-v3';
const FULL_WIPE_FLAG = 'layali-full-wipe-v6';
const AUTH_KEY = 'layali-cafe-demo-auth';
const BLOB_KEY = 'layali-cafe-demo-blobs';

/** أقسام/أسماء القائمة التجريبية القديمة (Espresso, قهوة, …) */
const LEGACY_SAMPLE_CATEGORIES = new Set([
  'قهوة',
  'مخبوزات',
  'مشروبات',
  'Coffee',
  'Drinks',
  'Bakery',
]);
const LEGACY_SAMPLE_NAME =
  /espresso|إسpresso|لاتيه|latte|cappuccino|كابتش|croissant|كروissant|شاي\s*أحمر|شاي أحمر/i;

function isLegacySampleProduct(data) {
  if (!data || typeof data !== 'object') return false;
  const cat = String(data.category || '').trim();
  if (LEGACY_SAMPLE_CATEGORIES.has(cat)) return true;
  const name = String(data.name || '');
  return LEGACY_SAMPLE_NAME.test(name);
}

function stripAllProducts(store) {
  for (const key of Object.keys(store.docs || {})) {
    if (key.includes('/products/')) delete store.docs[key];
  }
}

function stripAllCustomers(store) {
  for (const key of Object.keys(store.docs || {})) {
    if (key.includes('/customers/')) delete store.docs[key];
  }
}

/** مرة واحدة: مسح كل البيانات المحلية (منتجات، طلبات، عملاء، …) */
export function runFullDataWipe() {
  if (localStorage.getItem(FULL_WIPE_FLAG)) return;

  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(BLOB_KEY);
  localStorage.removeItem(AUTH_KEY);
  for (const legacyKey of LEGACY_STORE_KEYS) localStorage.removeItem(legacyKey);
  localStorage.removeItem(MIGRATION_FLAG);
  localStorage.removeItem(CUSTOMERS_RESET_FLAG);
  localStorage.removeItem('layali-menu-catalog-version');

  localStorage.setItem(STORE_KEY, JSON.stringify({ docs: {} }));
  localStorage.setItem(BLOB_KEY, JSON.stringify({}));
  localStorage.setItem(FULL_WIPE_FLAG, '1');

  authUser = null;
  notifyAll();
}

/** مرة واحدة: حذف كل بيانات العملاء المحفوظة محلياً */
export function runCustomersDataReset() {
  if (localStorage.getItem(CUSTOMERS_RESET_FLAG)) return;

  let store = { docs: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) store = JSON.parse(raw);
  } catch (_) {
    store = { docs: {} };
  }

  stripAllCustomers(store);
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  localStorage.setItem(CUSTOMERS_RESET_FLAG, '1');
  notifyAll();
}

/** مسح كل عملاء مستخدم (تجربة محلية) */
export function clearAllCustomersForUser(uid) {
  const store = loadStore();
  const prefix = `users/${uid}/customers/`;
  for (const key of Object.keys(store.docs || {})) {
    if (key.startsWith(prefix)) delete store.docs[key];
  }
  saveStore(store);
}

function stripLegacySampleProducts(store) {
  for (const key of Object.keys(store.docs || {})) {
    if (!key.includes('/products/')) continue;
    if (isLegacySampleProduct(store.docs[key])) delete store.docs[key];
  }
}

/** مرة واحدة: لا نقل منتجات قديمة + حذف كل العينات الوهمية */
export function runDemoStorageMigration() {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  let store = { docs: {} };
  const currentRaw = localStorage.getItem(STORE_KEY);
  if (currentRaw) {
    try {
      store = JSON.parse(currentRaw);
    } catch (_) {
      store = { docs: {} };
    }
  } else {
    for (const legacyKey of LEGACY_STORE_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      try {
        const old = JSON.parse(raw);
        for (const [key, val] of Object.entries(old.docs || {})) {
          if (!key.includes('/products/')) store.docs[key] = val;
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  stripAllProducts(store);
  stripLegacySampleProducts(store);

  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  for (const legacyKey of LEGACY_STORE_KEYS) localStorage.removeItem(legacyKey);
  localStorage.removeItem('layali-menu-catalog-version');
  localStorage.setItem(MIGRATION_FLAG, '1');
}

export const demoDb = { __demo: true };
export const demoAuth = { __demo: true };
export const demoStorage = { __demo: true };

const listeners = new Set();

function loadStore() {
  runDemoStorageMigration();
  runCustomersDataReset();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  return { docs: {} };
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  notifyAll();
}

function loadBlobs() {
  try {
    const raw = localStorage.getItem(BLOB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  return {};
}

function saveBlobs(blobs) {
  localStorage.setItem(BLOB_KEY, JSON.stringify(blobs));
}

function pathKey(path) {
  return path.join('/');
}

function generateId() {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDemoTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return {
    toDate: () => new Date(d),
    seconds: Math.floor(d.getTime() / 1000),
  };
}

export function serverTimestamp() {
  return { __serverTimestamp: true };
}

function resolveValue(value) {
  if (value && value.__serverTimestamp) return createDemoTimestamp();
  if (value instanceof Date) return createDemoTimestamp(value);
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v);
    return out;
  }
  return value;
}

function getDocData(store, ref) {
  return store.docs[pathKey(ref.path)] ?? null;
}

function setDocData(store, ref, data, merge = false) {
  const key = pathKey(ref.path);
  const resolved = resolveValue(data);
  if (merge && store.docs[key]) {
    store.docs[key] = { ...store.docs[key], ...resolved };
  } else {
    store.docs[key] = resolved;
  }
}

function deleteDocData(store, ref) {
  delete store.docs[pathKey(ref.path)];
}

function getCollectionDocs(store, collectionPath) {
  const prefix = `${pathKey(collectionPath)}/`;
  const docs = [];
  for (const [key, data] of Object.entries(store.docs)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.includes('/')) continue;
    docs.push({ id: rest, data });
  }
  return docs;
}

function sortDocs(docs, constraints) {
  let result = [...docs];
  for (const c of constraints) {
    if (c.type !== 'orderBy') continue;
    const dir = c.direction === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      const av = fieldSortValue(a.data[c.field]);
      const bv = fieldSortValue(b.data[c.field]);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }
  return result;
}

function fieldSortValue(v) {
  if (v == null) return 0;
  if (v.toDate) return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return String(v);
}

function makeDocSnapshot(ref, data) {
  const id = ref.path[ref.path.length - 1];
  return {
    id,
    exists: () => data != null,
    data: () => (data != null ? { ...data } : undefined),
  };
}

function makeQuerySnapshot(docs) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => ({ ...d.data }),
    })),
    empty: docs.length === 0,
  };
}

function fireListener(entry) {
  const store = loadStore();
  try {
    if (entry.kind === 'doc') {
      entry.callback(makeDocSnapshot(entry.ref, getDocData(store, entry.ref)));
      return;
    }
    const collectionPath = entry.collection.path;
    let docs = getCollectionDocs(store, collectionPath);
    docs = sortDocs(docs, entry.constraints || []);
    entry.callback(makeQuerySnapshot(docs));
  } catch (err) {
    if (entry.onError) entry.onError(err);
  }
}

function notifyAll() {
  listeners.forEach(fireListener);
}

export function collection(_db, ...pathSegments) {
  return { type: 'collection', path: pathSegments };
}

export function doc(first, ...segments) {
  const path = first?.type === 'collection' ? [...first.path, generateId()] : segments;
  return { type: 'doc', path, id: path[path.length - 1] };
}

export function query(collectionRef, ...constraints) {
  return { type: 'query', collection: collectionRef, constraints };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function where() {
  return { type: 'where' };
}

export function onSnapshot(refOrQuery, onNext, onError) {
  let entry;
  if (refOrQuery.type === 'query') {
    entry = {
      kind: 'query',
      collection: refOrQuery.collection,
      constraints: refOrQuery.constraints,
      callback: onNext,
      onError,
    };
  } else if (refOrQuery.type === 'collection') {
    entry = {
      kind: 'query',
      collection: refOrQuery,
      constraints: [],
      callback: onNext,
      onError,
    };
  } else {
    entry = { kind: 'doc', ref: refOrQuery, callback: onNext, onError };
  }
  listeners.add(entry);
  fireListener(entry);
  return () => listeners.delete(entry);
}

export async function addDoc(collectionRef, data) {
  const id = generateId();
  const ref = { type: 'doc', path: [...collectionRef.path, id] };
  const store = loadStore();
  setDocData(store, ref, data, false);
  saveStore(store);
  return ref;
}

export async function setDoc(ref, data, options) {
  const store = loadStore();
  setDocData(store, ref, data, Boolean(options?.merge));
  saveStore(store);
}

export async function updateDoc(ref, data) {
  const store = loadStore();
  setDocData(store, ref, data, true);
  saveStore(store);
}

export async function deleteDoc(ref) {
  const store = loadStore();
  deleteDocData(store, ref);
  saveStore(store);
}

export async function getDocs(q) {
  const store = loadStore();
  let docs = getCollectionDocs(store, q.collection.path);
  docs = sortDocs(docs, q.constraints || []);
  return makeQuerySnapshot(docs);
}

export async function getDoc(ref) {
  const store = loadStore();
  return makeDocSnapshot(ref, getDocData(store, ref));
}

class DemoTransaction {
  constructor(store) {
    this.store = store;
    this.writes = [];
  }

  getEffectiveData(ref) {
    const key = pathKey(ref.path);
    let data = getDocData(this.store, ref);
    for (const w of this.writes) {
      if (pathKey(w.ref.path) !== key) continue;
      if (w.deleted) data = undefined;
      else data = w.merge ? { ...(data ?? {}), ...w.data } : w.data;
    }
    return data;
  }

  async get(ref) {
    return makeDocSnapshot(ref, this.getEffectiveData(ref));
  }

  set(ref, data, options) {
    this.writes.push({
      ref,
      data: resolveValue(data),
      merge: Boolean(options?.merge),
    });
  }

  update(ref, data) {
    this.writes.push({
      ref,
      data: resolveValue(data),
      merge: true,
    });
  }

  delete(ref) {
    this.writes.push({ ref, deleted: true });
  }

  commitToStore() {
    for (const w of this.writes) {
      if (w.deleted) deleteDocData(this.store, w.ref);
      else setDocData(this.store, w.ref, w.data, w.merge);
    }
  }
}

export async function runTransaction(_db, updateFunction) {
  const store = loadStore();
  const tx = new DemoTransaction(store);
  await updateFunction(tx);
  tx.commitToStore();
  saveStore(store);
}

export function writeBatch(_db) {
  const ops = [];
  return {
    update(ref, data) {
      ops.push({ ref, data: resolveValue(data), merge: true });
    },
    async commit() {
      const store = loadStore();
      for (const op of ops) {
        setDocData(store, op.ref, op.data, op.merge);
      }
      saveStore(store);
    },
  };
}

let authUser = null;
const authListeners = new Set();

function loadAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function persistAuthUser(user) {
  authUser = user;
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
  authListeners.forEach((cb) => cb(user));
}

authUser = loadAuthUser();

export function onAuthStateChanged(_auth, callback) {
  authListeners.add(callback);
  queueMicrotask(() => callback(authUser));
  return () => authListeners.delete(callback);
}

export async function signInWithEmailAndPassword(_auth, email, _password) {
  const user = { uid: DEMO_UID, email, displayName: email };
  persistAuthUser(user);
  return { user };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function signOut(_auth) {
  persistAuthUser(null);
}

export async function sendPasswordResetEmail() {
  alert('الوضع التجريبي: إعادة تعيين كلمة المرور غير متاحة محلياً.');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ref(_storage, path) {
  return { path };
}

export async function uploadBytes(storageRef, file) {
  const url = await readFileAsDataUrl(file);
  const blobs = loadBlobs();
  blobs[storageRef.path] = url;
  saveBlobs(blobs);
}

export async function getDownloadURL(storageRef) {
  const blobs = loadBlobs();
  return blobs[storageRef.path] || '';
}

export async function ensureDemoProfile(uid) {
  const store = loadStore();
  const key = `users/${uid}`;
  if (store.docs[key]) return;

  const now = createDemoTimestamp();
  store.docs[key] = {
    businessName: 'ليالي كافيه',
    logoUrl: `${process.env.PUBLIC_URL || ''}/logo5.png`,
    businessType: 'مقهى',
    ownerName: '',
    phone: '',
    address: '',
    email: ADMIN_LOGIN_EMAIL,
    tax: 0,
    serviceCharge: 0,
    receiptHeader: 'ليالي كافيه',
    receiptFooter: 'شكراً لزيارتكم',
    paymentMethods: { cash: true, qris: true, debit: true, credit: true },
    rounding: false,
    createdAt: now,
  };
  saveStore(store);
}

export async function enterLocalDemo(_auth) {
  await signInWithEmailAndPassword(_auth, ADMIN_LOGIN_EMAIL, 'demo');
  await ensureDemoProfile(DEMO_UID);
}

export async function signInWithAdminPassword(_auth, password) {
  if (!String(password || '').trim()) {
    throw new Error('كلمة المرور غير صحيحة');
  }
  await signInWithEmailAndPassword(_auth, ADMIN_LOGIN_EMAIL, password);
  await ensureDemoProfile(DEMO_UID);
}
