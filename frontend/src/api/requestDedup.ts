/**
 * In-flight request deduplication for frontend API calls.
 *
 * Concurrent callers for the same key share a single in-flight Promise.
 * Entry is removed when the Promise settles so future calls go through
 * normally (hitting the apiCache or firing a fresh fetch).
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
