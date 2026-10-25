import fs from "fs";
import os from "os";
import path from "path";

/**
 * Root for all on-device data (database, documents, model config).
 * The Electron shell sets CAPSCREEN_DATA_DIR to app.getPath("userData");
 * `pnpm dev` falls back to ~/.capscreen.
 */
export function dataDir(...sub: string[]): string {
  const root = process.env.CAPSCREEN_DATA_DIR?.trim() || path.join(os.homedir(), ".capscreen");
  const dir = path.join(root, ...sub);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function dataFile(...parts: string[]): string {
  const file = parts.pop()!;
  return path.join(dataDir(...parts), file);
}
