import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { userData, watchmanBinary } from "../paths";
import { cacheDir, cachedLists, readManifest, refreshListCache } from "./listCache";
import { freePort, waitForHttp } from "./ports";
import { getSidecar, pipeLogs, track } from "./supervisor";

/**
 * Watchman (Go binary): the sanctions search engine. Starts online, falls back
 * to the offline list snapshot when the sources can't be reached, and reloads
 * when the user changes which lists to screen against.
 */

function configuredLists(): string[] {
  try {
    const s = JSON.parse(fs.readFileSync(userData("settings.json"), "utf8")) as { sanctionsLists?: string[] };
    if (Array.isArray(s.sanctionsLists) && s.sanctionsLists.length) return s.sanctionsLists;
  } catch {
    /* defaults */
  }
  return ["us_ofac", "eu_csl"];
}

type WatchmanMode = "online" | "offline";
let watchmanMode: WatchmanMode = "online";

/** Online: download lists. Offline: load the shell's snapshot (cached lists only). */
function writeWatchmanConfig(port: number, adminPort: number, mode: WatchmanMode): string {
  const dir = userData("watchman");
  const lists = mode === "offline" ? cachedLists(configuredLists()) : configuredLists();
  const yaml = [
    "Watchman:",
    "  Servers:",
    `    BindAddress: "127.0.0.1:${port}"`,
    `    AdminAddress: "127.0.0.1:${adminPort}"`,
    "  Download:",
    '    RefreshInterval: "12h"',
    `    InitialDataDirectory: ${mode === "offline" ? JSON.stringify(cacheDir()) : '""'}`,
    "    IncludedLists:",
    ...lists.map((l) => `      - ${l}`),
    "",
  ].join("\n");
  const file = path.join(dir, "config.yml");
  fs.writeFileSync(file, yaml);
  writeWatchmanStatus();
  return file;
}

/** Read by the backend (Data & Backup page): online vs cached lists, and when cached. */
function writeWatchmanStatus(): void {
  fs.writeFileSync(
    userData("watchman", "status.json"),
    JSON.stringify({ mode: watchmanMode, cached: readManifest().lists, updatedAt: new Date().toISOString() }, null, 2),
  );
}

let watchmanPorts: { port: number; adminPort: number } | null = null;

const watchmanPidFile = () => userData("watchman", "watchman.pid");

/**
 * Watchman is a plain child process (not an Electron utility process), so a
 * crash or force-quit of the app can orphan it. Reap the previous instance.
 */
function killStaleWatchman(): void {
  try {
    const pid = Number(fs.readFileSync(watchmanPidFile(), "utf8"));
    if (pid > 0) process.kill(pid, "SIGTERM");
  } catch {
    /* no pid file, or already gone */
  }
  fs.rmSync(watchmanPidFile(), { force: true });
}

export async function startWatchman(): Promise<string> {
  // Ports stay fixed for the app's lifetime: the backend holds this URL.
  watchmanPorts ??= { port: await freePort(), adminPort: await freePort() };
  const { port, adminPort } = watchmanPorts;
  const bin = watchmanBinary();
  if (!fs.existsSync(bin)) {
    throw new Error(`Watchman binary missing at ${bin}. Run: pnpm --filter capscreen-desktop run build:watchman`);
  }
  const url = `http://127.0.0.1:${port}`;
  killStaleWatchman();
  const launch = async () => {
    const config = writeWatchmanConfig(port, adminPort, watchmanMode);
    // Own empty cwd: Watchman treats its working directory as a data source
    // when no InitialDataDirectory is configured.
    const cwd = userData("watchman", "work");
    fs.mkdirSync(cwd, { recursive: true });
    const proc = spawn(bin, [], {
      cwd,
      env: { ...process.env, APP_CONFIG: config },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    pipeLogs(proc, "watchman");
    if (proc.pid) fs.writeFileSync(watchmanPidFile(), String(proc.pid));
    track("watchman", proc, relaunch);
  };
  // Watchman exits if it can't download lists at start (no/slow internet).
  // Fall back to the snapshot when there is one; otherwise retry online.
  const relaunch = async () => {
    if (watchmanMode === "online" && cachedLists(configuredLists()).length > 0) {
      console.warn("[sidecar] watchman could not load lists online — starting from the offline snapshot");
      watchmanMode = "offline";
    }
    await launch();
  };
  await launch();
  // Watchman binds its port only after the first list load (download + index,
  // ~15 s on a good connection). Wait across supervised restarts, not just one.
  const sc = () => getSidecar("watchman");
  try {
    await waitForHttp(`${url}/ping`, 240_000, () => (sc()?.alive ?? false) || (sc()?.restarts ?? 0) < 5);
  } catch (err) {
    if (cachedLists(configuredLists()).length === 0) {
      throw new Error(
        "CapScreen couldn't download the sanctions lists. An internet connection is needed the first time " +
          "CapScreen starts; after that it keeps an offline copy.",
      );
    }
    throw err;
  }
  sc()!.restarts = 0;
  scheduleListMaintenance();
  return url;
}

/** Restart Watchman on the same port (e.g. after a list snapshot import). */
export async function restartWatchman(): Promise<string> {
  const sc = getSidecar("watchman");
  if (sc?.proc && sc.alive) {
    sc.stopping = true;
    const exited = new Promise((r) => (sc.proc as ChildProcess).once("exit", r));
    sc.proc.kill();
    await exited;
  }
  return startWatchman();
}

let listTimer: NodeJS.Timeout | null = null;

/**
 * Keep the offline snapshot fresh while online (every 12 h, like Watchman), and
 * while running from the snapshot try to get back online every 30 minutes.
 */
function scheduleListMaintenance(): void {
  if (listTimer) return;
  let lastRefresh = 0;
  const tick = async () => {
    // Online: refresh the snapshot twice a day. Offline: probe every tick.
    if (watchmanMode === "online" && Date.now() - lastRefresh < 12 * 60 * 60_000) return;
    const refreshed = await refreshListCache(configuredLists());
    if (refreshed.length > 0) lastRefresh = Date.now();
    writeWatchmanStatus();
    if (watchmanMode === "offline" && refreshed.length > 0) {
      console.log("[sidecar] sanctions sources reachable again — reloading Watchman online");
      watchmanMode = "online";
      await restartWatchman().catch((err) => console.error("[sidecar] watchman online reload failed:", err));
    }
  };
  setTimeout(() => void tick(), 60_000).unref();
  listTimer = setInterval(() => void tick(), 30 * 60_000);
  listTimer.unref();
}

/** Reload Watchman when the user changes which sanctions lists to screen against. */
export function watchSanctionsSettings(): void {
  const file = userData("settings.json");
  const read = () => {
    try {
      return JSON.stringify((JSON.parse(fs.readFileSync(file, "utf8")) as { sanctionsLists?: string[] }).sanctionsLists ?? null);
    } catch {
      return "null";
    }
  };
  let last = read();
  fs.watchFile(file, { interval: 2000 }, () => {
    const next = read();
    if (next === last) return;
    last = next;
    console.log("[sidecar] sanctions lists changed — reloading Watchman");
    restartWatchman().catch((err) => console.error("[sidecar] watchman reload failed:", err));
  });
}
