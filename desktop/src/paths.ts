import { app } from "electron";
import path from "path";

/** `pnpm desktop` runs against the source tree; packaged builds use bundled resources. */
export const isDev = !app.isPackaged || process.env.CAPSCREEN_DEV === "1";

/** Monorepo root (dev only). */
export const repoRoot = path.resolve(__dirname, "..", "..");

export function resourcesDir(...p: string[]): string {
  const base = app.isPackaged ? process.resourcesPath : path.join(repoRoot, "desktop", "resources");
  return path.join(base, ...p);
}

export function userData(...p: string[]): string {
  return path.join(app.getPath("userData"), ...p);
}

export function watchmanBinary(): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return resourcesDir("bin", `watchman-${process.platform}-${process.arch}${ext}`);
}
