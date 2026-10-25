import fs from "fs";
import { dataFile } from "./dataDir";

/**
 * Desktop app settings, shared with the Electron shell (which reads
 * sanctionsLists to configure Watchman). One JSON file in the data dir.
 */
export type AppSettings = {
  backgroundScreening: { enabled: boolean; intervalHours: number };
  /** Watchman source lists, e.g. us_ofac, eu_csl, uk_csl, un_csl, us_non_sdn. */
  sanctionsLists: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  backgroundScreening: { enabled: true, intervalHours: 24 },
  sanctionsLists: ["us_ofac", "eu_csl"],
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

const file = () => dataFile("settings.json");

export function readSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<AppSettings>;
    return {
      backgroundScreening: { ...DEFAULT_SETTINGS.backgroundScreening, ...(raw.backgroundScreening ?? {}) },
      sanctionsLists: Array.isArray(raw.sanctionsLists) && raw.sanctionsLists.length ? raw.sanctionsLists : DEFAULT_SETTINGS.sanctionsLists,
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const cur = readSettings();
  const next: AppSettings = {
    backgroundScreening: { ...cur.backgroundScreening, ...(patch.backgroundScreening ?? {}) },
    sanctionsLists: patch.sanctionsLists ?? cur.sanctionsLists,
  };
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
  return next;
}
