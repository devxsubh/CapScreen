import { spawn } from "child_process";
import path from "path";
import { utilityProcess } from "electron";
import { isDev, repoRoot, resourcesDir } from "../paths";
import { freePort, waitForHttp } from "./ports";
import { isAlive, pipeLogs, track, type Proc } from "./supervisor";

/** Next.js UI: `next dev` in dev, the standalone server when packaged. */
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
