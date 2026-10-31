/**
 * In-flight request deduplication.
 *
 * If two async callers request the same key simultaneously, only one
 * underlying fetch fires. The second caller receives the same Promise,
 * so it waits for and shares the single result.
 *
 * The entry is removed from the map the moment the Promise settles, so
 * future callers go to the cache (or fire a fresh request) as normal.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inflight = new Map<string, Promise<any>>();

export function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

