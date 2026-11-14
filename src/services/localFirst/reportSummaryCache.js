/**
 * CACHE_ONLY historical business day summaries (admin reports / archive).
 */

import { listBusinessDaySummaries } from '../businessDayService';

/** @type {Map<string, { rows: object[], expires: number }>} */
const cache = new Map();
const TTL_MS = 5 * 60_000;

export async function loadRecentBusinessSummaries(uid, { max = 60, force = false } = {}) {
  const key = `summaries:${uid}:${max}`;
  const hit = cache.get(key);
  if (!force && hit && hit.expires > Date.now()) {
    return hit.rows;
  }
  const rows = await listBusinessDaySummaries(uid, max);
  cache.set(key, { rows, expires: Date.now() + TTL_MS });
  return rows;
}

export function invalidateReportSummaryCache(uid) {
  for (const k of cache.keys()) {
    if (k.startsWith(`summaries:${uid}:`)) cache.delete(k);
  }
}

export function clearReportSummaryCache() {
  cache.clear();
}