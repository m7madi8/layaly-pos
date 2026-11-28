/**
 * CACHE_ONLY historical business day summaries (admin reports / archive).
 */

import { listBusinessDaySummaries, hydrateBusinessDaySummaryForDisplay } from '../businessDayService';

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
  const hydrated = await Promise.all(
    rows.map((row) => hydrateBusinessDaySummaryForDisplay(uid, row))
  );
  cache.set(key, { rows: hydrated, expires: Date.now() + TTL_MS });
  return hydrated;
}

export function invalidateReportSummaryCache(uid) {
  for (const k of cache.keys()) {
    if (k.startsWith(`summaries:${uid}:`)) cache.delete(k);
  }
}

export function clearReportSummaryCache() {
  cache.clear();
}