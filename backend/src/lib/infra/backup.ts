import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { dataDir, dataFile } from "./dataDir";
import { getSqliteDb } from "./db";

/**
 * Encrypted single-file backups.
 *
 *   "CAPSCREENBAK1\n" | salt(16) | iv(12) | tag(16) | AES-256-GCM( gzip( manifest JSON "\n" + file bytes… ) )
 *
 * Key = scrypt(password, salt). Includes the database, stored documents, app
 * settings and AI model assignments. API keys are excluded on purpose: they are
 * sealed to this computer's keychain and must be re-entered after a restore.
 */

const MAGIC = Buffer.from("CAPSCREENBAK1\n");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type Entry = { path: string; size: number };
type Manifest = { version: 1; createdAt: string; app: "capscreen"; entries: Entry[] };

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, SCRYPT);
}

function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

export function createBackup(password: string): { file: Buffer; manifest: Manifest } {
  if (password.length < 8) throw new Error("Use a backup password of at least 8 characters");

  const snapshot = path.join(dataDir("tmp"), `backup-${Date.now()}.db`);
  getSqliteDb().backupTo(snapshot);
  try {
    const sources: Array<{ rel: string; abs: string }> = [
      { rel: "capscreen.db", abs: snapshot },
      ...walk(dataDir("files")).map((rel) => ({ rel: `files/${rel}`, abs: path.join(dataDir("files"), rel) })),
    ];
    for (const rel of ["settings.json", "ai/config.json"]) {
      const abs = dataFile(...rel.split("/"));
      if (fs.existsSync(abs)) sources.push({ rel, abs });
    }

    const blobs = sources.map((s) => fs.readFileSync(s.abs));
    const manifest: Manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      app: "capscreen",
      entries: sources.map((s, i) => ({ path: s.rel, size: blobs[i].length })),
    };
    const plain = zlib.gzipSync(Buffer.concat([Buffer.from(JSON.stringify(manifest) + "\n"), ...blobs]));

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
    cipher.setAAD(MAGIC);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return { file: Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]), manifest };
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
}

const stagingDir = () => dataDir("restore-staging");
const markerFile = () => dataFile("restore-pending.json");

/** Decrypt + validate, then stage for swap-in on next backend start. */
export function stageRestore(file: Buffer, password: string): Manifest {
  if (file.length < MAGIC.length + 44 || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a CapScreen backup file");
  }
  let o = MAGIC.length;
  const salt = file.subarray(o, (o += 16));
  const iv = file.subarray(o, (o += 12));
  const tag = file.subarray(o, (o += 16));
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  let plain: Buffer;
  try {
    plain = zlib.gunzipSync(Buffer.concat([decipher.update(file.subarray(o)), decipher.final()]));
  } catch {
    throw new Error("Wrong password, or the backup file is damaged");
  }

  const nl = plain.indexOf(0x0a);
  const manifest = JSON.parse(plain.subarray(0, nl).toString("utf8")) as Manifest;
  if (manifest.app !== "capscreen" || manifest.version !== 1) throw new Error("Unsupported backup version");

  fs.rmSync(stagingDir(), { recursive: true, force: true });
  let offset = nl + 1;
  for (const e of manifest.entries) {
    const target = path.resolve(stagingDir(), e.path);
    if (!target.startsWith(stagingDir() + path.sep)) throw new Error("Backup contains an invalid path");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, plain.subarray(offset, offset + e.size), { mode: 0o600 });
    offset += e.size;
  }
  fs.writeFileSync(markerFile(), JSON.stringify({ stagedAt: new Date().toISOString(), createdAt: manifest.createdAt }));
  return manifest;
}

/** Called before the database opens: swap a staged restore into place. */
export function applyPendingRestore(dbFile: string): boolean {
  if (!fs.existsSync(markerFile())) return false;
  const staged = stagingDir();
  const stagedDb = path.join(staged, "capscreen.db");
  if (fs.existsSync(stagedDb)) {
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
    fs.renameSync(stagedDb, dbFile);
  }
  if (fs.existsSync(path.join(staged, "files"))) {
    // Plain path join: dataDir() would recreate the folder we are replacing.
    const filesDir = path.join(dataDir(), "files");
    fs.rmSync(filesDir, { recursive: true, force: true });
    fs.renameSync(path.join(staged, "files"), filesDir);
  }
  for (const rel of ["settings.json", "ai/config.json"]) {
    const from = path.join(staged, rel);
    if (fs.existsSync(from)) fs.renameSync(from, dataFile(...rel.split("/")));
  }
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(markerFile(), { force: true });
  console.log("[backup] restored data from backup");
  return true;
}
