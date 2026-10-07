import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { requireAuth } from "../../middleware/requireAuth";
import { connectDb } from "../../lib/infra/db";
import { authIdentityOr500 } from "../../middleware/userIdentity";
import { StoredDocument } from "../../models/documents/storedDocument";
import { Startup } from "../../models";
import {
  buildUserDocumentKey,
  deleteObject,
  detectFileType,
  getObjectDownloadUrl,
  r2Configured,
  uploadObject,
} from "../../lib/infra/r2Storage";
import { toAppDocument } from "./serializers";

export const singleDocumentsRouter = Router();

const MAX_MB = parseInt(process.env.DOCUMENT_UPLOAD_MAX_MB ?? "25", 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

singleDocumentsRouter.use(requireAuth);
singleDocumentsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

singleDocumentsRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const docs = await StoredDocument.find({ ownerId: userId, projectId: null })
    .sort({ createdAt: -1 })
    .lean();
  res.json(docs.map((d) => toAppDocument(d as Record<string, unknown>)));
});

singleDocumentsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!r2Configured()) {
    res.status(503).json({ detail: "Object storage is not configured" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ detail: "No file uploaded" });
    return;
  }

  const identity = authIdentityOr500(res);
  if (!identity) return;

  const doc = await StoredDocument.create({
    ownerId: identity.userId,
    projectId: null,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileType: detectFileType(req.file.originalname, req.file.mimetype),
    storageKey: "pending",
    sizeBytes: req.file.size,
    status: "ready",
  });

  const storageKey = buildUserDocumentKey({
    userId: identity.userId,
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
    res.status(201).json(toAppDocument(doc.toObject() as Record<string, unknown>));
  } catch (err) {
    await doc.deleteOne();
    const detail = err instanceof Error ? err.message : "Upload failed";
    res.status(500).json({ detail });
  }
});

singleDocumentsRouter.get("/:docId/url", async (req, res) => {
  const userId = res.locals.userId as string;
  const doc = (await StoredDocument.findOne({
    _id: req.params.docId,
    ownerId: userId,
  }).lean()) as Record<string, unknown> | null;
  if (!doc) {
    res.status(404).json({ detail: "Document not found" });
    return;
  }
  const url = await getObjectDownloadUrl(
    doc.storageKey as string,
    doc.filename as string,
  );
  if (!url) {
    res.status(503).json({ detail: "Could not generate download URL" });
    return;
  }
  res.json({
    url,
    filename: doc.filename,
    version_id: null,
  });
});

singleDocumentsRouter.delete("/:docId", async (req, res) => {
  const userId = res.locals.userId as string;
  const doc = await StoredDocument.findOneAndDelete({
    _id: req.params.docId,
    ownerId: userId,
  });
  if (!doc) {
    res.status(404).json({ detail: "Document not found" });
    return;
  }
  await deleteObject(doc.storageKey).catch(() => {});
  res.status(204).send();
});

async function assertProjectOwned(
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return false;
  const startup = await Startup.findOne({ _id: projectId, ownerId: userId }).lean();
  return Boolean(startup);
}

export const projectDocumentsRouter = Router();

projectDocumentsRouter.use(requireAuth);
projectDocumentsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

projectDocumentsRouter.post(
  "/:projectId/documents",
  upload.single("file"),
  async (req, res) => {
    if (!r2Configured()) {
      res.status(503).json({ detail: "Object storage is not configured" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ detail: "No file uploaded" });
      return;
    }

    const identity = authIdentityOr500(res);
    if (!identity) return;

    const owned = await assertProjectOwned(req.params.projectId, identity.userId);
    if (!owned) {
      res.status(404).json({ detail: "Project not found" });
      return;
    }

    const doc = await StoredDocument.create({
      ownerId: identity.userId,
      projectId: new mongoose.Types.ObjectId(req.params.projectId),
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileType: detectFileType(req.file.originalname, req.file.mimetype),
      storageKey: "pending",
      sizeBytes: req.file.size,
      status: "ready",
    });

    const storageKey = buildUserDocumentKey({
      userId: identity.userId,
      docId: doc._id.toString(),
      filename: req.file.originalname,
      projectId: req.params.projectId,
    });

    try {
      await uploadObject({
        key: storageKey,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      doc.storageKey = storageKey;
      await doc.save();
      res.status(201).json(toAppDocument(doc.toObject() as Record<string, unknown>));
    } catch (err) {
      await doc.deleteOne();
      const detail = err instanceof Error ? err.message : "Upload failed";
      res.status(500).json({ detail });
    }
  },
);
