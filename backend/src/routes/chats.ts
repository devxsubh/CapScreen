import express from "express";
import mongoose from "mongoose";
import { connectDb } from "../lib/infra/db";
import { requireAuth } from "../middleware/requireAuth";
import { AssistantChat } from "../models";

export const chatsRouter = express.Router();

chatsRouter.use(requireAuth);
chatsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

async function findChat(id: string, userId: string): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return AssistantChat.findOne({ _id: id, userId }).lean() as Promise<Record<string, unknown> | null>;
}

function deriveTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

function toChat(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    project_id: (doc.projectId as string | null) ?? null,
    user_id: doc.userId as string,
    title: (doc.title as string | null) ?? null,
    created_at: new Date(doc.createdAt as string).toISOString(),
  };
}

// GET /api/chats?limit=21
chatsRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
    100,
  );

  const docs = await AssistantChat.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  const result = docs.map((d) => toChat(d as Record<string, unknown>));
  res.json(result.slice(0, limit));
});

// POST /api/chats
chatsRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const { project_id } = req.body as { project_id?: string };

  const doc = await AssistantChat.create({
    userId,
    projectId: project_id?.trim() || null,
    title: null,
    messages: [],
  });
  res.status(201).json({ id: String(doc._id) });
});

// GET /api/chats/:id
chatsRouter.get("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  const doc = await findChat(req.params.id, userId);

  if (!doc) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  res.json({
    chat: toChat(doc),
    messages: (doc.messages as unknown[]) ?? [],
  });
});

// PATCH /api/chats/:id
chatsRouter.patch("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const { title } = req.body as { title?: string };
  if (!title?.trim()) {
    res.status(400).json({ detail: "title is required" });
    return;
  }

  const existing = await findChat(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  const doc = await AssistantChat.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { title: title.trim(), updatedAt: new Date() } },
    { new: true },
  ).lean();

  if (!doc) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }
  res.json(toChat(doc as Record<string, unknown>));
});

// PUT /api/chats/:id/messages
chatsRouter.put("/:id/messages", async (req, res) => {
  const userId = res.locals.userId as string;
  const { messages } = req.body as { messages?: unknown[] };
  if (!Array.isArray(messages)) {
    res.status(400).json({ detail: "messages array is required" });
    return;
  }

  const existing = await findChat(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  const doc = await AssistantChat.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { messages, updatedAt: new Date() } },
    { new: true },
  ).lean();

  if (!doc) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  res.json({ ok: true });
});

// POST /api/chats/:id/generate-title
chatsRouter.post("/:id/generate-title", async (req, res) => {
  const userId = res.locals.userId as string;
  const { message } = req.body as { message?: string };
  const title = deriveTitle(message ?? "");

  const existing = await findChat(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  const doc = await AssistantChat.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { title, updatedAt: new Date() } },
    { new: true },
  ).lean();

  if (!doc) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }
  res.json({ title });
});

// DELETE /api/chats/:id
chatsRouter.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const existing = await findChat(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }

  const result = await AssistantChat.findOneAndDelete({
    _id: req.params.id,
    userId,
  });
  if (!result) {
    res.status(404).json({ detail: "Chat not found" });
    return;
  }
  res.status(204).send();
});
