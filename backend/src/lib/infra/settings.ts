import fs from "fs";
import { dataFile } from "./dataDir";

/** User-tunable screening thresholds (Settings → Screening). Null = firm defaults. */
export type ScreeningSettings = {
  /** Lowest Watchman score returned at all (0–1). */
  watchmanMinMatch: number;
  /** Top score at or above this needs analyst review (0–1). */
  reviewMinScore: number;
  /** Top score at or above this is flagged (0–1). */
  flaggedMinScore: number;
  /** Indirect stake that triggers beneficial-owner review (%). */
  beneficialOwnerPct: number;
  /** Aggregate blocked-party stake that triggers the OFAC 50% rule (%). */
  ofacOwnershipRulePct: number;
  /** Max Watchman hits per entity. */
  watchmanResultLimit: number;
};

/**
 * Desktop app settings, shared with the Electron shell (which reads
 * sanctionsLists to configure Watchman). One JSON file in the data dir.
 */
export type AppSettings = {
  backgroundScreening: { enabled: boolean; intervalHours: number };
  /** Watchman source lists, e.g. us_ofac, eu_csl, uk_csl, un_csl, us_non_sdn. */
  sanctionsLists: string[];
  screening: ScreeningSettings | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  backgroundScreening: { enabled: true, intervalHours: 24 },
  sanctionsLists: ["us_ofac", "eu_csl"],
  screening: null,
};

export const AVAILABLE_SANCTIONS_LISTS: Array<{ id: string; label: string }> = [
  { id: "us_ofac", label: "US OFAC — SDN list" },
  { id: "us_non_sdn", label: "US OFAC — Non-SDN consolidated" },
  { id: "us_csl", label: "US Consolidated Screening List (Commerce/State/Treasury)" },
  { id: "eu_csl", label: "EU Consolidated Financial Sanctions" },
  { id: "uk_csl", label: "UK HM Treasury (OFSI) Consolidated List" },
  { id: "un_csl", label: "UN Security Council Consolidated List" },
  { id: "us_fincen_311", label: "FinCEN Section 311 special measures" },
];

/**
 * Validate user-supplied thresholds. Ownership thresholds may be stricter than
 * the regulatory ones (OFAC 50%, FinCEN 25%) but never looser.
 */
export function validateScreeningSettings(raw: unknown): { value: ScreeningSettings } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fields: Array<[keyof ScreeningSettings, string, number, number]> = [
    ["watchmanMinMatch", "Minimum match score", 0.5, 0.99],
    ["reviewMinScore", "Review threshold", 0.5, 0.99],
    ["flaggedMinScore", "Flag threshold", 0.5, 1],
    ["beneficialOwnerPct", "Beneficial-owner threshold", 1, 25],
    ["ofacOwnershipRulePct", "OFAC ownership threshold", 1, 50],
    ["watchmanResultLimit", "Matches per entity", 1, 100],
  ];
  const value = {} as ScreeningSettings;
  for (const [key, label, min, max] of fields) {
    const n = Number(r[key]);
    if (!Number.isFinite(n) || n < min || n > max) return { error: `${label} must be between ${min} and ${max}` };
    value[key] = key === "watchmanResultLimit" ? Math.round(n) : n;
  }
  if (value.reviewMinScore < value.watchmanMinMatch) {
    return { error: "Review threshold can't be below the minimum match score, or those matches would be dropped" };
  }
  if (value.flaggedMinScore < value.reviewMinScore) return { error: "Flag threshold can't be below the review threshold" };
  return { value };
}

const file = () => dataFile("settings.json");

// Screening reads settings per entity, so skip the parse while the file is unchanged.
let cache: { mtimeMs: number; size: number; path: string; settings: AppSettings } | null = null;

function parse(path: string): AppSettings {
  const raw = JSON.parse(fs.readFileSync(path, "utf8")) as Partial<AppSettings>;
  const screening = raw.screening ? validateScreeningSettings(raw.screening) : null;
  return {
    backgroundScreening: { ...DEFAULT_SETTINGS.backgroundScreening, ...(raw.backgroundScreening ?? {}) },
    sanctionsLists: Array.isArray(raw.sanctionsLists) && raw.sanctionsLists.length ? raw.sanctionsLists : DEFAULT_SETTINGS.sanctionsLists,
    // A hand-edited file with bad thresholds falls back to the defaults rather than screening loosely.
    screening: screening && "value" in screening ? screening.value : null,
  };
}

export function readSettings(): AppSettings {
  try {
    const path = file();
    const { mtimeMs, size } = fs.statSync(path);
    if (cache?.path !== path || cache.mtimeMs !== mtimeMs || cache.size !== size) cache = { mtimeMs, size, path, settings: parse(path) };
    return structuredClone(cache.settings);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const cur = readSettings();
  const next: AppSettings = {
    backgroundScreening: { ...cur.backgroundScreening, ...(patch.backgroundScreening ?? {}) },
    sanctionsLists: patch.sanctionsLists ?? cur.sanctionsLists,
    screening: patch.screening !== undefined ? patch.screening : cur.screening,
  };
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
  cache = null;
  return next;
}
