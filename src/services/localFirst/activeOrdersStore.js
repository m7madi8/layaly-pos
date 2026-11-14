import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from '../../firebaseClient';
import { EMPLOYEE_OPEN_ORDER_STATUSES } from '../../utils/firestoreOrderQueries';
import { mapOrderSnapshot } from '../../utils/firestoreOrderQueries';

const PAGE = 50;
/** Safety cap — if exceeded, UI must show incomplete (extremely rare for open bills). */
const HARD_CAP = 500;

function ordersCol(uid) {
  return collection(db, 'users', uid, 'orders');
}

/**
 * Paginated load of every unpaid/partial order (any date). Read on mount / refresh only.
 */
export async function fetchAllActiveOrders(uid, { pageSize = PAGE, force = false } = {}) {
  if (!uid) {
    return { orders: [], complete: true, truncated: false, pages: 0 };
  }

  const cacheKey = `active:${uid}`;
  if (!force && fetchAllActiveOrders._cache?.key === cacheKey) {
    return fetchAllActiveOrders._cache.value;
  }

  const acc = [];
  let cursor = null;
  let pages = 0;
  let complete = true;
  let truncated = false;

  while (pages < 200) {
    let q = query(
      ordersCol(uid),
      where('status', 'in', EMPLOYEE_OPEN_ORDER_STATUSES),
      orderBy('timestamp', 'desc'),
      limit(pageSize)
    );
    if (cursor) {
      q = query(
        ordersCol(uid),
        where('status', 'in', EMPLOYEE_OPEN_ORDER_STATUSES),
        orderBy('timestamp', 'desc'),
        startAfter(cursor),
        limit(pageSize)
      );
    }

    const snap = await getDocs(q);
    pages += 1;
    const batch = mapOrderSnapshot(snap);
    acc.push(...batch);

    if (acc.length >= HARD_CAP) {
      truncated = true;
      complete = false;
      break;
    }
    if (snap.docs.length < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  const value = { orders: acc, complete, truncated, pages };
  fetchAllActiveOrders._cache = { key: cacheKey, value };
  return value;
}

export function invalidateActiveOrdersCache(uid) {
  if (fetchAllActiveOrders._cache?.key === `active:${uid}`) {
    fetchAllActiveOrders._cache = null;
  }
}

export function clearActiveOrdersCache() {
  fetchAllActiveOrders._cache = null;
}