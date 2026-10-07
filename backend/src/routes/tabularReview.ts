import { randomUUID } from "crypto";
import express from "express";
import type Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth";
import { connectDb } from "../lib/infra/db";
import { TabularReview } from "../models";
import { TabularCell } from "../models";
import {
  findAccessibleTabularReview,
  hideSampleAsset,
  isSampleRecord,
  isWritableTabularReview,
  visibleTabularReviewFilter,
} from "../lib/sample/sampleAssets";
import { applyTabularStatusCell } from "../lib/tabular/reviewStatusSync";
import { buildTabularContextPrompt } from "../lib/tabular/buildTabularChatPrompt";
import { syncPortfolioMonitoringReview } from "../lib/portfolio/portfolioGrid";
import { buildSystemPrompt } from "../lib/chat/buildSystemPrompt";
import {
  extractMentionsFromMessages,
  resolveStartupMentions,
  type MentionedStartup,
} from "../lib/chat/startupMentions";
import { assistantRegistry, type ToolContext } from "../lib/tools";
import { runAgentStream } from "../lib/llm/streamAgent";
import { getAnthropicModel } from "../lib/llm/models";
import { buildWorkflowStore } from "../lib/workflows/workflowMemory";
import type { ColumnConfig, TabularRowDoc } from "../types/tabular";
import { sendEmailSafe, sendReviewInviteEmail } from "../lib/auth/email";
import { resolveInviterLabel } from "../lib/auth/inviterLabel";

export const tabularReviewRouter = express.Router();

tabularReviewRouter.use(requireAuth);
tabularReviewRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

function toReviewApi(raw: Record<string, unknown>, userId: string) {
  return {
    id: String(raw._id),
    project_id: raw.projectId ? String(raw.projectId) : null,
    user_id: raw.userId as string,
    title: raw.title ?? null,
    columns_config: raw.columnsConfig ?? [],
    document_ids: raw.rowIds ?? [],
    workflow_id: raw.workflowId ?? null,
    shared_with: raw.sharedWith ?? [],
    is_owner: raw.userId === userId,
    created_at: new Date(raw.createdAt as string).toISOString(),
    updated_at: new Date(raw.updatedAt as string).toISOString(),
    document_count: Array.isArray(raw.rowIds) ? raw.rowIds.length : 0,
    review_kind: raw.reviewKind ?? "standard",
    is_sample: raw.isSample === true,
  };
}

function toCellApi(raw: Record<string, unknown>) {
  return {
    id: String(raw._id),
    review_id: String(raw.reviewId),
    document_id: raw.documentId,
    column_index: raw.columnIndex,
    content: raw.content ?? null,
    status: raw.status ?? "done",
    created_at: new Date(raw.createdAt as string).toISOString(),
  };
}

async function findOwnedReview(id: string, userId: string) {
  const review = await findAccessibleTabularReview(id, userId);
  if (!review || !isWritableTabularReview(review, userId)) return null;
  return review;
}

async function findAccessibleReview(id: string, userId: string) {
  return findAccessibleTabularReview(id, userId);
}

function rowsToDocuments(
  rows: Array<{ id: string; name: string }>,
  userId: string,
  projectId: string | null,
): TabularRowDoc[] {
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    user_id: userId,
    project_id: projectId,
    folder_id: null,
    filename: r.name,
    mime_type: "text/plain",
    size_bytes: 0,
    created_at: now,
    updated_at: now,
  }));
}

tabularReviewRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const { project_id } = req.query as { project_id?: string };

  const extra: Record<string, unknown> = {};
  if (project_id) {
    extra.projectId = new mongoose.Types.ObjectId(project_id);
  }

  const list = await TabularReview.find(
    await visibleTabularReviewFilter(userId, extra),
  )
    .sort({ updatedAt: -1 })
    .lean();
  res.json(list.map((r) => toReviewApi(r as Record<string, unknown>, userId)));
});

tabularReviewRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;
  const {
    title,
    document_ids,
    columns_config,
    workflow_id,
    project_id,
  } = req.body as {
    title?: string;
    document_ids?: string[];
    columns_config?: unknown[];
    workflow_id?: string;
    project_id?: string;
  };

  const rowIds = document_ids ?? [];
  const review = await TabularReview.create({
    userId,
    userEmail,
    title: title?.trim() ?? "Untitled review",
    projectId: project_id ? new mongoose.Types.ObjectId(project_id) : null,
    workflowId: workflow_id ?? null,
    reviewKind: "standard",
    columnsConfig: columns_config ?? [],
    rowIds,
    rows: rowIds.map((id) => ({ id, name: id, meta: {} })),
  });

  res.status(201).json(toReviewApi(review.toObject(), userId));
});

tabularReviewRouter.post("/prompt", async (req, res) => {
  const { title } = req.body as { title?: string };
  res.json({
    prompt: `Extract "${title ?? "this field"}" from the document.`,
    source: "fallback",
  });
});

tabularReviewRouter.get("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const review = (await findAccessibleReview(req.params.id, userId)) as
    | Record<string, unknown>
    | null;

  if (!review) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  const cells = await TabularCell.find({ reviewId: req.params.id }).lean();
  const rows = (review.rows as Array<{ id: string; name: string }>) ?? [];
  const projectId = review.projectId ? String(review.projectId) : null;

  res.json({
    review: toReviewApi(review, userId),
    cells: cells.map((c) => toCellApi(c as Record<string, unknown>)),
    documents: rowsToDocuments(rows, userId, projectId),
  });
});

tabularReviewRouter.patch("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;
  const {
    title,
    columns_config,
    document_ids,
    project_id,
    shared_with,
  } = req.body as {
    title?: string;
    columns_config?: unknown[];
    document_ids?: string[];
    project_id?: string | null;
    shared_with?: string[];
  };

  const existing = (await findOwnedReview(req.params.id, userId)) as
    | Record<string, unknown>
    | null;
  if (!existing) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  const previousShared = Array.isArray(existing.sharedWith)
    ? (existing.sharedWith as string[]).map((e) => e.toLowerCase())
    : [];

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) update.title = title;
  if (columns_config !== undefined) update.columnsConfig = columns_config;
  if (shared_with !== undefined) update.sharedWith = shared_with;
  if (project_id !== undefined) {
    update.projectId = project_id
      ? new mongoose.Types.ObjectId(project_id)
      : null;
  }
  if (document_ids !== undefined) {
    update.rowIds = document_ids;
  }

  const review = await TabularReview.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: update },
    { new: true },
  ).lean();

  if (!review) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  if (shared_with !== undefined) {
    const nextShared = shared_with.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const added = nextShared.filter((email) => !previousShared.includes(email));
    if (added.length > 0) {
      const inviterLabel = await resolveInviterLabel(userId, userEmail);
      const reviewDoc = review as Record<string, unknown>;
      const reviewTitle =
        typeof reviewDoc.title === "string" && reviewDoc.title.trim()
          ? reviewDoc.title
          : "Tabular review";
      const projectId = reviewDoc.projectId
        ? String(reviewDoc.projectId)
        : null;
      for (const to of added) {
        sendEmailSafe(() =>
          sendReviewInviteEmail({
            to,
            inviterLabel,
            reviewTitle,
            reviewId: req.params.id,
            projectId,
          }),
        );
      }
    }
  }

  res.json(toReviewApi(review as Record<string, unknown>, userId));
});

tabularReviewRouter.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const existing = await findAccessibleReview(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  if (isSampleRecord(existing)) {
    await hideSampleAsset(userId, "tabular_review", req.params.id);
    res.status(204).send();
    return;
  }

  const review = await TabularReview.findOneAndDelete({
    _id: req.params.id,
    userId,
  });
  if (!review) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }
  await TabularCell.deleteMany({ reviewId: req.params.id });
  res.status(204).send();
});

tabularReviewRouter.get("/:id/people", async (_req, res) => {
  res.json({ owner: { email: "admin@capscreen.local", name: "CapScreen Admin" }, shared: [] });
});

function writeSse(write: (line: string) => void, payload: unknown) {
  write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Screening-backed reviews skip LLM column extraction — cells sync from startup data. */
tabularReviewRouter.post("/:id/generate", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;
  const owned = (await findOwnedReview(req.params.id, userId)) as
    | Record<string, unknown>
    | null;

  if (!owned) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  const kind = (owned.reviewKind as string) ?? "standard";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (line: string) => res.write(line);

  try {
    if (kind === "portfolio_monitoring") {
      await syncPortfolioMonitoringReview({ userId, userEmail });
      writeSse(write, {
        type: "info",
        message: "Portfolio grid refreshed from startup screening data.",
      });
    } else if (kind === "entity_screening") {
      writeSse(write, {
        type: "info",
        message: "Entity grid is populated from the linked startup screen.",
      });
    } else {
      writeSse(write, {
        type: "error",
        message:
          "AI column extraction for document-based tabular reviews is not available yet. Use the Assistant panel to ask questions about your grid.",
      });
    }
    write("data: [DONE]\n\n");
  } catch (err) {
    console.error("[tabularReview/generate] error:", err);
    writeSse(write, {
      type: "error",
      message: err instanceof Error ? err.message : "Generation failed",
    });
    write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

tabularReviewRouter.post("/:id/regenerate-cell", async (req, res) => {
  const { document_id, column_index, content } = req.body as {
    document_id?: string;
    column_index?: number;
    content?: { summary?: string };
  };

  if (!document_id || column_index === undefined) {
    res.status(400).json({ detail: "document_id and column_index required" });
    return;
  }

  const summary = content?.summary ?? "";
  const userId = res.locals.userId as string;
  const owned = await findOwnedReview(req.params.id, userId);
  if (!owned) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }
  const userEmail = res.locals.userEmail as string;

  const cell = await TabularCell.findOneAndUpdate(
    {
      reviewId: req.params.id,
      documentId: document_id,
      columnIndex: column_index,
    },
    {
      $set: {
        content: { summary, flag: "grey", reasoning: "" },
        status: "done",
      },
    },
    { upsert: true, new: true },
  ).lean();

  await applyTabularStatusCell({
    reviewId: req.params.id,
    documentId: document_id,
    columnIndex: column_index,
    summary,
    performedBy: userId,
    performedByEmail: userEmail,
  });

  const c = cell as Record<string, unknown>;
  res.json({
    summary: (c.content as { summary: string })?.summary ?? summary,
    flag: (c.content as { flag: string })?.flag ?? "grey",
    reasoning: "",
  });
});

tabularReviewRouter.post("/:id/clear-cells", async (req, res) => {
  const userId = res.locals.userId as string;
  const { document_ids } = req.body as { document_ids?: string[] };
  if (!document_ids?.length) {
    res.status(400).json({ detail: "document_ids required" });
    return;
  }
  if (document_ids.length > 100) {
    res.status(400).json({ detail: "document_ids limited to 100 entries" });
    return;
  }
  const owned = await findOwnedReview(req.params.id, userId);
  if (!owned) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }
  await TabularCell.deleteMany({
    reviewId: req.params.id,
    documentId: { $in: document_ids },
  });
  res.json({ ok: true });
});

tabularReviewRouter.get("/:id/chats", async (_req, res) => {
  res.json([]);
});

tabularReviewRouter.get("/:id/chats/:chatId/messages", async (_req, res) => {
  res.json([]);
});

tabularReviewRouter.delete("/:id/chats/:chatId", async (_req, res) => {
  res.status(204).send();
});

const TABULAR_BASE_SYSTEM =
  `You are CapScreen's compliance assistant helping a user analyze a tabular review grid.\n\n` +
  `Answer questions using the grid data in context. Reference rows by document/company name and columns by header.\n\n` +
  `When the user @-mentions a startup, use list_mentioned_startups and screening tools for deeper detail.\n\n` +
  `For portfolio monitoring grids, explain that "Co-investor risk: Not screened" means no co-investor roster screen has been run yet — suggest screening the startup's vendor/co-investor roster.\n\n` +
  `Be concise and professional. Never conclude guilt or confirm sanctions violations.\n` +
  `Use numbered markdown lists (1. … 2. …) ONLY when the user must pick between 2–5 mutually exclusive paths. Do NOT add numbered option lists on greetings, acknowledgments, or simple factual answers.\n` +
  `For current news or public sanctions activity outside the grid, call web_search.`;

type TabularChatMessage = { role: "user" | "assistant"; content: string };

function parseTabularChatMessages(
  value: unknown,
): { ok: true; messages: TabularChatMessage[] } | { ok: false; detail: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, detail: "'messages' must be a non-empty array" };
  }
  if (value.length > 50) {
    return { ok: false, detail: "Too many messages (max 50)" };
  }

  const out: TabularChatMessage[] = [];
  for (const m of value) {
    if (typeof m !== "object" || m === null) continue;
    const row = m as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    const content = row.content.trim();
    if (Buffer.byteLength(content, "utf8") > 16 * 1024) {
      return { ok: false, detail: "Message exceeds 16 KB limit" };
    }
    out.push({ role: row.role, content });
  }

  if (out.length === 0) {
    return { ok: false, detail: "'messages' must contain at least one valid entry" };
  }
  return { ok: true, messages: out };
}

function toAnthropicMessages(
  messages: TabularChatMessage[],
): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function mergeMentionedStartups(
  ...lists: MentionedStartup[][]
): MentionedStartup[] {
  const seen = new Set<string>();
  const out: MentionedStartup[] = [];
  for (const list of lists) {
    for (const s of list) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

async function resolveGridStartups(
  review: Record<string, unknown>,
  userId: string,
): Promise<MentionedStartup[]> {
  const kind = (review.reviewKind as string) ?? "standard";
  const rows =
    (review.rows as Array<{
      id: string;
      name: string;
      meta?: { startupId?: string };
    }>) ?? [];

  if (kind === "portfolio_monitoring") {
    const tokens = rows
      .map((r) => r.meta?.startupId ?? r.name)
      .filter(Boolean);
    return resolveStartupMentions(tokens, userId);
  }

  if (kind === "entity_screening" && review.projectId) {
    return resolveStartupMentions([String(review.projectId)], userId);
  }

  return [];
}

tabularReviewRouter.post("/:id/chat", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;

  const { messages, chat_id, review_title, project_name } = req.body as {
    messages?: unknown;
    chat_id?: string;
    review_title?: string;
    project_name?: string;
  };

  const parsed = parseTabularChatMessages(messages);
  if (!parsed.ok) {
    res.status(400).json({ detail: parsed.detail });
    return;
  }

  const review = (await findOwnedReview(req.params.id, userId)) as
    | Record<string, unknown>
    | null;
  if (!review) {
    res.status(404).json({ detail: "Review not found" });
    return;
  }

  const cells = await TabularCell.find({ reviewId: req.params.id }).lean();
  const rows =
    (review.rows as Array<{ id: string; name: string; meta?: Record<string, unknown> }>) ??
    [];
  const columns = (review.columnsConfig as ColumnConfig[]) ?? [];

  const mentionTokens = extractMentionsFromMessages(parsed.messages);
  const workflowStore = await buildWorkflowStore(userId, userEmail);
  const fromMessages = await resolveStartupMentions(mentionTokens, userId);
  const fromGrid = await resolveGridStartups(review, userId);
  const mentionedStartups = mergeMentionedStartups(fromMessages, fromGrid);

  const gridContext = buildTabularContextPrompt({
    title:
      (typeof review_title === "string" && review_title.trim()) ||
      (typeof review.title === "string" && review.title) ||
      "Tabular review",
    reviewKind: (review.reviewKind as string) ?? "standard",
    projectName: typeof project_name === "string" ? project_name : null,
    columns,
    rows,
    cells: cells.map((c) => ({
      documentId: c.documentId as string,
      columnIndex: c.columnIndex as number,
      content: c.content as { summary?: string; flag?: string } | null,
      status: (c.status as string) ?? "done",
    })),
  });

  const startupId =
    (review.projectId ? String(review.projectId) : undefined) ??
    (mentionedStartups.length === 1 ? mentionedStartups[0].id : undefined);

  const ctx: ToolContext = {
    csvContent: null,
    screeningResult: null,
    mentionedStartups,
    workflowStore,
    userId,
    userEmail,
    startupId,
  };

  let system = buildSystemPrompt(
    `${TABULAR_BASE_SYSTEM}\n\n${gridContext}`,
    ctx,
    assistantRegistry,
  );

  const chatId = chat_id?.trim() || randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (line: string) => res.write(line);
  write(`data: ${JSON.stringify({ type: "chat_id", chatId })}\n\n`);

  try {
    await runAgentStream({
      model: getAnthropicModel(),
      systemPrompt: system,
      messages: toAnthropicMessages(parsed.messages),
      tools: assistantRegistry.getTools(),
      write,
      executeTool: async (name, input) => {
        const result = await assistantRegistry.execute(name, input, ctx);
        if (result.screeningResult) {
          ctx.screeningResult = result.screeningResult;
          write(
            `data: ${JSON.stringify({
              type: "screening_result",
              screeningResult: result.screeningResult,
            })}\n\n`,
          );
        }
        return { content: result.content, document: result.document };
      },
    });

    if (ctx.screeningResult) {
      write(
        `data: ${JSON.stringify({ type: "final_result", screeningResult: ctx.screeningResult })}\n\n`,
      );
    }

    write("data: [DONE]\n\n");
  } catch (err) {
    console.error("[tabularReview/chat] error:", err);
    let message = err instanceof Error ? err.message : "Stream error";
    if (message.includes("authentication_error") || message.includes("401")) {
      message =
        "Anthropic API key invalid. Set ANTHROPIC_API_KEY in .env, then restart (pnpm dev).";
    }
    write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});
