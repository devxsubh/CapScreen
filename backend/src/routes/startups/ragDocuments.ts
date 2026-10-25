import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { RagDocument } from "../../models/rag/ragDocument";
import { DocChunk } from "../../models/rag/docChunk";
import { ingestDocument } from "../../lib/rag/ingestDocument";
import { AuditLog } from "../../models";
import { authIdentityOr500 } from "../../middleware/userIdentity";
import {
  buildRagDocumentKey,
  deleteObject,
  storageConfigured,
  uploadObject,
} from "../../lib/infra/fileStorage";

export const ragDocumentsRouter = Router();

const MAX_MB = parseInt(process.env.RAG_UPLOAD_MAX_MB ?? "20", 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "text/csv",
    ];
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    const extAllowed = ["pdf", "docx", "doc", "txt", "csv"].includes(ext ?? "");
    if (allowed.includes(file.mimetype) || extAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// GET /api/startups/:id/rag-documents
ragDocumentsRouter.get("/:id/rag-documents", async (req, res) => {
  const docs = await RagDocument.find({ startupId: req.params.id })
    .sort({ uploadedAt: -1 })
    .lean();
  res.json(docs.map(serializeDoc));
});

// POST /api/startups/:id/rag-documents
ragDocumentsRouter.post(
  "/:id/rag-documents",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ detail: "No file uploaded. Send file as multipart field 'file'." });
      return;
    }
    if (!storageConfigured()) {
      res.status(503).json({ detail: "Object storage is not configured" });
      return;
    }

    const identity = authIdentityOr500(res);
    if (!identity) return;

    const doc = await RagDocument.create({
      startupId: new mongoose.Types.ObjectId(req.params.id),
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedBy: identity.userId,
      storageKey: "pending",
      sizeBytes: req.file.size,
      status: "processing",
      chunkCount: 0,
    });

    const storageKey = buildRagDocumentKey({
      userId: identity.userId,
      startupId: req.params.id,
      docId: doc._id.toString(),
      filename: req.file.originalname,
    });

    try {
      await uploadObject({
        key: storageKey,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      doc.storageKey = storageKey;
      await doc.save();
    } catch (err) {
      await doc.deleteOne();
      const detail = err instanceof Error ? err.message : "Upload failed";
      res.status(500).json({ detail });
      return;
    }

    await AuditLog.create({
      startupId: req.params.id,
      eventType: "document_uploaded",
      performedBy: identity.userId,
      performedByEmail: identity.userEmail,
      details: {
        documentId: doc._id.toString(),
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    // Fire-and-forget ingest
    const buffer = req.file.buffer;
    setImmediate(() => {
      void ingestDocument({
        startupId: req.params.id,
        documentId: doc._id.toString(),
        filename: req.file!.originalname,
        mimeType: req.file!.mimetype,
        buffer,
      });
    });

    res.status(201).json(serializeDoc(doc.toObject() as unknown as Record<string, unknown>));
  },
);

// DELETE /api/startups/:id/rag-documents/:docId
ragDocumentsRouter.delete("/:id/rag-documents/:docId", async (req, res) => {
  const doc = await RagDocument.findOneAndDelete({
    _id: req.params.docId,
    startupId: req.params.id,
  });
  if (!doc) {
    res.status(404).json({ detail: "Document not found" });
    return;
  }

  await DocChunk.deleteMany({ documentId: new mongoose.Types.ObjectId(req.params.docId) });
  if (doc.storageKey) {
    await deleteObject(doc.storageKey).catch(() => {});
  }

  const identity = authIdentityOr500(res);
  if (identity) {
    await AuditLog.create({
      startupId: req.params.id,
      eventType: "document_deleted",
      performedBy: identity.userId,
      performedByEmail: identity.userEmail,
      details: { documentId: req.params.docId, filename: doc.filename },
    });
  }

  res.status(204).send();
});

function serializeDoc(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    startupId: String(doc.startupId),
    filename: doc.filename,
    mimeType: doc.mimeType,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
    storageKey: doc.storageKey ?? null,
    sizeBytes: doc.sizeBytes ?? 0,
    chunkCount: doc.chunkCount,
    status: doc.status,
    errorMessage: doc.errorMessage ?? null,
  };
}
