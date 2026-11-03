/**
 * One Firestore onSnapshot subscription per stable key; fan-out to React subscribers.
 */

/** @type {Map<string, { unsub: (() => void) | null, subscribers: Set<(data: unknown) => void>, last: unknown }>} */
const pools = new Map();

export function sharedOnSnapshot(key, startSubscription, mapSnapshot, onNext, onError) {
  const poolKey = String(key);
  let pool = pools.get(poolKey);

  if (!pool) {
    pool = { unsub: null, subscribers: new Set(), last: undefined };
    pools.set(poolKey, pool);
    const deliver = (raw) => {
      const mapped = mapSnapshot ? mapSnapshot(raw) : raw;
      pool.last = mapped;
      pool.subscribers.forEach((fn) => fn(mapped));
    };
    pool.unsub = startSubscription(deliver, onError);
  }

  pool.subscribers.add(onNext);
  if (pool.last !== undefined) onNext(pool.last);

  return () => {
    const active = pools.get(poolKey);
    if (!active) return;
    active.subscribers.delete(onNext);
    if (active.subscribers.size === 0) {
      active.unsub?.();
      pools.delete(poolKey);
    }
  };
}

export function getActiveSharedListenerCount() {
  return pools.size;
}

export function teardownAllSharedListeners() {
  for (const pool of pools.values()) {
    pool.unsub?.();
  }
  pools.clear();
}
