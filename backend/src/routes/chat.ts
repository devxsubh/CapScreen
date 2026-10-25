import express from "express";
import type { LlmMessage, LlmToolChoice } from "../lib/llm/providers";
import { runAgentStream } from "../lib/llm/streamAgent";
import {
  screenerRegistry,
  SCREEN_CAP_TABLE_TOOL_NAME,
} from "../lib/tools";
import type { ScreeningResult } from "../lib/screening/runScreening";
import {
  validateChatMessages,
  validateCsvContent,
} from "../lib/chat/validateChatPayload";
import { friendlyLlmError } from "../lib/llm/friendlyError";
import { connectDb } from "../lib/infra/db";
import {
  extractMentionsFromMessages,
  resolveStartupMentions,
} from "../lib/chat/startupMentions";
import type { ToolContext } from "../lib/tools/types";
import { buildSystemPrompt } from "../lib/chat/buildSystemPrompt";

export const chatRouter = express.Router();

const BASE_SYSTEM =
  `You are a compliance screening assistant for venture capital teams. ` +
  `You help users screen cap-table CSVs and uploaded documents against Watchman sanctions lists, ` +
  `and answer questions about document content.\n\n` +
  `## General rules\n` +
  `- Format responses with Markdown: ## headings, bullet lists, GFM pipe tables for metric summaries.\n` +
  `- Be concise and professional. Recommend human expert verification for final decisions.\n` +
  `- Use numbered markdown lists (1. … 2. …) ONLY when the user must pick between 2–5 mutually exclusive paths. The UI renders these as clickable chips. Do NOT add numbered option lists on greetings, acknowledgments, simple factual answers, or when the user already stated what they want. Prefer a short direct reply; if you need clarification, ask one follow-up question in plain prose.\n` +
  `- Never conclude guilt or confirm sanctions violations — you are a screening aid, not a legal determination.\n` +
  `- Never invent match scores, entity names, or screening data — always call a tool to look up facts.\n` +
  `- For current news, company background, or public sanctions activity outside screening data, call web_search — it works in any conversation, not only after a cap-table screen.\n` +
  `- After screen_cap_table, give aggregate counts only — do NOT enumerate entities in chat; the UI shows graph + risk table in a side panel.\n` +
  `- When you call web_search, you MUST include every source URL from the results as a markdown hyperlink [title](url) in your response. Never summarise web results without citing links.\n\n` +
  `CSV ingest: any CSV format is accepted — the system auto-detects cap tables (entity + owner + ownership %) or flat entity lists.`;

function toLlmMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): LlmMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function parseScreeningResult(value: unknown): ScreeningResult | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ScreeningResult;
  if (!Array.isArray(r.entities) || typeof r.totalEntities !== "number") {
    return null;
  }
  return r;
}

chatRouter.post("/", async (req, res) => {
  const { messages, screeningResult, csvContent, startupId } = req.body as {
    messages?: unknown;
    screeningResult?: unknown;
    csvContent?: unknown;
    startupId?: unknown;
  };

  const parsedMessages = validateChatMessages(messages);
  if (!parsedMessages.ok) {
    res.status(400).json({ detail: parsedMessages.detail });
    return;
  }

  const parsedCsv = validateCsvContent(csvContent);
  if (!parsedCsv.ok) {
    res.status(400).json({ detail: parsedCsv.detail });
    return;
  }

  const validMessages = parsedMessages.messages;

  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;

  await connectDb();
  const mentionTokens = extractMentionsFromMessages(validMessages);
  const mentionedStartups = await resolveStartupMentions(mentionTokens, userId);

  const write = (line: string) => {
    res.write(line);
  };

  const ctx: ToolContext = {
    csvContent: parsedCsv.content,
    screeningResult: parseScreeningResult(screeningResult),
    startupId:
      typeof startupId === "string" && startupId.trim()
        ? startupId.trim()
        : mentionedStartups.length === 1
          ? mentionedStartups[0].id
          : null,
    userId,
    userEmail,
    mentionedStartups,
    onScreeningProgress: (event: {
      stage: string;
      status: string;
      detail?: string;
      current?: number;
      total?: number;
    }) => {
      write(
        `data: ${JSON.stringify({ type: "screening_progress", ...event })}\n\n`,
      );
    },
  };

  const wrappedExecute = async (name: string, input: unknown) => {
    const result = await screenerRegistry.execute(name, input, ctx);
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
  };

  const system = buildSystemPrompt(BASE_SYSTEM, ctx, screenerRegistry);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Force screen_cap_table on the first turn when a CSV is attached and no
  // prior result exists — makes the critical routing case deterministic.
  const toolChoice: LlmToolChoice | undefined =
    ctx.csvContent && !ctx.screeningResult
      ? { type: "tool", name: SCREEN_CAP_TABLE_TOOL_NAME }
      : undefined;

  try {
    const { toolActivity } = await runAgentStream({
      systemPrompt: system,
      messages: toLlmMessages(validMessages),
      tools: screenerRegistry.getTools(),
      executeTool: wrappedExecute,
      write,
      maxTokens: 8192,
      toolChoice,
    });

    if (ctx.screeningResult) {
      write(
        `data: ${JSON.stringify({ type: "final_result", screeningResult: ctx.screeningResult })}\n\n`,
      );
    }

    write(
      `data: ${JSON.stringify({ type: "tool_activity", toolActivity })}\n\n`,
    );
  } catch (err) {
    write(`data: ${JSON.stringify({ type: "error", detail: friendlyLlmError(err) })}\n\n`);
  }

  res.end();
});
