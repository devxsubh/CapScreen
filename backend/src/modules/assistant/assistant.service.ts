import { randomUUID } from "crypto";
import type { Response } from "express";
import type { CurrentUser } from "../../http/currentUser";
import { badRequest, notFound } from "../../http/httpError";
import { resumeAgent, runAgent } from "../../lib/agent/agentGraph";
import { buildSystemPrompt } from "../../lib/chat/buildSystemPrompt";
import { formatProjectAssetsForPrompt, loadProjectAssets } from "../../lib/chat/projectAssets";
import { extractMentionsFromMessages, resolveStartupMentions } from "../../lib/chat/startupMentions";
import { validateCsvContent } from "../../lib/chat/validateChatPayload";
import type { LlmToolChoice } from "../../lib/llm/providers";
import { isValidStartupObjectId } from "../../lib/shared/startupId";
import { assistantRegistry, SCREEN_CAP_TABLE_TOOL_NAME, type ToolContext } from "../../lib/tools";
import { buildWorkflowStore } from "../workflows/workflows.service";
import { recordAuditEvent } from "../auditLogs/auditLogs.service";
import * as startupsRepository from "../startups/startups.repository";
import { streamAgentTurn, type AgentTurn } from "./agentStream";
import { rememberWaitingRun, saveContext, takeWaitingRun } from "./approvals";
import {
  ASSISTANT_SYSTEM_PROMPT,
  focusInstruction,
  NO_WORKSPACE_INSTRUCTION,
  workflowInstruction,
} from "./assistant.prompts";
import {
  parseDocumentRef,
  parseDocumentRefs,
  parseScreeningResult,
  toLlmMessages,
  type ChatMessage,
} from "./assistant.validation";

export type AssistantTurnInput = {
  messages: ChatMessage[];
  chatId?: string;
  csvContent?: unknown;
  screeningResult?: unknown;
  startupId?: string;
  attachedDocuments?: unknown;
  displayedDocument?: unknown;
};

const ASSISTANT_MAX_TOKENS = 8192;

/** Runs one assistant turn and streams it to `res`. */
export async function streamNewTurn(res: Response, input: AssistantTurnInput, user: CurrentUser): Promise<void> {
  const csv = validateCsvContent(input.csvContent);
  if (!csv.ok) throw badRequest(csv.detail);

  const mentionedStartups = await resolveStartupMentions(extractMentionsFromMessages(input.messages), user.userId);
  const ctx: ToolContext = {
    csvContent: csv.content,
    screeningResult: parseScreeningResult(input.screeningResult),
    mentionedStartups,
    workflowStore: await buildWorkflowStore(user.userId),
    userId: user.userId,
    userEmail: user.userEmail,
    startupId: input.startupId || (mentionedStartups.length === 1 ? mentionedStartups[0].id : undefined),
    attachedDocuments: parseDocumentRefs(input.attachedDocuments),
    displayedDocument: parseDocumentRef(input.displayedDocument) ?? undefined,
  };

  const systemPrompt = await buildAssistantPrompt(ctx, input.messages, user.userId);

  // Force screen_cap_table on the first turn when a CSV is attached and no
  // prior result exists — small models don't route this case reliably
  // (backend/docs/tool-routing-analysis.md).
  const toolChoice: LlmToolChoice | undefined =
    ctx.csvContent && !ctx.screeningResult ? { type: "tool", name: SCREEN_CAP_TABLE_TOOL_NAME } : undefined;

  const chatId = input.chatId || randomUUID();
  await streamAgentTurn(res, assistantTurn(user, chatId, ctx), (deps, signal) =>
    runAgent({ systemPrompt, messages: toLlmMessages(input.messages) }, { ...deps, toolChoice }, signal),
  );
}

/**
 * Continues a turn that paused to ask before running a sensitive tool
 * (e.g. web search), and records the decision in the audit log.
 */
export async function streamResumedTurn(
  res: Response,
  runId: string,
  approved: boolean,
  user: CurrentUser,
): Promise<void> {
  const run = takeWaitingRun(runId, user.userId);
  if (!run) throw notFound("This request expired or was already answered.");

  const ctx: ToolContext = {
    ...run.context,
    userId: user.userId,
    userEmail: user.userEmail,
    workflowStore: await buildWorkflowStore(user.userId),
  };

  // Compliance record: who allowed (or blocked) which tool, with what input.
  await recordAuditEvent(user, "agent_tool_approval", isValidStartupObjectId(ctx.startupId) ? ctx.startupId! : null, {
    approved,
    tools: run.request.calls.map((c) => c.name),
    inputs: run.request.calls.map((c) => c.input),
  }).catch(() => {});

  await streamAgentTurn(res, assistantTurn(user, run.chatId, ctx), (deps, signal) =>
    resumeAgent(runId, approved, deps, signal),
  );
}

function assistantTurn(user: CurrentUser, chatId: string, ctx: ToolContext): AgentTurn {
  return {
    chatId,
    ctx,
    maxTokens: ASSISTANT_MAX_TOKENS,
    askBeforeSensitiveTools: true,
    onPaused: (paused) =>
      rememberWaitingRun(paused.runId, {
        userId: user.userId,
        chatId,
        context: saveContext(ctx),
        request: paused.request,
      }),
  };
}

/** Base prompt + tool/mention context, plus what the latest message asked for (focus, workflow). */
async function buildAssistantPrompt(ctx: ToolContext, messages: ChatMessage[], userId: string): Promise<string> {
  let system = buildSystemPrompt(ASSISTANT_SYSTEM_PROMPT, ctx, assistantRegistry);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser?.focus) system += focusInstruction(lastUser.focus);
  if (!lastUser?.workflow?.id) return system;

  system += workflowInstruction(lastUser.workflow);
  if (ctx.startupId) {
    const [assets, startup] = await Promise.all([
      loadProjectAssets(ctx.startupId, userId),
      startupsRepository.findOwned(ctx.startupId, userId),
    ]);
    if (assets && typeof startup?.name === "string" && startup.name) {
      system += `\n\n${formatProjectAssetsForPrompt(startup.name, assets)}`;
    }
  } else if (!ctx.csvContent && !ctx.screeningResult) {
    system += NO_WORKSPACE_INSTRUCTION;
  }
  return system;
}
