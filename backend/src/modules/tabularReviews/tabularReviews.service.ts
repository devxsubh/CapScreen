import { randomUUID } from "crypto";
import type { Response } from "express";
import mongoose from "mongoose";
import type { CurrentUser } from "../../http/currentUser";
import type { EventStream } from "../../http/eventStream";
import { notFound } from "../../http/httpError";
import { runAgent } from "../../lib/agent/agentGraph";
import { buildSystemPrompt } from "../../lib/chat/buildSystemPrompt";
import {
  extractMentionsFromMessages,
  resolveStartupMentions,
  type MentionedStartup,
} from "../../lib/chat/startupMentions";
import { syncPortfolioMonitoringReview } from "../portfolio/portfolioGrid.service";
import { buildTabularContextPrompt } from "../../lib/tabular/buildTabularChatPrompt";
import { applyTabularStatusCell } from "./reviewStatusSync.service";
import { assistantRegistry, type ToolContext } from "../../lib/tools";
import { buildWorkflowStore } from "../workflows/workflows.service";
import type { ColumnConfig } from "../../types/tabular";
import { streamAgentTurn } from "../assistant/agentStream";
import type { ChatMessage } from "../assistant/assistant.validation";
import * as tabularReviewsRepository from "./tabularReviews.repository";
import type { CellRecord, ReviewRecord } from "./tabularReviews.repository";
import { TABULAR_SYSTEM_PROMPT } from "./tabularReviews.prompts";

const REVIEW_NOT_FOUND = "Review not found";

export async function listReviews(userId: string, projectId?: string): Promise<ReviewRecord[]> {
  return tabularReviewsRepository.listVisible(userId, projectId);
}

export async function createReview(
  user: CurrentUser,
  input: { title?: string; documentIds: string[]; columnsConfig: unknown[]; workflowId?: string; projectId?: string },
): Promise<ReviewRecord> {
  return tabularReviewsRepository.create({
    userId: user.userId,
    userEmail: user.userEmail,
    title: input.title?.trim() ?? "Untitled review",
    projectId: input.projectId ? new mongoose.Types.ObjectId(input.projectId) : null,
    workflowId: input.workflowId ?? null,
    reviewKind: "standard",
    columnsConfig: input.columnsConfig,
    rowIds: input.documentIds,
    rows: input.documentIds.map((id) => ({ id, name: id, meta: {} })),
  });
}

export async function getReview(id: string, userId: string): Promise<{ review: ReviewRecord; cells: CellRecord[] }> {
  const review = await tabularReviewsRepository.findAccessible(id, userId);
  if (!review) throw notFound(REVIEW_NOT_FOUND);
  return { review, cells: await tabularReviewsRepository.listCells(id) };
}

/** Only the owner may change a review; shared samples are read-only. */
export async function getOwnedReview(id: string, userId: string): Promise<ReviewRecord> {
  const review = await tabularReviewsRepository.findOwned(id, userId);
  if (!review) throw notFound(REVIEW_NOT_FOUND);
  return review;
}

export async function updateReview(
  id: string,
  userId: string,
  input: { title?: string; columnsConfig?: unknown[]; documentIds?: string[]; projectId?: string | null },
): Promise<ReviewRecord> {
  await getOwnedReview(id, userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = input.title;
  if (input.columnsConfig !== undefined) set.columnsConfig = input.columnsConfig;
  if (input.projectId !== undefined) {
    set.projectId = input.projectId ? new mongoose.Types.ObjectId(input.projectId) : null;
  }
  if (input.documentIds !== undefined) set.rowIds = input.documentIds;

  const review = await tabularReviewsRepository.updateOwned(id, userId, set);
  if (!review) throw notFound(REVIEW_NOT_FOUND);
  return review;
}

/** Sample reviews can be removed too — there is only one user per install. */
export async function deleteReview(id: string, userId: string): Promise<void> {
  if (!(await tabularReviewsRepository.findAccessible(id, userId))) throw notFound(REVIEW_NOT_FOUND);
  await tabularReviewsRepository.remove(id);
}

/**
 * Refreshes a grid's cells. Screening-backed grids sync from startup data
 * instead of running LLM column extraction (not available yet for documents).
 */
export async function generateCells(review: ReviewRecord, user: CurrentUser, stream: EventStream): Promise<void> {
  const kind = (review.reviewKind as string) ?? "standard";
  try {
    if (kind === "portfolio_monitoring") {
      await syncPortfolioMonitoringReview(user);
      stream.send({ type: "info", message: "Portfolio grid refreshed from startup screening data." });
    } else if (kind === "entity_screening") {
      stream.send({ type: "info", message: "Entity grid is populated from the linked startup screen." });
    } else {
      stream.send({
        type: "error",
        message:
          "AI column extraction for document-based tabular reviews is not available yet. Use the Assistant panel to ask questions about your grid.",
      });
    }
  } catch (err) {
    console.error("[tabularReview/generate] error:", err);
    stream.send({ type: "error", message: err instanceof Error ? err.message : "Generation failed" });
  }
}

/**
 * Sets one cell by hand. A status column edit is also applied to the
 * underlying entity or portfolio review (with an audit entry).
 */
export async function setCell(
  id: string,
  user: CurrentUser,
  input: { documentId: string; columnIndex: number; summary: string },
): Promise<{ summary: string; flag: string; reasoning: string }> {
  await getOwnedReview(id, user.userId);
  const cell = await tabularReviewsRepository.upsertCell(id, input.documentId, input.columnIndex, {
    content: { summary: input.summary, flag: "grey", reasoning: "" },
    status: "done",
  });
  await applyTabularStatusCell({
    reviewId: id,
    documentId: input.documentId,
    columnIndex: input.columnIndex,
    summary: input.summary,
    performedBy: user.userId,
    performedByEmail: user.userEmail,
  });
  const content = cell.content as { summary?: string; flag?: string } | undefined;
  return { summary: content?.summary ?? input.summary, flag: content?.flag ?? "grey", reasoning: "" };
}

export async function clearCells(id: string, userId: string, documentIds: string[]): Promise<void> {
  await getOwnedReview(id, userId);
  await tabularReviewsRepository.deleteCells(id, documentIds);
}

// ── Grid chat ────────────────────────────────────────────────────────────────

/**
 * Agent chat about a grid: the grid's rows and cells go into the system
 * prompt, and the startups behind it count as @-mentioned.
 */
export async function streamGridChat(
  res: Response,
  id: string,
  user: CurrentUser,
  input: { messages: ChatMessage[]; chatId?: string; reviewTitle?: string; projectName?: string },
): Promise<void> {
  const review = await getOwnedReview(id, user.userId);
  const cells = await tabularReviewsRepository.listCells(id);

  const fromMessages = await resolveStartupMentions(extractMentionsFromMessages(input.messages), user.userId);
  const fromGrid = await gridStartups(review, user.userId);
  const mentionedStartups = uniqueById([...fromMessages, ...fromGrid]);

  const gridContext = buildTabularContextPrompt({
    title: input.reviewTitle || (typeof review.title === "string" && review.title) || "Tabular review",
    reviewKind: (review.reviewKind as string) ?? "standard",
    projectName: input.projectName ?? null,
    columns: (review.columnsConfig as ColumnConfig[]) ?? [],
    rows: (review.rows as Array<{ id: string; name: string; meta?: Record<string, unknown> }>) ?? [],
    cells: cells.map((c) => ({
      documentId: c.documentId as string,
      columnIndex: c.columnIndex as number,
      content: c.content as { summary?: string; flag?: string } | null,
      status: (c.status as string) ?? "done",
    })),
  });

  const ctx: ToolContext = {
    csvContent: null,
    screeningResult: null,
    mentionedStartups,
    workflowStore: await buildWorkflowStore(user.userId),
    userId: user.userId,
    userEmail: user.userEmail,
    startupId:
      (review.projectId ? String(review.projectId) : undefined) ??
      (mentionedStartups.length === 1 ? mentionedStartups[0].id : undefined),
  };
  const systemPrompt = buildSystemPrompt(`${TABULAR_SYSTEM_PROMPT}\n\n${gridContext}`, ctx, assistantRegistry);
  const messages = input.messages.map((m) => ({ role: m.role, content: m.content }));

  await streamAgentTurn(res, { chatId: input.chatId || randomUUID(), ctx }, (deps, signal) =>
    runAgent({ systemPrompt, messages }, deps, signal),
  );
}

/** Portfolio grids cover every startup in their rows; entity grids cover their one startup. */
async function gridStartups(review: ReviewRecord, userId: string): Promise<MentionedStartup[]> {
  const kind = (review.reviewKind as string) ?? "standard";
  if (kind === "portfolio_monitoring") {
    const rows = (review.rows as Array<{ name: string; meta?: { startupId?: string } }>) ?? [];
    return resolveStartupMentions(rows.map((r) => r.meta?.startupId ?? r.name).filter(Boolean), userId);
  }
  if (kind === "entity_screening" && review.projectId) {
    return resolveStartupMentions([String(review.projectId)], userId);
  }
  return [];
}

function uniqueById(startups: MentionedStartup[]): MentionedStartup[] {
  const seen = new Set<string>();
  return startups.filter((s) => !seen.has(s.id) && seen.add(s.id));
}
