import { randomUUID } from "crypto";
import express from "express";
import type { LlmMessage, LlmToolChoice } from "../lib/llm/providers";
import {
  assistantRegistry,
  SCREEN_CAP_TABLE_TOOL_NAME,
  type ToolContext,
} from "../lib/tools";
import { buildSystemPrompt } from "../lib/chat/buildSystemPrompt";
import {
  isWaitingForApproval,
  resumeAgent,
  runAgent,
  type AgentDeps,
  type AgentResult,
  type ApprovalRequest,
} from "../lib/agent/agentGraph";
import { sseEvent } from "../lib/agent/types";
import { isValidStartupObjectId } from "../lib/shared/startupId";
import { friendlyLlmError } from "../lib/llm/friendlyError";
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
import { AuditLog, Startup } from "../models";

export const assistantChatRouter = express.Router();

const BASE_SYSTEM =
  `You are CapScreen's compliance assistant for venture capital teams. ` +
  `You help users screen cap-table CSVs and uploaded documents against Watchman sanctions lists, interpret results, answer questions about document content, and follow structured workflows.\n\n` +
  `When a user message includes a workflow selection, immediately call read_workflow with that workflow's id before other tools, then follow the workflow instructions.\n\n` +
  `When the user @-mentions a startup (e.g. @AcmeAI), their saved screening is injected into the system prompt — use list_mentioned_startups and pass startup_id to tools for portfolio questions.\n\n` +
  `After screen_cap_table completes, reply in 2–4 sentences with aggregate counts only (flagged / review / clear). ` +
  `Do NOT list individual entities, match scores, or ownership chains in chat — the UI opens an interactive side panel with the ownership graph and entity risk table. ` +
  `Use query_screening_data only when the user asks about a specific entity.\n\n` +
  `Be concise and professional. Recommend human expert verification for final decisions. Never conclude guilt or confirm sanctions violations.\n` +
  `Never invent match scores, entity names, or screening data — always call a tool to look up facts.\n` +
  `For questions about current news, company background, or public sanctions activity that are NOT in screening data, call web_search — it works in any conversation, not only after a cap-table screen.\n` +
  `Use numbered markdown lists (1. … 2. …) ONLY when the user must pick between 2–5 mutually exclusive paths (e.g. screen now vs. ask a question). The UI renders these as clickable chips. Do NOT add numbered option lists on greetings, acknowledgments, simple factual answers, or when the user already stated what they want. Prefer a short direct reply; if you need clarification, ask one follow-up question in plain prose.\n` +
  `When you call web_search, you MUST include every source URL from the results as a markdown hyperlink [title](url) in your response. Never summarise web results without citing links.\n\n` +
  `CSV ingest: any CSV format is accepted — the system auto-detects cap tables or flat entity lists. Missing required fields block screening.`;

/** Capability picked in the composer's Tools menu (frontend lib/chatFocus.ts). */
const FOCUS_INSTRUCTIONS = {
  screen:
    "Run a sanctions screen: call screen_cap_table on the attached or mentioned cap table, then summarise totals and counts by risk tier (flagged / review / clear).",
  review:
    "Concentrate on flagged and review entities: for each, explain the match, its ownership path and what a human reviewer should verify. Do not decide guilt.",
  ownership:
    "Trace ownership chains through SPVs, trusts and offshore holdings to the ultimate beneficial owners, and apply the OFAC 50% and beneficial-owner thresholds.",
  research:
    "Use web_search for current public information (adverse media, sanctions announcements, company background) and cite every source as a markdown link.",
  memo:
    "Produce a document with generate_document (IC compliance memo or AML summary) from the screening results, with review items and next steps.",
} as const;
type ChatFocus = keyof typeof FOCUS_INSTRUCTIONS;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  workflow?: { id: string; title: string } | null;
  focus?: ChatFocus;
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
    const focus =
      typeof row.focus === "string" && row.focus in FOCUS_INSTRUCTIONS ? (row.focus as ChatFocus) : undefined;
    out.push({ role: row.role, content, workflow, focus });
  }

  if (out.length === 0) {
    return { ok: false, detail: "'messages' must contain at least one valid entry" };
  }
  return { ok: true, messages: out };
}

function toLlmMessages(messages: ChatMessage[]): LlmMessage[] {
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
  const workflowStore = await buildWorkflowStore(userId);

  const mentionTokens = extractMentionsFromMessages(validMessages);
  const mentionedStartups = await resolveStartupMentions(mentionTokens, userId);

  const ctx: ToolContext = {
    csvContent: parsedCsv.content,
    screeningResult: parseScreeningResult(screeningBody),
    mentionedStartups,
    workflowStore,
    userId,
    userEmail,
    startupId:
      (typeof startup_id === "string" && startup_id.trim()) ||
      (typeof project_id === "string" && project_id.trim()) ||
      (mentionedStartups.length === 1 ? mentionedStartups[0].id : undefined),
    attachedDocuments: parseDocumentRefs(attached_documents),
    displayedDocument: parseDocumentRef(displayed_doc) ?? undefined,
  };

  let system = buildSystemPrompt(BASE_SYSTEM, ctx, assistantRegistry);

  const lastUser = [...validMessages].reverse().find((m) => m.role === "user");
  if (lastUser?.focus) {
    system += `\n\nThe user chose a focus for this message. ${FOCUS_INSTRUCTIONS[lastUser.focus]}`;
  }
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

  // Force screen_cap_table on the first turn when a CSV is attached and no
  // prior result exists — small models don't route this case reliably
  // (backend/docs/tool-routing-analysis.md).
  const toolChoice: LlmToolChoice | undefined =
    ctx.csvContent && !ctx.screeningResult
      ? { type: "tool", name: SCREEN_CAP_TABLE_TOOL_NAME }
      : undefined;

  await streamAssistantTurn(res, { userId, chatId, ctx }, (deps, signal) =>
    runAgent(
      { systemPrompt: system, messages: toLlmMessages(validMessages) },
      { ...deps, toolChoice },
      signal,
    ),
  );
});

// ── Approvals ────────────────────────────────────────────────────────────────

/** The parts of ToolContext that are plain data, kept so a paused turn can be resumed. */
type SavedContext = Pick<
  ToolContext,
  | "csvContent"
  | "screeningResult"
  | "startupId"
  | "mentionedStartups"
  | "attachedDocuments"
  | "displayedDocument"
>;

/**
 * Turns paused by the agent graph, waiting for the user's Allow / Deny.
 * The graph keeps the conversation; this keeps who the run belongs to and
 * the tool context as it was at the moment it paused.
 */
type WaitingRun = {
  userId: string;
  chatId: string;
  context: SavedContext;
  request: ApprovalRequest;
};
const waitingRuns = new Map<string, WaitingRun>();

function rememberWaitingRun(runId: string, run: WaitingRun): void {
  // Drop entries the graph has already forgotten (expired after 24 h).
  for (const id of waitingRuns.keys()) {
    if (!isWaitingForApproval(id)) waitingRuns.delete(id);
  }
  waitingRuns.set(runId, run);
}

/** Returns the run and removes it, so the same request can't be answered twice. */
function takeWaitingRun(runId: string, userId: string): WaitingRun | null {
  const run = waitingRuns.get(runId);
  if (!run || run.userId !== userId || !isWaitingForApproval(runId)) return null;
  waitingRuns.delete(runId);
  return run;
}

/**
 * Continues a turn that paused to ask before running a sensitive tool
 * (e.g. web search). Body: { approved: boolean }. Streams the rest of the
 * answer exactly like POST /.
 */
assistantChatRouter.post("/runs/:runId/resume", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;
  const { runId } = req.params;
  const { approved } = req.body as { approved?: unknown };

  if (typeof approved !== "boolean") {
    res.status(400).json({ detail: "'approved' must be true or false" });
    return;
  }

  const run = takeWaitingRun(runId, userId);
  if (!run) {
    res.status(404).json({ detail: "This request expired or was already answered." });
    return;
  }

  await connectDb();
  const ctx: ToolContext = {
    ...run.context,
    userId,
    userEmail,
    workflowStore: await buildWorkflowStore(userId),
  };

  // Compliance record: who allowed (or blocked) which tool, with what input.
  await AuditLog.create({
    startupId: isValidStartupObjectId(ctx.startupId) ? ctx.startupId : null,
    eventType: "agent_tool_approval",
    performedBy: userId,
    performedByEmail: userEmail,
    details: {
      approved,
      tools: run.request.calls.map((c) => c.name),
      inputs: run.request.calls.map((c) => c.input),
    },
  }).catch(() => {});

  await streamAssistantTurn(res, { userId, chatId: run.chatId, ctx }, (deps, signal) =>
    resumeAgent(runId, approved, deps, signal),
  );
});

// ── Streaming ────────────────────────────────────────────────────────────────

/**
 * Streams one assistant turn as Server-Sent Events. Shared by a new message
 * and by an approval resume: sets up the stream, connects tool callbacks to
 * it, runs the agent, and remembers the run if it pauses to ask the user.
 */
async function streamAssistantTurn(
  res: express.Response,
  turn: { userId: string; chatId: string; ctx: ToolContext },
  run: (deps: AgentDeps, signal: AbortSignal) => Promise<AgentResult>,
): Promise<void> {
  const { ctx } = turn;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (line: string) => res.write(line);
  write(sseEvent("chat_id", { chatId: turn.chatId }));

  ctx.onScreeningProgress = (event) => write(sseEvent("screening_progress", event));
  ctx.onWorkflowApplied = (workflowId, title) =>
    write(sseEvent("workflow_applied", { workflow_id: workflowId, title }));
  ctx.onPlanUpdated = (steps) => write(sseEvent("plan_updated", { steps }));

  // Stop the agent if the user leaves or hits Stop.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  const deps: AgentDeps = {
    registry: assistantRegistry,
    write,
    maxTokens: 8192,
    askBeforeSensitiveTools: true,
    executeTool: async (name, input) => {
      const toolResult = await assistantRegistry.execute(name, input, ctx);
      if (toolResult.screeningResult) {
        ctx.screeningResult = toolResult.screeningResult;
        write(sseEvent("screening_result", { screeningResult: toolResult.screeningResult }));
      }
      return { content: toolResult.content, document: toolResult.document };
    },
  };

  try {
    const result = await run(deps, abort.signal);

    if (result.status === "needs_approval") {
      rememberWaitingRun(result.runId, {
        userId: turn.userId,
        chatId: turn.chatId,
        context: {
          csvContent: ctx.csvContent,
          screeningResult: ctx.screeningResult,
          startupId: ctx.startupId,
          mentionedStartups: ctx.mentionedStartups,
          attachedDocuments: ctx.attachedDocuments,
          displayedDocument: ctx.displayedDocument,
        },
        request: result.request,
      });
      write(sseEvent("approval_required", { runId: result.runId, calls: result.request.calls }));
    }

    if (ctx.screeningResult) {
      write(sseEvent("final_result", { screeningResult: ctx.screeningResult }));
    }
    write("data: [DONE]\n\n");
  } catch (err) {
    console.error("[assistantChat] error:", err);
    write(sseEvent("error", { message: friendlyLlmError(err) }));
    write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
}

// Minimal chat create for sidebar history in preview mode
assistantChatRouter.post("/create", (_req, res) => {
  res.json({ id: randomUUID() });
});
