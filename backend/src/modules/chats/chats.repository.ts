import mongoose from "mongoose";
import { AssistantChat, StartupChat } from "../../models";

/** Data access for saved conversations: assistant chats and per-startup transcripts. */

export type ChatRecord = Record<string, unknown>;

// ── Assistant chats ──────────────────────────────────────────────────────────

export async function listForUser(userId: string, limit: number): Promise<ChatRecord[]> {
  return (await AssistantChat.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean()) as ChatRecord[];
}

export async function findForUser(id: string, userId: string): Promise<ChatRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await AssistantChat.findOne({ _id: id, userId }).lean()) as ChatRecord | null;
}

export async function create(userId: string, projectId: string | null): Promise<ChatRecord> {
  const doc = await AssistantChat.create({ userId, projectId, title: null, messages: [] });
  return doc.toObject() as ChatRecord;
}

/** Updates one of the user's chats (and its updatedAt). Null when it isn't theirs. */
export async function updateForUser(id: string, userId: string, fields: Record<string, unknown>): Promise<ChatRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await AssistantChat.findOneAndUpdate(
    { _id: id, userId },
    { $set: { ...fields, updatedAt: new Date() } },
    { new: true },
  ).lean()) as ChatRecord | null;
}

export async function deleteForUser(id: string, userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  return Boolean(await AssistantChat.findOneAndDelete({ _id: id, userId }));
}

// ── Startup workspace transcript (one per startup) ───────────────────────────

export async function findStartupTranscript(startupId: string): Promise<unknown[]> {
  const doc = (await StartupChat.findOne({ startupId }).lean()) as { messages?: unknown[] } | null;
  return doc?.messages ?? [];
}

export async function saveStartupTranscript(startupId: string, messages: unknown[]): Promise<void> {
  await StartupChat.findOneAndUpdate(
    { startupId },
    { $set: { messages, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function deleteStartupTranscript(startupId: string): Promise<void> {
  await StartupChat.deleteOne({ startupId });
}
