import { randomUUID } from "crypto";
import express from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { assistantRegistry, type ToolContext } from "../lib/tools";
import { buildSystemPrompt } from "../lib/chat/buildSystemPrompt";
import { runAgentStream } from "../lib/llm/streamAgent";
import { getAnthropicModel } from "../lib/llm/models";
import { connectDb } from "../lib/infra/db";
import { buildWorkflowStore } from "../lib/workflows/workflowMemory";
import {
  extractMentionsFromMessages,
  resolveStartupMentions,
} from "../lib/chat/startupMentions";
import type { ScreeningResult } from "../lib/screening/runScreening";
import { validateCsvContent } from "../lib/chat/validateChatPayload";
import {
  formatProjectAssetsForPrompt,
  loadProjectAssets,
} from "../lib/chat/projectAssets";
import { Startup } from "../models";

export const assistantChatRouter = express.Router();

const BASE_SYSTEM =
  `You are CapScreen's compliance assistant for venture capital teams. ` +
  `You help users screen cap-table CSVs against Watchman sanctions lists, interpret results, and follow structured workflows.\n\n` +
  `When a user message includes a workflow selection, immediately call read_workflow with that workflow's id before other tools, then follow the workflow instructions.\n\n` +
  `When the user @-mentions a startup (e.g. @AcmeAI), their saved screening is injected into the system prompt — use list_mentioned_startups and pass startup_id to tools for portfolio questions.\n\n` +
  `After screen_cap_table completes, reply in 2–4 sentences with aggregate counts only (flagged / review / clear). ` +
  `Do NOT list individual entities, match scores, or ownership chains in chat — the UI opens an interactive side panel with the ownership graph and entity risk table. ` +
  `Use query_screening_data only when the user asks about a specific entity.\n\n` +
  `Be concise and professional. Never conclude guilt or confirm sanctions violations.\n` +
  `For questions about current news, company background, or public sanctions activity that are NOT in screening data, call web_search — it works in any conversation, not only after a cap-table screen.\n` +
  `Use numbered markdown lists (1. … 2. …) ONLY when the user must pick between 2–5 mutually exclusive paths (e.g. screen now vs. ask a question). The UI renders these as clickable chips. Do NOT add numbered option lists on greetings, acknowledgments, simple factual answers, or when the user already stated what they want. Prefer a short direct reply; if you need clarification, ask one follow-up question in plain prose.\n` +
  `When you call web_search, you MUST include every source URL from the results as a markdown hyperlink [title](url) in your response. Never summarise web results without citing links.\n\n` +
  `CSV ingest: any CSV format is accepted — the system auto-detects cap tables or flat entity lists. Missing required fields block screening.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  workflow?: { id: string; title: string } | null;
};

function parseAssistantMessages(
  value: unknown,
): { ok: true; messages: ChatMessage[] } | { ok: false; detail: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, detail: "'messages' must be a non-empty array" };
  }
  if (value.length > 50) {
    return { ok: false, detail: "Too many messages (max 50)" };
  }

  const out: ChatMessage[] = [];
  for (const m of value) {
    if (typeof m !== "object" || m === null) continue;
    const row = m as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    const content = row.content.trim();
    if (Buffer.byteLength(content, "utf8") > 16 * 1024) {
      return { ok: false, detail: "Message exceeds 16 KB limit" };
    }
    const workflow =
      row.workflow &&
      typeof row.workflow === "object" &&
      row.workflow !== null
        ? (row.workflow as { id: string; title: string })
        : undefined;
    out.push({ role: row.role, content, workflow });
  }

  if (out.length === 0) {
    return { ok: false, detail: "'messages' must contain at least one valid entry" };
  }
  return { ok: true, messages: out };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    let content = m.content;
    if (m.role === "user" && m.workflow?.id) {
      content =
        `[Workflow: ${m.workflow.title} (id: ${m.workflow.id})]\n\n` + content;
    }
    return { role: m.role, content };
  });
}

function parseScreeningResult(value: unknown): ScreeningResult | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ScreeningResult;
  if (!Array.isArray(r.entities) || typeof r.totalEntities !== "number") {
    return null;
  }
  return r;
}

function parseDocumentRef(
  value: unknown,
): { filename: string; document_id: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.filename !== "string" || typeof row.document_id !== "string") {
    return null;
  }
  const filename = row.filename.trim();
  const document_id = row.document_id.trim();
  if (!filename || !document_id) return null;
  return { filename, document_id };
}

function parseDocumentRefs(
  value: unknown,
): Array<{ filename: string; document_id: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map(parseDocumentRef)
    .filter((d): d is { filename: string; document_id: string } => d !== null);
  return out.length > 0 ? out : undefined;
}

assistantChatRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;

  const {
    messages,
    chat_id,
    csvContent,
    screeningResult: screeningBody,
    project_id,
    startup_id,
    displayed_doc,
    attached_documents,
  } = req.body as {
    messages?: unknown;
    chat_id?: string;
    csvContent?: unknown;
    screeningResult?: unknown;
    project_id?: unknown;
    startup_id?: unknown;
    displayed_doc?: unknown;
    attached_documents?: unknown;
  };

  const parsedMessages = parseAssistantMessages(messages);
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

  const chatId = chat_id?.trim() || randomUUID();
  await connectDb();
  const workflowStore = await buildWorkflowStore(userId, userEmail);

  const mentionTokens = extractMentionsFromMessages(validMessages);
  const mentionedStartups = await resolveStartupMentions(mentionTokens, userId);

  const writeProgress = (event: {
    stage: string;
    status: string;
    detail?: string;
    current?: number;
    total?: number;
  }) => {
    write(
      `data: ${JSON.stringify({ type: "screening_progress", ...event })}\n\n`,
    );
  };

  const ctx: ToolContext = {
    csvContent: parsedCsv.content,
    screeningResult: parseScreeningResult(screeningBody),
    mentionedStartups,
    workflowStore,
    onWorkflowApplied: undefined,
    userId,
    userEmail,
    startupId:
      (typeof startup_id === "string" && startup_id.trim()) ||
      (typeof project_id === "string" && project_id.trim()) ||
      (mentionedStartups.length === 1 ? mentionedStartups[0].id : undefined),
    onScreeningProgress: writeProgress,
    attachedDocuments: parseDocumentRefs(attached_documents),
    displayedDocument: parseDocumentRef(displayed_doc) ?? undefined,
  };

  let system = buildSystemPrompt(BASE_SYSTEM, ctx, assistantRegistry);

  const lastUser = [...validMessages].reverse().find((m) => m.role === "user");
  if (lastUser?.workflow?.id) {
    system += `\n\nThe user's latest message selected workflow "${lastUser.workflow.title}" (id: ${lastUser.workflow.id}). Call read_workflow with that id immediately — do not ask which workflow to run.`;

    if (ctx.startupId) {
      const assets = await loadProjectAssets(ctx.startupId, userId);
      const startup = (await Startup.findOne({
        _id: ctx.startupId,
        ownerId: userId,
      })
        .select("name")
        .lean()) as { name?: string } | null;
      if (assets && startup?.name) {
        system += `\n\n${formatProjectAssetsForPrompt(startup.name, assets)}`;
      }
    } else if (!ctx.csvContent && !ctx.screeningResult) {
      system +=
        `\n\nNo project workspace is active. If the workflow needs data, call list_mentioned_startups or ask the user to @-mention a project with existing CSVs/screening — do not immediately demand a new upload if they may already have data in the platform.`;
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (line: string) => res.write(line);
  write(`data: ${JSON.stringify({ type: "chat_id", chatId })}\n\n`);

  ctx.onWorkflowApplied = (workflowId, title) => {
    write(
      `data: ${JSON.stringify({
        type: "workflow_applied",
        workflow_id: workflowId,
        title,
      })}\n\n`,
    );
  };

  try {
    await runAgentStream({
      model: getAnthropicModel(),
      systemPrompt: system,
      messages: toAnthropicMessages(validMessages),
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
    console.error("[assistantChat] error:", err);
    let message = err instanceof Error ? err.message : "Stream error";
    if (message.includes("authentication_error") || message.includes("401")) {
      message =
        "Anthropic API key invalid. Set ANTHROPIC_API_KEY in backend/.env, then restart (pnpm dev).";
    }
    write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

// Minimal chat create for sidebar history in preview mode
assistantChatRouter.post("/create", (_req, res) => {
  res.json({ id: randomUUID() });
});
