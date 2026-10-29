import { Router } from "express";
import { CapTableCsv, Startup, StartupChat, StartupDocument } from "../../models";
import {
  findAccessibleStartup,
} from "../../lib/sample/sampleAssets";
import {
  ownerFilter,
  visibleStartupFilter,
} from "./middleware";
import { toStartup } from "./serializers";

export const startupsCrudListRouter = Router();
export const startupsCrudDetailRouter = Router();

startupsCrudListRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const list = await Startup.find(visibleStartupFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  const result = list.map(toStartup);
  res.json(result);
});

startupsCrudListRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ detail: "name is required" });
    return;
  }
  const s = await Startup.create({ name: name.trim(), ownerId: userId });
  res.status(201).json(toStartup(s.toObject()));
});

startupsCrudDetailRouter.get("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const s = await findAccessibleStartup(req.params.id, userId);
  if (!s) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const result = toStartup(s);
  res.json(result);
});

startupsCrudDetailRouter.patch("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const { name } = req.body as { name?: string };
  const s = await Startup.findOneAndUpdate(
    { _id: req.params.id, ...ownerFilter(userId) },
    { ...(name?.trim() && { name: name.trim() }) },
    { new: true },
  ).lean();
  if (!s) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const result = toStartup(s);
  res.json(result);
});

startupsCrudDetailRouter.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const s = await findAccessibleStartup(req.params.id, userId);
  if (!s) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const now = new Date();
  await Startup.findByIdAndUpdate(req.params.id, { $set: { deletedAt: now } });
  await CapTableCsv.updateMany(
    { startupId: req.params.id, deletedAt: null },
    { $set: { deletedAt: now } },
  );
  await StartupChat.deleteOne({ startupId: req.params.id });
  await StartupDocument.deleteMany({ startupId: req.params.id });
  res.status(204).send();
});
