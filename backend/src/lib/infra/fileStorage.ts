import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import express from "express";
import { dataDir } from "./dataDir";

/**
 * On-device object storage. Keys are relative paths under <data>/files;
 * downloads are served by the backend through short-lived signed URLs.
 */

const SIGNING_SECRET = crypto.randomBytes(32);

function root(): string {
  return dataDir("files");
}

function resolveKey(key: string): string {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** Always true on desktop — kept so callers read the same as before. */
export function storageConfigured(): boolean {
  return true;
}

export function safeStorageFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "file";
  const cleaned = base.replace(/[^\w.\-()+\s]/g, "_").replace(/\s+/g, "_");
  return cleaned.slice(0, 180) || "file";
}

export function buildUserDocumentKey(params: {
  userId: string;
  docId: string;
  filename: string;
  projectId?: string | null;
}): string {
  const safe = safeStorageFilename(params.filename);
  if (params.projectId) {
    return `users/${params.userId}/projects/${params.projectId}/documents/${params.docId}/${safe}`;
  }
  return `users/${params.userId}/documents/${params.docId}/${safe}`;
}

export function buildRagDocumentKey(params: {
  userId: string;
  startupId: string;
  docId: string;
  filename: string;
}): string {
  const safe = safeStorageFilename(params.filename);
  return `users/${params.userId}/startups/${params.startupId}/rag/${params.docId}/${safe}`;
}

export async function uploadObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const file = resolveKey(params.key);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, params.body, { mode: 0o600 });
}

export async function downloadObject(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveKey(key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) return;
  await fs.rm(resolveKey(key), { force: true });
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("base64url");
}

function apiOrigin(): string {
  return (process.env.CAPSCREEN_API_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3001}`).replace(/\/$/, "");
}

export async function getObjectDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const payload = Buffer.from(
    JSON.stringify({ k: key, f: safeStorageFilename(filename), e: Date.now() + expiresInSeconds * 1000 }),
  ).toString("base64url");
  return `${apiOrigin()}/api/files/${payload}.${sign(payload)}`;
}

/** GET /api/files/:token — serves a file for a signed, unexpired token. */
export const fileDownloadRouter = express.Router();

fileDownloadRouter.get("/:token", async (req, res) => {
  const [payload, sig] = req.params.token.split(".");
  const expected = payload ? sign(payload) : "";
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    res.status(403).json({ detail: "Invalid download link" });
    return;
  }
  const { k, f, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k: string; f: string; e: number };
  if (Date.now() > e) {
    res.status(410).json({ detail: "Download link expired" });
    return;
  }
  const body = await downloadObject(k);
  if (!body) {
    res.status(404).json({ detail: "File not found" });
    return;
  }
  res.setHeader("Content-Disposition", `attachment; filename="${f.replace(/"/g, "")}"`);
  res.type(path.extname(f) || "application/octet-stream").send(body);
});

export function detectFileType(
  filename: string,
  mimeType: string,
): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (
    ext === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (ext === "doc" || mimeType === "application/msword") return "doc";
  if (ext === "csv" || mimeType === "text/csv") return "csv";
  if (ext === "txt" || mimeType === "text/plain") return "txt";
  return ext ?? null;
}
