/**
 * Local-first product catalog: one realtime listener per uid while attached;
 * retains in-memory catalog when detached (navigation) to avoid blank POS.
 */

import { collection, onSnapshot, getDoc, doc, db } from '../../firebaseClient';
import { sharedOnSnapshot } from '../firestoreSharedListeners';

/** @type {Map<string, { products: object[], subscribers: Set<Function>, detachedAt?: number }>} */
const catalogs = new Map();

const POOL_PREFIX = 'product-catalog:';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function deliver(uid) {
  const cat = catalogs.get(uid);
  if (!cat) return;
  const list = cat.products;
  cat.subscribers.forEach((fn) => fn(list));
}

export function getProductCatalogSnapshot(uid) {
  return catalogs.get(uid)?.products || [];
}

/**
 * @param {string} uid
 * @param {(products: object[]) => void} onChange
 * @returns {() => void} detach
 */
export function attachProductCatalog(uid, onChange) {
  if (!uid) return () => {};

  let cat = catalogs.get(uid);
  if (!cat) {
    cat = { products: [], subscribers: new Set() };
    catalogs.set(uid, cat);
  }
  cat.subscribers.add(onChange);
  if (cat.products.length) onChange(cat.products);

  const poolKey = `${POOL_PREFIX}${uid}`;
  const detachShared = sharedOnSnapshot(
    poolKey,
    (deliverSnap, onError) =>
      onSnapshot(
        collection(db, 'users', uid, 'products'),
        (snapshot) => deliverSnap(mapSnapshot(snapshot)),
        onError
      ),
    null,
    (list) => {
      const active = catalogs.get(uid);
      if (!active) return;
      active.products = list;
      deliver(uid);
    },
    (error) => console.error('Product catalog listener:', error)
  );

  return () => {
    cat.subscribers.delete(onChange);
    detachShared();
  };
}

export function patchProductInCatalog(uid, productId, partial) {
  const cat = catalogs.get(uid);
  if (!cat) return;
  const idx = cat.products.findIndex((p) => p.id === productId);
  if (idx >= 0) {
    cat.products[idx] = { ...cat.products[idx], ...partial };
  } else if (partial?.name) {
    cat.products.push({ id: productId, ...partial });
  }
  deliver(uid);
}

export function removeProductFromCatalog(uid, productId) {
  const cat = catalogs.get(uid);
  if (!cat) return;
  cat.products = cat.products.filter((p) => p.id !== productId);
  deliver(uid);
}

/** Authoritative refresh before sensitive pricing/stock sale (network read). */
export async function refreshProductsForSale(uid, productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (!uid || !ids.length) return [];
  const fresh = await Promise.all(
    ids.map(async (id) => {
      const snap = await getDoc(doc(db, 'users', uid, 'products', id));
      return snap.exists() ? { id: snap.id, ...snap.data(), __fresh: true } : null;
    })
  );
  const rows = fresh.filter(Boolean);
  for (const row of rows) {
    patchProductInCatalog(uid, row.id, row);
  }
  return rows;
}

export function clearProductCatalog(uid) {
  if (uid) catalogs.delete(uid);
  else catalogs.clear();
}