import type { ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import type { UtilityProcess } from "electron";
import { isDev, userData } from "../paths";

/**
 * Keeps the sidecar processes (Watchman, backend, UI) running: logs their
 * output, restarts them after a crash, and stops them all on quit.
 */

export type Proc = ChildProcess | UtilityProcess;

export type SidecarName = "watchman" | "backend" | "frontend";

export type Sidecar = {
  name: SidecarName;
  proc: Proc | null;
  alive: boolean;
  stopping: boolean;
  restarts: number;
};

type SidecarListener = (name: SidecarName, event: "exit" | "restart", detail: string) => void;

const RESTART_EXIT_CODE = 75;

const sidecars = new Map<SidecarName, Sidecar>();
const listeners: SidecarListener[] = [];

export function onSidecarEvent(fn: SidecarListener): void {
  listeners.push(fn);
}

export function getSidecar(name: SidecarName): Sidecar | undefined {
  return sidecars.get(name);
}

export const isAlive = (name: SidecarName) => () => sidecars.get(name)?.alive ?? false;

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

export function pipeLogs(proc: Proc, name: string): void {
  const out = logStream(name);
  const forward = (prefix: string) => (chunk: Buffer) => {
    out.write(chunk);
    if (isDev) process.stdout.write(`[${prefix}] ${chunk}`);
  };
  proc.stdout?.on("data", forward(name));
  proc.stderr?.on("data", forward(name));
}

export function track(name: SidecarName, proc: Proc, restart?: () => Promise<void>): Sidecar {
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
