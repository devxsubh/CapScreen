import mongoose from "mongoose";
import type { CurrentUser } from "../../http/currentUser";
import { HttpError, badRequest, notFound } from "../../http/httpError";
import {
  createIcMemoDocument,
  getLatestIcMemo,
  getStartupDocument,
  listIcMemos,
} from "./icMemo.service";
import { markdownToWordDocumentHtml } from "../../lib/documents/markdownToWordHtml";
import {
  buildRagDocumentKey,
  buildUserDocumentKey,
  deleteObject,
  detectFileType,
  getObjectDownloadUrl,
  storageConfigured,
  uploadObject,
} from "../../lib/infra/fileStorage";
import { ingestDocument } from "../../lib/rag/ingestDocument";
import type { ScreeningResult } from "../../types/screening";
import { recordAuditEvent } from "../auditLogs/auditLogs.service";
import * as startupsRepository from "../startups/startups.repository";
import type { StartupRecord } from "../startups/startups.repository";
import * as documentsRepository from "./documents.repository";
import type { DocumentRecord } from "./documents.repository";

export type UploadedFile = Pick<Express.Multer.File, "originalname" | "mimetype" | "size" | "buffer">;

/**
 * Creates the record first (its id is part of the storage key), uploads the
 * bytes, then points the record at them. If the upload fails the record is
 * removed again, so there are never records without files.
 */
async function storeWithRecord(
  file: UploadedFile,
  record: DocumentRecord,
  storageKey: string,
  store: { setKey: (id: unknown, key: string) => Promise<void>; remove: (id: unknown) => Promise<void> },
): Promise<DocumentRecord> {
  try {
    await uploadObject({ key: storageKey, body: file.buffer, contentType: file.mimetype });
    await store.setKey(record._id, storageKey);
  } catch (err) {
    await store.remove(record._id);
    throw new HttpError(500, err instanceof Error ? err.message : "Upload failed");
  }
  return { ...record, storageKey };
}

function requireStorage(): void {
  if (!storageConfigured()) throw new HttpError(503, "Object storage is not configured");
}

// ── Stored documents (/single-documents, /projects/:id/documents) ────────────

export async function listStoredDocuments(userId: string): Promise<DocumentRecord[]> {
  return documentsRepository.listStored(userId, null);
}

/** Uploads a file for the user, optionally into one of their projects (startups). */
export async function uploadStoredDocument(
  userId: string,
  file: UploadedFile,
  projectId: string | null = null,
): Promise<DocumentRecord> {
  requireStorage();
  if (projectId && !(await startupsRepository.findOwned(projectId, userId))) {
    throw notFound("Project not found");
  }
  const record = await documentsRepository.createStored({
    ownerId: userId,
    projectId: projectId ? new mongoose.Types.ObjectId(projectId) : null,
    filename: file.originalname,
    mimeType: file.mimetype,
    fileType: detectFileType(file.originalname, file.mimetype),
    storageKey: "pending",
    sizeBytes: file.size,
    status: "ready",
  });
  const key = buildUserDocumentKey({
    userId,
    docId: String(record._id),
    filename: file.originalname,
    ...(projectId ? { projectId } : {}),
  });
  return storeWithRecord(file, record, key, {
    setKey: documentsRepository.setStoredKey,
    remove: documentsRepository.removeStored,
  });
}

export async function storedDocumentUrl(id: string, userId: string): Promise<{ url: string; filename: string }> {
  const doc = await documentsRepository.findStored(id, userId);
  if (!doc) throw notFound("Document not found");
  const url = await getObjectDownloadUrl(doc.storageKey as string, doc.filename as string);
  if (!url) throw new HttpError(503, "Could not generate download URL");
  return { url, filename: doc.filename as string };
}

export async function deleteStoredDocument(id: string, userId: string): Promise<void> {
  const doc = await documentsRepository.deleteStored(id, userId);
  if (!doc) throw notFound("Document not found");
  await deleteObject(doc.storageKey as string).catch(() => {});
}

// ── Generated documents (IC memos, analyses) ─────────────────────────────────

/** A generated document, only if it belongs to one of the user's own startups. */
export async function getGeneratedDocument(id: string, userId: string): Promise<DocumentRecord> {
  const doc = await documentsRepository.findGenerated(id);
  if (!doc || typeof doc.content !== "string") throw notFound("Document not found");
  if (!(await startupsRepository.findOwned(String(doc.startupId), userId))) throw notFound("Document not found");
  return doc;
}

/** A Word-compatible .doc (HTML) rendering, with a filesystem-safe name. */
export function toWordDownload(doc: DocumentRecord): { filename: string; html: string } {
  const title = String(doc.title ?? "document");
  const safeName = title.replace(/[^\w\s.-]/g, "").trim() || "document";
  return { filename: `${safeName}.doc`, html: markdownToWordDocumentHtml(title, String(doc.content)) };
}

export async function generateIcMemo(startup: StartupRecord, user: CurrentUser) {
  const result = startup.lastScreeningResult as ScreeningResult | null;
  if (!result) throw badRequest("No screening result — run a screen first");
  try {
    return await createIcMemoDocument({
      startupId: String(startup._id),
      screeningResult: result,
      performedBy: user.userId,
      performedByEmail: user.userEmail,
    });
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : "Failed to generate IC memo");
  }
}

export const listStartupIcMemos = listIcMemos;

export async function latestIcMemo(startupId: string) {
  const doc = await getLatestIcMemo(startupId);
  if (!doc) throw notFound("No IC memo found");
  return doc;
}

export async function startupDocument(startupId: string, docId: string) {
  const doc = await getStartupDocument(startupId, docId);
  if (!doc) throw notFound("Document not found");
  return doc;
}

// ── RAG documents (/api/startups/:id/rag-documents) ──────────────────────────

export async function listRagDocuments(startupId: string): Promise<DocumentRecord[]> {
  return documentsRepository.listRag(startupId);
}

/**
 * Stores the file, then parses, chunks and embeds it in the background;
 * the record's status moves from "processing" to "ready" (or "error").
 */
export async function uploadRagDocument(startupId: string, file: UploadedFile, user: CurrentUser): Promise<DocumentRecord> {
  requireStorage();
  const record = await documentsRepository.createRag({
    startupId: new mongoose.Types.ObjectId(startupId),
    filename: file.originalname,
    mimeType: file.mimetype,
    uploadedBy: user.userId,
    storageKey: "pending",
    sizeBytes: file.size,
    status: "processing",
    chunkCount: 0,
  });
  const documentId = String(record._id);
  const key = buildRagDocumentKey({ userId: user.userId, startupId, docId: documentId, filename: file.originalname });
  const stored = await storeWithRecord(file, record, key, {
    setKey: documentsRepository.setRagKey,
    remove: documentsRepository.removeRag,
  });

  await recordAuditEvent(user, "document_uploaded", startupId, {
    documentId,
    filename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  });

  setImmediate(() => {
    void ingestDocument({
      startupId,
      documentId,
      filename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  });
  return stored;
}

export async function deleteRagDocument(startupId: string, docId: string, user: CurrentUser): Promise<void> {
  const doc = await documentsRepository.deleteRag(docId, startupId);
  if (!doc) throw notFound("Document not found");
  if (doc.storageKey) await deleteObject(doc.storageKey as string).catch(() => {});
  await recordAuditEvent(user, "document_deleted", startupId, { documentId: docId, filename: doc.filename });
}
