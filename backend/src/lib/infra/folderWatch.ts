import fs from "fs";
import path from "path";
import { dataFile } from "./dataDir";

/**
 * Watched data-room folders: drop a file into a startup's folder and CapScreen
 * ingests it — CSVs as cap tables / entity lists, PDF/DOCX/TXT into document
 * search. Polling (not fs.watch) so it behaves the same on macOS, Windows and
 * Linux, with network drives, and with half-copied files.
 *
 * Ingestion goes through the app's own HTTP endpoints so uploads get exactly
 * the same validation, parsing and audit logging as manual ones.
 */

type WatchEntry = { path: string; processed: Record<string, string>; lastScanAt?: string; lastError?: string | null };
type WatchFile = Record<string, WatchEntry>;

const SCAN_EVERY_MS = 20_000;
const STABLE_MS = 3_000;
const DOC_EXT = new Set([".pdf", ".docx", ".txt", ".md"]);
const MAX_DEPTH = 2;

const ledgerPath = () => dataFile("folder-watch.json");

function readLedger(): WatchFile {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath(), "utf8")) as WatchFile;
  } catch {
    return {};
  }
}

function writeLedger(l: WatchFile): void {
  fs.writeFileSync(ledgerPath(), JSON.stringify(l, null, 2), { mode: 0o600 });
}

export function getWatchFolder(startupId: string): (Omit<WatchEntry, "processed"> & { ingestedCount: number }) | null {
  const e = readLedger()[startupId];
  return e ? { path: e.path, lastScanAt: e.lastScanAt, lastError: e.lastError ?? null, ingestedCount: Object.keys(e.processed).length } : null;
}

export function setWatchFolder(startupId: string, folder: string | null): void {
  const l = readLedger();
  if (!folder) {
    delete l[startupId];
  } else {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("Folder does not exist");
    l[startupId] = { path: path.resolve(folder), processed: l[startupId]?.path === path.resolve(folder) ? l[startupId].processed : {} };
  }
  writeLedger(l);
}

function listFiles(dir: string, depth = 0): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("~$")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory() && depth < MAX_DEPTH) out.push(...listFiles(full, depth + 1));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function api(): { base: string; headers: Record<string, string> } {
  const token = process.env.CAPSCREEN_DESKTOP_TOKEN;
  return {
    base: `http://127.0.0.1:${process.env.PORT ?? 3001}`,
    headers: token ? { "x-capscreen-token": token } : {},
  };
}

async function ingest(startupId: string, file: string): Promise<void> {
  const ext = path.extname(file).toLowerCase();
  const { base, headers } = api();
  const filename = path.basename(file);
  let resp: Response;
  if (ext === ".csv") {
    resp = await fetch(`${base}/api/startups/${startupId}/csvs`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content: fs.readFileSync(file, "utf8") }),
    });
  } else {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(file)]), filename);
    resp = await fetch(`${base}/api/startups/${startupId}/rag-documents`, { method: "POST", headers, body: form });
  }
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(`${filename}: ${body.detail ?? resp.status}`);
  }
}

let scanning = false;

export async function scanWatchedFolders(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const ledger = readLedger();
    for (const [startupId, entry] of Object.entries(ledger)) {
      entry.lastScanAt = new Date().toISOString();
      if (!fs.existsSync(entry.path)) {
        entry.lastError = "Folder is missing or disconnected";
        continue;
      }
      entry.lastError = null;
      for (const file of listFiles(entry.path)) {
        const ext = path.extname(file).toLowerCase();
        if (ext !== ".csv" && !DOC_EXT.has(ext)) continue;
        const st = fs.statSync(file);
        if (Date.now() - st.mtimeMs < STABLE_MS) continue; // still being written
        const rel = path.relative(entry.path, file);
        const sig = `${st.size}:${Math.floor(st.mtimeMs)}`;
        if (entry.processed[rel] === sig) continue;
        try {
          await ingest(startupId, file);
          entry.processed[rel] = sig;
          console.log(`[folder-watch] ingested ${rel} for startup ${startupId}`);
        } catch (err) {
          // Mark as seen so a bad file isn't retried every 20 s; editing it retries.
          entry.processed[rel] = sig;
          entry.lastError = err instanceof Error ? err.message : String(err);
          console.warn(`[folder-watch] ${entry.lastError}`);
        }
      }
    }
    // Merge into a fresh read: the user may have changed folders mid-scan.
    const latest = readLedger();
    for (const [id, scanned] of Object.entries(ledger)) {
      if (latest[id]?.path === scanned.path) latest[id] = scanned;
    }
    writeLedger(latest);
  } finally {
    scanning = false;
  }
}

export function startFolderWatcher(): void {
  setTimeout(() => void scanWatchedFolders(), 10_000).unref();
  setInterval(() => void scanWatchedFolders(), SCAN_EVERY_MS).unref();
}
