import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import * as assistantService from "./assistant.service";
import { parseChatMessages } from "./assistant.validation";

/**
 * POST /chat — the one agent route (assistant, startup page chat). Body:
 * { messages, chat_id?, csvContent?, screeningResult?, startup_id? | project_id?,
 *   attached_documents?, displayed_doc? }. Answers with Server-Sent Events.
 */
export async function chat(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  await assistantService.streamNewTurn(
    res,
    {
      messages: parseChatMessages(body.messages),
      chatId: str(body.chat_id).trim() || undefined,
      csvContent: body.csvContent,
      screeningResult: body.screeningResult,
      startupId: str(body.startup_id).trim() || str(body.project_id).trim() || undefined,
      attachedDocuments: body.attached_documents,
      displayedDocument: body.displayed_doc,
    },
    currentUser(res),
  );
}

/** POST /chat/runs/:runId/resume — body { approved: boolean }; streams the rest of the turn. */
export async function resume(req: Request, res: Response): Promise<void> {
  const { approved } = asBody(req.body);
  if (typeof approved !== "boolean") throw badRequest("'approved' must be true or false");
  await assistantService.streamResumedTurn(res, req.params.runId, approved, currentUser(res));
}

/** Chat id for a sidebar entry that has no saved history yet. */
export async function create(_req: Request, res: Response): Promise<void> {
  res.json({ id: randomUUID() });
}
