import { spawn } from "child_process";
import path from "path";
import { utilityProcess } from "electron";
import { isDev, repoRoot, resourcesDir, userData } from "../paths";
import { freePort, waitForHttp } from "./ports";
import { isAlive, pipeLogs, track, type Proc } from "./supervisor";

/** Express backend: tsx from source in dev, the bundled utility process when packaged. */
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
