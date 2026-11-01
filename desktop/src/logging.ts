import fs from "fs";
import { isDev, userData } from "./paths";

// Log main-process failures to logs/main.log instead of a blocking modal dialog.
const rawConsoleError = console.error.bind(console);

function logMainError(kind: string, err: unknown): void {
  const line = `${new Date().toISOString()} ${kind}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
  rawConsoleError(line);
  try {
    fs.mkdirSync(userData("logs"), { recursive: true });
    fs.appendFileSync(userData("logs", "main.log"), line);
  } catch {
    /* logging must never throw */
  }
}

export function installErrorLogging(): void {
  process.on("uncaughtException", (err) => logMainError("uncaughtException", err));
  if (!isDev) {
    // Packaged builds have no terminal: mirror console.error into main.log.
    console.error = (...args: unknown[]) =>
      logMainError("error", args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" "));
  }
  process.on("unhandledRejection", (err) => logMainError("unhandledRejection", err));
}
