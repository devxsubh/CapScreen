import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { openEventStream } from "../../http/eventStream";
import { badRequest } from "../../http/httpError";
import { parseChatMessages } from "../assistant/assistant.validation";
import * as tabularReviewsService from "./tabularReviews.service";
import { toCell, toReview, toRowDocuments } from "./tabularReviews.serializer";

const MAX_CLEAR_CELLS = 100;

export async function list(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(res);
  const projectId = typeof req.query.project_id === "string" && req.query.project_id ? req.query.project_id : undefined;
  const reviews = await tabularReviewsService.listReviews(userId, projectId);
  res.json(reviews.map((r) => toReview(r, userId)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = currentUser(res);
  const body = asBody(req.body);
  const review = await tabularReviewsService.createReview(user, {
    title: body.title as string | undefined,
    documentIds: (body.document_ids as string[] | undefined) ?? [],
    columnsConfig: (body.columns_config as unknown[] | undefined) ?? [],
    workflowId: body.workflow_id as string | undefined,
    projectId: (body.project_id as string | undefined) || undefined,
  });
  res.status(201).json(toReview(review, user.userId));
}

/** Placeholder column prompt until AI column suggestions exist. */
export async function columnPrompt(req: Request, res: Response): Promise<void> {
  const title = typeof asBody(req.body).title === "string" ? asBody(req.body).title : "this field";
  res.json({ prompt: `Extract "${title}" from the document.`, source: "fallback" });
}

export async function get(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(res);
  const { review, cells } = await tabularReviewsService.getReview(req.params.id, userId);
  res.json({
    review: toReview(review, userId),
    cells: cells.map(toCell),
    documents: toRowDocuments(review, userId),
  });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(res);
  const body = asBody(req.body);
  const review = await tabularReviewsService.updateReview(req.params.id, userId, {
    title: body.title as string | undefined,
    columnsConfig: body.columns_config as unknown[] | undefined,
    documentIds: body.document_ids as string[] | undefined,
    projectId: body.project_id as string | null | undefined,
  });
  res.json(toReview(review, userId));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await tabularReviewsService.deleteReview(req.params.id, currentUser(res).userId);
  res.status(204).send();
}

/** Streams progress as SSE (the grid UI shares its reader with chat). */
export async function generate(req: Request, res: Response): Promise<void> {
  const user = currentUser(res);
  const review = await tabularReviewsService.getOwnedReview(req.params.id, user.userId);
  const stream = openEventStream(res);
  try {
    await tabularReviewsService.generateCells(review, user, stream);
  } finally {
    stream.done();
    stream.end();
  }
}

export async function setCell(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const documentId = str(body.document_id);
  const columnIndex = body.column_index;
  if (!documentId || typeof columnIndex !== "number") throw badRequest("document_id and column_index required");
  const summary = (body.content as { summary?: string } | undefined)?.summary ?? "";
  res.json(await tabularReviewsService.setCell(req.params.id, currentUser(res), { documentId, columnIndex, summary }));
}

export async function clearCells(req: Request, res: Response): Promise<void> {
  const documentIds = asBody(req.body).document_ids as string[] | undefined;
  if (!documentIds?.length) throw badRequest("document_ids required");
  if (documentIds.length > MAX_CLEAR_CELLS) throw badRequest(`document_ids limited to ${MAX_CLEAR_CELLS} entries`);
  await tabularReviewsService.clearCells(req.params.id, currentUser(res).userId, documentIds);
  res.json({ ok: true });
}

export async function chat(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const messages = parseChatMessages(body.messages);
  await tabularReviewsService.streamGridChat(res, req.params.id, currentUser(res), {
    messages,
    chatId: str(body.chat_id).trim() || undefined,
    reviewTitle: str(body.review_title).trim() || undefined,
    projectName: typeof body.project_name === "string" ? body.project_name : undefined,
  });
}

/** Grid chats are not saved yet; these keep the UI's history calls working. */
export async function listChats(_req: Request, res: Response): Promise<void> {
  res.json([]);
}

export async function noContent(_req: Request, res: Response): Promise<void> {
  res.status(204).send();
}
