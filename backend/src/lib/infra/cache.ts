import type { WatchmanMatch } from "../../types/screening";

// ---------------------------------------------------------------------------
// Shared async interface.
// ---------------------------------------------------------------------------

export interface AsyncCache<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Remove all live keys whose name starts with `prefix`. */
  invalidatePrefix(prefix: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory cache.
// ---------------------------------------------------------------------------

interface MemEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache<T> implements AsyncCache<T> {
  private store = new Map<string, MemEntry<T>>();
  private readonly maxSize: number;
  private timer: ReturnType<typeof setInterval>;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.timer = setInterval(() => this.evict(), 60_000);
    this.timer.unref();
  }

  async get(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.store.delete(key); return null; }
    return e.value;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.store.size >= this.maxSize) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private evict(): void {
    const now = Date.now();
    for (const [k, e] of this.store) if (now > e.expiresAt) this.store.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Factory — single desktop process, so an in-memory cache is always correct.
// ---------------------------------------------------------------------------

function createCache<T>(maxMemorySize = 1_000): AsyncCache<T> {
  return new MemoryCache<T>(maxMemorySize);
}

// ---------------------------------------------------------------------------
// TTL constants (ms).
// ---------------------------------------------------------------------------

export const TTL = {
  /** Watchman Docker lists are static in-session — 5 min is safe. */
  watchman: 5 * 60_000,
  startupList: 30_000,
  startupDetail: 30_000,
  csvList: 30_000,
  userProfile: 2 * 60_000,
  chatList: 30_000,
  workflowList: 60_000,
} as const;

// ---------------------------------------------------------------------------
// Singleton caches — one per data domain, used across all routes.
// ---------------------------------------------------------------------------

export const watchmanCache = createCache<WatchmanMatch[]>(5_000);
export const startupListCache = createCache<unknown[]>(500);
export const startupDetailCache = createCache<unknown>(2_000);
export const csvListCache = createCache<unknown[]>(2_000);
export const userProfileCache = createCache<unknown>(500);
export const chatListCache = createCache<unknown[]>(500);
export const workflowListCache = createCache<unknown[]>(500);

// ---------------------------------------------------------------------------
// Key builders — keeps naming consistent across all callers.
// ---------------------------------------------------------------------------

export const cacheKey = {
  startupList: (userId: string) => `startups:list:${userId}`,
  startupDetail: (startupId: string, userId: string) =>
    `startups:detail:${startupId}:${userId}`,
  csvList: (startupId: string) => `csvs:list:${startupId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,
  chatList: (userId: string) => `chats:list:${userId}`,
  workflowList: (userId: string, userEmail: string, type?: string) =>
    `workflows:list:${userId}:${userEmail}:${type ?? "all"}`,
  watchman: (name: string, type: string, hintsSuffix = "") =>
    `watchman:${name.toLowerCase().trim()}:${type}:${hintsSuffix}`,
} as const;
