// Cache-first data access: serve what's on the device immediately, revalidate
// in the background. The UI must never wait on the network for data it has
// seen before. Backed by localStorage (small JSON) — imagery uses IndexedDB
// in skycache.ts, API payloads use SQLite TTLs server-side.

import { lsGet, lsSet } from '@/lib/skycache';

export interface Fresh<T> {
  data: T;
  /** true when served from device cache (a refresh may be in flight) */
  stale: boolean;
}

function age(key: string): number {
  try {
    const t = Number(localStorage.getItem(`${key}:at`) || 0);
    return Date.now() - t;
  } catch {
    return Infinity;
  }
}

function stamp(key: string) {
  try {
    localStorage.setItem(`${key}:at`, String(Date.now()));
  } catch { /* noop */ }
}

/** Store a value with a freshness timestamp (for use with peek). */
export function remember<T>(key: string, value: T) {
  lsSet(key, value);
  stamp(key);
}

/** Read-through cache: cached value (any age) or null. */
export function peek<T>(key: string): T | null {
  return lsGet<T>(key);
}

/**
 * Stale-while-revalidate JSON fetch.
 * - Returns cached data instantly when present (stale=true) and refreshes.
 * - Returns fresh data when cache is young (stale=false).
 * - Awaits network only when nothing is cached.
 * Never throws: resolves null when offline with an empty cache.
 */
export async function swr<T>(key: string, url: string, maxAgeMs: number): Promise<Fresh<T> | null> {
  const cached = lsGet<T>(key);
  // Immutable build artifacts (Infinity TTL) never change: serve and skip
  // the revalidation fetch entirely (saves one request per panel mount).
  if (cached !== null && !Number.isFinite(maxAgeMs)) {
    return { data: cached, stale: false };
  }
  const fresh = cached !== null && age(key) < maxAgeMs;
  const refresh = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const j = (await r.json()) as T;
      lsSet(key, j);
      stamp(key);
      return j;
    } catch {
      return undefined;
    }
  })();
  if (fresh) {
    void refresh;
    return { data: cached as T, stale: false };
  }
  if (cached !== null) {
    void refresh.then((j) => {
      // same { key, data } contract as showcases.ts notifyRevalidated, so
      // listeners can swap the fresh payload in without a reload
      if (j !== undefined) window.dispatchEvent(new CustomEvent('sh-revalidate', { detail: { key, data: j } }));
    });
    return { data: cached, stale: true };
  }
  const j = await refresh;
  if (j === undefined) return null;
  return { data: j, stale: false };
}
