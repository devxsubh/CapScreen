import type { Request, Response } from "express";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import { accessibleStartup } from "../startups/startupAccess";
import * as documentsService from "./documents.service";
import { toAppDocument, toGeneratedDocument, toRagDocument } from "./documents.serializer";

function uploadedFile(req: Request, missing = "No file uploaded"): Express.Multer.File {
  if (!req.file) throw badRequest(missing);
  return req.file;
}

// ── Stored documents ─────────────────────────────────────────────────────────

export async function listStored(_req: Request, res: Response): Promise<void> {
  const docs = await documentsService.listStoredDocuments(currentUser(res).userId);
  res.json(docs.map(toAppDocument));
}

export async function uploadStored(req: Request, res: Response): Promise<void> {
  const doc = await documentsService.uploadStoredDocument(currentUser(res).userId, uploadedFile(req));
  res.status(201).json(toAppDocument(doc));
}

export async function uploadToProject(req: Request, res: Response): Promise<void> {
  const doc = await documentsService.uploadStoredDocument(
    currentUser(res).userId,
    uploadedFile(req),
    req.params.projectId,
  );
  res.status(201).json(toAppDocument(doc));
}

export async function storedUrl(req: Request, res: Response): Promise<void> {
  const { url, filename } = await documentsService.storedDocumentUrl(req.params.docId, currentUser(res).userId);
  res.json({ url, filename, version_id: null });
}

export async function deleteStored(req: Request, res: Response): Promise<void> {
  await documentsService.deleteStoredDocument(req.params.docId, currentUser(res).userId);
  res.status(204).send();
}

// ── Generated documents ──────────────────────────────────────────────────────

export async function viewGenerated(req: Request, res: Response): Promise<void> {
  const doc = await documentsService.getGeneratedDocument(req.params.docId, currentUser(res).userId);
  res.json(toGeneratedDocument(doc));
}

export async function downloadGenerated(req: Request, res: Response): Promise<void> {
  const doc = await documentsService.getGeneratedDocument(req.params.docId, currentUser(res).userId);
  const { filename, html } = documentsService.toWordDownload(doc);
  res.setHeader("Content-Type", "application/msword");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(html);
}

/** Old per-startup download URL; the document id alone is enough. */
export async function redirectDownload(req: Request, res: Response): Promise<void> {
  res.redirect(307, `/api/documents/${req.params.docId}/download`);
}

export async function createIcMemo(_req: Request, res: Response): Promise<void> {
  res.status(201).json(await documentsService.generateIcMemo(accessibleStartup(res), currentUser(res)));
}

export async function listIcMemos(req: Request, res: Response): Promise<void> {
  res.json(await documentsService.listStartupIcMemos(req.params.id));
}

export async function latestIcMemo(req: Request, res: Response): Promise<void> {
  res.json(await documentsService.latestIcMemo(req.params.id));
}

export async function getIcMemo(req: Request, res: Response): Promise<void> {
  res.json(await documentsService.startupDocument(req.params.id, req.params.docId));
}

// ── RAG documents ────────────────────────────────────────────────────────────

export async function listRag(req: Request, res: Response): Promise<void> {
  const docs = await documentsService.listRagDocuments(req.params.id);
  res.json(docs.map(toRagDocument));
}

export async function uploadRag(req: Request, res: Response): Promise<void> {
  const file = uploadedFile(req, "No file uploaded. Send file as multipart field 'file'.");
  const doc = await documentsService.uploadRagDocument(req.params.id, file, currentUser(res));
  res.status(201).json(toRagDocument(doc));
}

export async function deleteRag(req: Request, res: Response): Promise<void> {
  await documentsService.deleteRagDocument(req.params.id, req.params.docId, currentUser(res));
  res.status(204).send();
}
