import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import * as chatsRepository from "./chats.repository";
import * as chatsService from "./chats.service";
import { toChat } from "./chats.serializer";

function messagesFrom(req: Request): unknown[] {
  const { messages } = asBody(req.body);
  if (!Array.isArray(messages)) throw badRequest("messages array is required");
  return messages;
}

// ── /api/chats ───────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response): Promise<void> {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const chats = await chatsService.listChats(currentUser(res).userId, limit);
  res.json(chats.map(toChat));
}

export async function create(req: Request, res: Response): Promise<void> {
  const projectId = str(asBody(req.body).project_id).trim() || null;
  const chat = await chatsService.createChat(currentUser(res).userId, projectId);
  res.status(201).json({ id: String(chat._id) });
}

export async function get(req: Request, res: Response): Promise<void> {
  const chat = await chatsService.getChat(req.params.id, currentUser(res).userId);
  res.json({ chat: toChat(chat), messages: (chat.messages as unknown[]) ?? [] });
}

export async function rename(req: Request, res: Response): Promise<void> {
  const title = str(asBody(req.body).title).trim();
  if (!title) throw badRequest("title is required");
  res.json(toChat(await chatsService.renameChat(req.params.id, currentUser(res).userId, title)));
}

export async function saveMessages(req: Request, res: Response): Promise<void> {
  await chatsService.saveMessages(req.params.id, currentUser(res).userId, messagesFrom(req));
  res.json({ ok: true });
}

export async function generateTitle(req: Request, res: Response): Promise<void> {
  const title = await chatsService.titleFromMessage(req.params.id, currentUser(res).userId, str(asBody(req.body).message));
  res.json({ title });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await chatsService.deleteChat(req.params.id, currentUser(res).userId);
  res.status(204).send();
}

// ── /api/startups/:id/chat ───────────────────────────────────────────────────

export async function getStartupTranscript(req: Request, res: Response): Promise<void> {
  res.json({ messages: await chatsRepository.findStartupTranscript(req.params.id) });
}

export async function saveStartupTranscript(req: Request, res: Response): Promise<void> {
  await chatsRepository.saveStartupTranscript(req.params.id, messagesFrom(req));
  res.json({ ok: true });
}
