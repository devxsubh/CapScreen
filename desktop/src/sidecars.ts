import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { utilityProcess, type UtilityProcess } from "electron";
import { isDev, repoRoot, resourcesDir, userData, watchmanBinary } from "./paths";
import { freePort, waitForHttp } from "./ports";
import { cacheDir, cachedLists, readManifest, refreshListCache } from "./listCache";

type Proc = ChildProcess | UtilityProcess;

const RESTART_EXIT_CODE = 75;

export type SidecarName = "watchman" | "backend" | "frontend";

export type RuntimeInfo = {
  watchmanUrl: string;
  backendUrl: string;
  frontendUrl: string;
  token: string;
};

type Sidecar = {
  name: SidecarName;
  proc: Proc | null;
  alive: boolean;
  stopping: boolean;
  restarts: number;
};

const sidecars = new Map<SidecarName, Sidecar>();
const listeners: Array<(name: SidecarName, event: "exit" | "restart", detail: string) => void> = [];

export function onSidecarEvent(fn: (name: SidecarName, event: "exit" | "restart", detail: string) => void): void {
  listeners.push(fn);
}

function logStream(name: string): fs.WriteStream {
  const dir = userData("logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.log`);
  // Keep logs bounded: start fresh when a file grows past 10 MB.
  try {
    if (fs.statSync(file).size > 10 * 1024 * 1024) fs.rmSync(file);
  } catch {
    /* no previous log */
  }
  const stream = fs.createWriteStream(file, { flags: "a" });
  stream.write(`\n=== ${new Date().toISOString()} ${name} starting ===\n`);
  return stream;
}

function pipeLogs(proc: Proc, name: string): void {
  const out = logStream(name);
  const forward = (prefix: string) => (chunk: Buffer) => {
    out.write(chunk);
    if (isDev) process.stdout.write(`[${prefix}] ${chunk}`);
  };
  proc.stdout?.on("data", forward(name));
  proc.stderr?.on("data", forward(name));
}

function track(name: SidecarName, proc: Proc, restart?: () => Promise<void>): Sidecar {
  const sc: Sidecar = sidecars.get(name) ?? { name, proc: null, alive: false, stopping: false, restarts: 0 };
  sc.proc = proc;
  sc.alive = true;
  sc.stopping = false;
  sidecars.set(name, sc);
  // ChildProcess and UtilityProcess both emit "exit"; their typings don't share overloads.
  (proc as ChildProcess).on("exit", (code: number | null) => {
    sc.alive = false;
    if (sc.stopping) return;
    // 75 = the backend asked to be restarted (e.g. after restoring a backup).
    if (code === RESTART_EXIT_CODE && restart) {
      void restart().then(() => listeners.forEach((l) => l(name, "restart", "requested")));
      return;
    }
    const detail = `exited with code ${code}`;
    listeners.forEach((l) => l(name, "exit", detail));
    // Crash recovery with backoff; give up after 5 quick failures.
    if (restart && sc.restarts < 5) {
      sc.restarts++;
      setTimeout(() => {
        restart()
          .then(() => listeners.forEach((l) => l(name, "restart", `restart #${sc.restarts}`)))
          .catch((err) => console.error(`[sidecar] ${name} restart failed:`, err));
      }, 1000 * sc.restarts);
    }
  });
  return sc;
}

const isAlive = (name: SidecarName) => () => sidecars.get(name)?.alive ?? false;

// ── Watchman (Go binary) ─────────────────────────────────────────────────────

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
  const sc = () => sidecars.get("watchman");
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

// ── Backend (Express) ────────────────────────────────────────────────────────

export async function startBackend(opts: {
  watchmanUrl: string;
  token: string;
  masterKey: string;
  frontendOrigin: string;
  apiOrigin: (port: number) => string;
}): Promise<string> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: isDev ? "development" : "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    WATCHMAN_URL: opts.watchmanUrl,
    CAPSCREEN_DATA_DIR: userData(),
    CAPSCREEN_DESKTOP_TOKEN: opts.token,
    CAPSCREEN_MASTER_KEY: opts.masterKey,
    CAPSCREEN_API_ORIGIN: opts.apiOrigin(port),
    CAPSCREEN_CORPUS_DIR: resourcesDir("backend", "compliance-corpus"),
    FRONTEND_URL: opts.frontendOrigin,
  };
  // Never let a developer's cloud .env leak into the desktop runtime.
  for (const k of ["CAPSCREEN_DB", "MONGODB_URI", "RESEND_API_KEY", "LLM_CONFIG_FILE"]) delete env[k];

  const launch = async () => {
    let proc: Proc;
    if (isDev) {
      const tsx = path.join(repoRoot, "backend", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
      proc = spawn(tsx, ["src/index.ts"], { cwd: path.join(repoRoot, "backend"), env, stdio: ["ignore", "pipe", "pipe"] });
    } else {
      proc = utilityProcess.fork(resourcesDir("backend", "index.js"), [], {
        env,
        stdio: "pipe",
        serviceName: "CapScreen Backend",
      });
    }
    pipeLogs(proc, "backend");
    track("backend", proc, launch);
  };
  await launch();
  await waitForHttp(`${url}/health`, isDev ? 90_000 : 30_000, isAlive("backend"));
  return url;
}

// ── Frontend (Next.js) ───────────────────────────────────────────────────────

export async function startFrontend(): Promise<string> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const launch = async () => {
    let proc: Proc;
    if (isDev) {
      const next = path.join(repoRoot, "frontend", "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
      proc = spawn(next, ["dev", "-p", String(port), "-H", "127.0.0.1"], {
        cwd: path.join(repoRoot, "frontend"),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      // Standalone output mirrors the monorepo layout: frontend/frontend/server.js.
      proc = utilityProcess.fork(resourcesDir("frontend", "frontend", "server.js"), [], {
        env: { ...env, NODE_ENV: "production" },
        cwd: resourcesDir("frontend", "frontend"),
        stdio: "pipe",
        serviceName: "CapScreen UI",
      });
    }
    pipeLogs(proc, "frontend");
    track("frontend", proc, launch);
  };
  await launch();
  await waitForHttp(url, isDev ? 180_000 : 30_000, isAlive("frontend"));
  return url;
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

export function stopAll(): void {
  for (const sc of sidecars.values()) {
    sc.stopping = true;
    try {
      sc.proc?.kill();
    } catch {
      /* already gone */
    }
  }
}

/** Restart Watchman on the same port (e.g. after a list snapshot import). */
export async function restartWatchman(): Promise<string> {
  const sc = sidecars.get("watchman");
  if (sc?.proc && sc.alive) {
    sc.stopping = true;
    const exited = new Promise((r) => (sc.proc as ChildProcess).once("exit", r));
    sc.proc.kill();
    await exited;
  }
  return startWatchman();
}
