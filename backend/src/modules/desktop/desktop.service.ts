import fs from "fs";
import { HttpError, badRequest, notFound } from "../../http/httpError";
import { createBackup, stageRestore } from "../../lib/infra/backup";
import { dataFile } from "../../lib/infra/dataDir";
import { databaseFile } from "../../lib/infra/db";
import { eraseLocalData } from "../../lib/infra/eraseData";
import { getWatchFolder, scanWatchedFolders, setWatchFolder } from "../../lib/infra/folderWatch";
import {
  AVAILABLE_SANCTIONS_LISTS,
  readSettings,
  validateScreeningSettings,
  writeSettings,
} from "../../lib/infra/settings";
import { defaultScreeningThresholds } from "../../lib/screening/screeningConfig";
import { fetchWatchmanListInfo, getWatchmanBaseUrl } from "../../lib/screening/watchman";
import * as startupsRepository from "../startups/startups.repository";

/** Desktop-only: settings, sanctions data, backup/restore, watched folders. */

/** Exit code the Electron supervisor treats as "restart me" (not a crash). */
export const RESTART_EXIT_CODE = 75;

const MAX_INTERVAL_HOURS = 24 * 30;

export function getSettings() {
  const { watchmanDebug: _debug, ...screeningDefaults } = defaultScreeningThresholds();
  return {
    settings: readSettings(),
    availableLists: AVAILABLE_SANCTIONS_LISTS,
    databaseFile: databaseFile(),
    screeningDefaults,
  };
}

export type SettingsPatch = {
  backgroundScreening?: { enabled?: unknown; intervalHours?: unknown };
  sanctionsLists?: unknown;
  screening?: unknown;
};

/**
 * Applies the fields present. Re-screen interval is clamped to 1 h – 30 days;
 * at least one sanctions list must stay on; screening null resets to the firm
 * defaults. The desktop shell watches settings.json and reloads Watchman when
 * the lists change.
 */
export function updateSettings(body: SettingsPatch) {
  const patch: Parameters<typeof writeSettings>[0] = {};
  if (body.backgroundScreening) {
    const cur = readSettings().backgroundScreening;
    const hours = Number(body.backgroundScreening.intervalHours ?? cur.intervalHours);
    patch.backgroundScreening = {
      enabled: typeof body.backgroundScreening.enabled === "boolean" ? body.backgroundScreening.enabled : cur.enabled,
      intervalHours: Number.isFinite(hours) ? Math.min(MAX_INTERVAL_HOURS, Math.max(1, Math.round(hours))) : cur.intervalHours,
    };
  }
  if (body.sanctionsLists !== undefined) {
    const valid = new Set(AVAILABLE_SANCTIONS_LISTS.map((l) => l.id));
    const lists = Array.isArray(body.sanctionsLists) ? body.sanctionsLists.map(String).filter((l) => valid.has(l)) : [];
    if (!lists.length) throw badRequest("Choose at least one sanctions list");
    patch.sanctionsLists = lists;
  }
  if (body.screening !== undefined) {
    if (body.screening === null) {
      patch.screening = null;
    } else {
      const v = validateScreeningSettings(body.screening);
      if ("error" in v) throw badRequest(v.error);
      patch.screening = v.value;
    }
  }
  return { settings: writeSettings(patch) };
}

/** Start fresh: erase everything the user added (keeps sign-in, AI setup and settings). */
export async function eraseData(confirm: unknown) {
  if (confirm !== "ERASE") throw badRequest("Type ERASE to confirm.");
  try {
    return await eraseLocalData();
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : "Couldn't erase the data");
  }
}

/** Written by the desktop shell: "online", or "offline" when using its list snapshot. */
function engineStatus(): { mode: "online" | "offline"; cached: Record<string, string> } {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile("watchman", "status.json"), "utf8")) as {
      mode?: string;
      cached?: Record<string, string>;
    };
    return { mode: raw.mode === "offline" ? "offline" : "online", cached: raw.cached ?? {} };
  } catch {
    return { mode: "online", cached: {} };
  }
}

export async function sanctionsStatus() {
  const info = await fetchWatchmanListInfo();
  return {
    engineUrl: getWatchmanBaseUrl(),
    available: !!info,
    info,
    configured: readSettings().sanctionsLists,
    ...engineStatus(),
  };
}

export function backup(password: string) {
  try {
    return createBackup(password);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Backup failed");
  }
}

/**
 * Stages a backup for restore and exits so the shell restarts the backend;
 * the swap happens before the database opens on the next start.
 */
export function restore(file: Buffer, password: string) {
  let manifest;
  try {
    manifest = stageRestore(file, password);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Restore failed");
  }
  setTimeout(() => process.exit(RESTART_EXIT_CODE), 300);
  return manifest;
}

export function watchFolder(startupId: string) {
  return getWatchFolder(startupId);
}

/** New CSVs dropped into the folder are uploaded to the startup. Null stops watching. */
export async function setStartupWatchFolder(startupId: string, userId: string, folder: string | null) {
  if (!(await startupsRepository.findOwned(startupId, userId))) throw notFound("Startup not found");
  try {
    setWatchFolder(startupId, folder);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Could not watch folder");
  }
  if (folder) void scanWatchedFolders();
  return getWatchFolder(startupId);
}
