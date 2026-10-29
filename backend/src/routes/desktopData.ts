import crypto from "crypto";
import fs from "fs";
import { dataFile } from "../lib/infra/dataDir";
import express from "express";
import { createBackup, stageRestore } from "../lib/infra/backup";
import { getWatchFolder, scanWatchedFolders, setWatchFolder } from "../lib/infra/folderWatch";
import { AVAILABLE_SANCTIONS_LISTS, readSettings, validateScreeningSettings, writeSettings } from "../lib/infra/settings";
import { defaultScreeningThresholds } from "../lib/screening/screeningConfig";
import { databaseFile } from "../lib/infra/db";
import { fetchWatchmanListInfo, getWatchmanBaseUrl } from "../lib/screening/watchman";
import { AuditLog } from "../models";
import { ownerFilter } from "./startups/middleware";
import { Startup } from "../models";

/** Desktop-only: settings, sanctions data, backup/restore, watched folders, verified audit export. */
export const desktopDataRouter = express.Router();

/** Exit code the Electron supervisor treats as "restart me" (not a crash). */
export const RESTART_EXIT_CODE = 75;

desktopDataRouter.get("/settings", (_req, res) => {
  const { watchmanDebug: _debug, ...screeningDefaults } = defaultScreeningThresholds();
  res.json({
    settings: readSettings(),
    availableLists: AVAILABLE_SANCTIONS_LISTS,
    databaseFile: databaseFile(),
    screeningDefaults,
  });
});

desktopDataRouter.put("/settings", (req, res) => {
  const body = req.body as {
    backgroundScreening?: { enabled?: unknown; intervalHours?: unknown };
    sanctionsLists?: unknown;
    screening?: unknown;
  };
  const patch: Parameters<typeof writeSettings>[0] = {};
  if (body.backgroundScreening) {
    const cur = readSettings().backgroundScreening;
    const hours = Number(body.backgroundScreening.intervalHours ?? cur.intervalHours);
    patch.backgroundScreening = {
      enabled: typeof body.backgroundScreening.enabled === "boolean" ? body.backgroundScreening.enabled : cur.enabled,
      intervalHours: Number.isFinite(hours) ? Math.min(24 * 30, Math.max(1, Math.round(hours))) : cur.intervalHours,
    };
  }
  if (body.sanctionsLists !== undefined) {
    const valid = new Set(AVAILABLE_SANCTIONS_LISTS.map((l) => l.id));
    const lists = Array.isArray(body.sanctionsLists) ? body.sanctionsLists.map(String).filter((l) => valid.has(l)) : [];
    if (!lists.length) {
      res.status(400).json({ detail: "Choose at least one sanctions list" });
      return;
    }
    patch.sanctionsLists = lists;
  }
  if (body.screening !== undefined) {
    // null resets to the firm defaults.
    if (body.screening === null) {
      patch.screening = null;
    } else {
      const v = validateScreeningSettings(body.screening);
      if ("error" in v) {
        res.status(400).json({ detail: v.error });
        return;
      }
      patch.screening = v.value;
    }
  }
  // The desktop shell watches settings.json and reloads Watchman when lists change.
  res.json({ settings: writeSettings(patch) });
});

/** Written by the desktop shell: "online", or "offline" when using its list snapshot. */
function engineStatus(): { mode: "online" | "offline"; cached: Record<string, string> } {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile("watchman", "status.json"), "utf8")) as { mode?: string; cached?: Record<string, string> };
    return { mode: raw.mode === "offline" ? "offline" : "online", cached: raw.cached ?? {} };
  } catch {
    return { mode: "online", cached: {} };
  }
}

desktopDataRouter.get("/sanctions", async (_req, res) => {
  const info = await fetchWatchmanListInfo();
  res.json({
    engineUrl: getWatchmanBaseUrl(),
    available: !!info,
    info,
    configured: readSettings().sanctionsLists,
    ...engineStatus(),
  });
});

desktopDataRouter.post("/backup", (req, res) => {
  const password = String((req.body as { password?: unknown }).password ?? "");
  try {
    const { file, manifest } = createBackup(password);
    const stamp = manifest.createdAt.slice(0, 10);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="capscreen-${stamp}.capscreen-backup"`);
    res.setHeader("X-Backup-Entries", String(manifest.entries.length));
    res.send(file);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : "Backup failed" });
  }
});

desktopDataRouter.post(
  "/restore",
  express.raw({ type: "application/octet-stream", limit: "2gb" }),
  (req, res) => {
    const password = req.header("x-backup-password") ?? "";
    try {
      const manifest = stageRestore(req.body as Buffer, decodeURIComponent(password));
      res.json({ ok: true, createdAt: manifest.createdAt, entries: manifest.entries.length, restarting: true });
      // Swap happens before the database opens on the next start.
      setTimeout(() => process.exit(RESTART_EXIT_CODE), 300);
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : "Restore failed" });
    }
  },
);

desktopDataRouter.get("/watch-folders/:startupId", (req, res) => {
  res.json({ watch: getWatchFolder(req.params.startupId) });
});

desktopDataRouter.put("/watch-folders/:startupId", async (req, res) => {
  const startup = await Startup.findOne({ _id: req.params.startupId, ...ownerFilter(res.locals.userId as string) }).lean();
  if (!startup) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const folder = (req.body as { path?: string | null }).path ?? null;
  try {
    setWatchFolder(req.params.startupId, folder);
    if (folder) void scanWatchedFolders();
    res.json({ watch: getWatchFolder(req.params.startupId) });
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : "Could not watch folder" });
  }
});

/**
 * Tamper-evident audit export: every entry carries sha256(prev_hash + entry),
 * and the final hash seals the file. Changing, removing or reordering any line
 * breaks the chain from that point on.
 */
desktopDataRouter.get("/audit-export", async (req, res) => {
  const { startupId } = req.query as { startupId?: string };
  const query = startupId ? { startupId } : {};
  const logs = (await AuditLog.find(query).sort({ createdAt: 1 }).lean()) as Array<Record<string, unknown>>;

  let prev = "0".repeat(64);
  const entries = logs.map((d) => {
    const entry = {
      id: String(d._id),
      startupId: d.startupId ? String(d.startupId) : null,
      eventType: d.eventType,
      performedBy: d.performedBy,
      createdAt: new Date(d.createdAt as Date).toISOString(),
      details: d.details ?? {},
    };
    const hash = crypto.createHash("sha256").update(prev + JSON.stringify(entry)).digest("hex");
    prev = hash;
    return { ...entry, hash };
  });

  const doc = {
    format: "capscreen-audit-v1",
    exportedAt: new Date().toISOString(),
    scope: startupId ? { startupId } : "all",
    count: entries.length,
    chain: { algorithm: "sha256(prevHash + JSON(entry))", genesis: "0".repeat(64), finalHash: prev },
    entries,
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="capscreen-audit-${doc.exportedAt.slice(0, 10)}.json"`);
  res.send(JSON.stringify(doc, null, 2));
});
