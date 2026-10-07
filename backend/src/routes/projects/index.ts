import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { connectDb } from "../../lib/infra/db";
import { loadProjectAssets } from "../../lib/chat/projectAssets";
import {
  findAccessibleStartup,
  isSampleRecord,
  visibleStartupFilter,
} from "../../lib/sample/sampleAssets";
import { Startup } from "../../models";
import { StoredDocument } from "../../models/documents/storedDocument";
import { toAppDocument } from "../documents/serializers";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);
projectsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

function toProject(
  startup: Record<string, unknown>,
  documents: unknown[],
  assets?: Awaited<ReturnType<typeof loadProjectAssets>>,
  viewerUserId?: string,
) {
  const csvs = assets?.csvs ?? [];
  const screening_assets = assets?.screening_assets ?? [];
  const isSample = isSampleRecord(startup);
  return {
    id: String(startup._id),
    user_id: startup.ownerId,
    is_owner: !isSample && startup.ownerId === viewerUserId,
    is_sample: isSample,
    name: startup.name,
    cm_number: null,
    shared_with: [],
    created_at: new Date(startup.createdAt as Date).toISOString(),
    updated_at: new Date(
      (startup.updatedAt as Date | undefined) ??
        (startup.createdAt as Date),
    ).toISOString(),
    documents,
    folders: [],
    csvs,
    screening_assets,
    document_count: documents.length,
    chat_count: 0,
    review_count: 0,
  };
}

projectsRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ detail: "name is required" });
    return;
  }
  const startup = await Startup.create({
    name: name.trim(),
    ownerId: userId,
  });
  res.status(201).json(toProject(startup.toObject() as Record<string, unknown>, []));
});

projectsRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const startups = await Startup.find(await visibleStartupFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  res.json(
    startups.map((s) =>
      toProject(s as Record<string, unknown>, [], undefined, userId),
    ),
  );
});

projectsRouter.get("/:projectId", async (req, res) => {
  const userId = res.locals.userId as string;
  const startupDoc = await findAccessibleStartup(req.params.projectId, userId);
  if (!startupDoc) {
    res.status(404).json({ detail: "Project not found" });
    return;
  }
  const [docs, assets] = await Promise.all([
    StoredDocument.find({
      ownerId: userId,
      projectId: req.params.projectId,
    })
      .sort({ createdAt: -1 })
      .lean(),
    loadProjectAssets(req.params.projectId, userId),
  ]);
  res.json(
    toProject(
      startupDoc,
      docs.map((d) => toAppDocument(d as Record<string, unknown>)),
      assets ?? { csvs: [], screening_assets: [] },
      userId,
    ),
  );
});

projectsRouter.patch("/:projectId", async (req, res) => {
  const userId = res.locals.userId as string;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ detail: "name is required" });
    return;
  }
  const startup = (await Startup.findOneAndUpdate(
    { _id: req.params.projectId, ownerId: userId },
    { name: name.trim() },
    { new: true },
  ).lean()) as Record<string, unknown> | null;
  if (!startup) {
    res.status(404).json({ detail: "Project not found" });
    return;
  }
  const docs = await StoredDocument.find({
    ownerId: userId,
    projectId: req.params.projectId,
  }).lean();
  res.json(
    toProject(
      startup,
      docs.map((d) => toAppDocument(d as Record<string, unknown>)),
    ),
  );
});

projectsRouter.delete("/:projectId", async (req, res) => {
  const userId = res.locals.userId as string;
  const deleted = await Startup.findOneAndUpdate(
    { _id: req.params.projectId, ownerId: userId },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
  if (!deleted) {
    res.status(404).json({ detail: "Project not found" });
    return;
  }
  res.status(204).send();
});
