import { notFound } from "../../http/httpError";
import * as chatsRepository from "./chats.repository";
import type { ChatRecord } from "./chats.repository";

const CHAT_NOT_FOUND = "Chat not found";

export async function listChats(userId: string, limit: number): Promise<ChatRecord[]> {
  return chatsRepository.listForUser(userId, limit);
}

export async function getChat(id: string, userId: string): Promise<ChatRecord> {
  const chat = await chatsRepository.findForUser(id, userId);
  if (!chat) throw notFound(CHAT_NOT_FOUND);
  return chat;
}

export async function createChat(userId: string, projectId: string | null): Promise<ChatRecord> {
  return chatsRepository.create(userId, projectId);
}

export async function renameChat(id: string, userId: string, title: string): Promise<ChatRecord> {
  return update(id, userId, { title });
}

export async function saveMessages(id: string, userId: string, messages: unknown[]): Promise<void> {
  await update(id, userId, { messages });
}

/** Titles come from the first message: whitespace collapsed, at most 80 characters. */
export async function titleFromMessage(id: string, userId: string, message: string): Promise<string> {
  const compact = message.replace(/\s+/g, " ").trim();
  const title = !compact ? "New chat" : compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  await update(id, userId, { title });
  return title;
}

export async function deleteChat(id: string, userId: string): Promise<void> {
  if (!(await chatsRepository.deleteForUser(id, userId))) throw notFound(CHAT_NOT_FOUND);
}

async function update(id: string, userId: string, fields: Record<string, unknown>): Promise<ChatRecord> {
  const chat = await chatsRepository.updateForUser(id, userId, fields);
  if (!chat) throw notFound(CHAT_NOT_FOUND);
  return chat;
}
