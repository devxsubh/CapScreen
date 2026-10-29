import type { WatchmanMatch } from "../../types/screening";

/**
 * Watchman results per entity + query hints. Lists only change on Watchman's
 * 12-hour refresh, so 5 minutes is safe and saves repeat lookups when the same
 * names are screened again (re-screens, chat follow-ups, rosters).
 */
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 5_000;

const entries = new Map<string, { value: WatchmanMatch[]; expiresAt: number }>();

export function watchmanCacheKey(name: string, type: string, hintsSuffix = ""): string {
  return `${name.toLowerCase().trim()}:${type}:${hintsSuffix}`;
}

export const watchmanCache = {
  get(key: string): WatchmanMatch[] | null {
    const e = entries.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      entries.delete(key);
      return null;
    }
    return e.value;
  },
  set(key: string, value: WatchmanMatch[]): void {
    if (entries.size >= MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  },
};
