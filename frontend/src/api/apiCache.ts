/** In-memory TTL cache for frontend API calls. */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class ApiCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

/** TTL constants (ms) aligned to backend cache lifetimes. */
export const CLIENT_TTL = {
  startupList: 25_000,   // slightly shorter than backend 30s — stays in sync
  startupDetail: 25_000,
  csvList: 25_000,
} as const;

// Module-level singletons — survive navigation within the SPA session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const startupListCache = new ApiCache<any[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const startupDetailCache = new ApiCache<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const csvListCache = new ApiCache<any[]>();
