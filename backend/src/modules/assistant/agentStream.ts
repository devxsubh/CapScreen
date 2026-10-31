import type { Response } from "express";
import { openEventStream } from "../../http/eventStream";
import type { AgentDeps, AgentResult } from "../../lib/agent/agentGraph";
import { sseEvent } from "../../lib/agent/types";
import { friendlyLlmError } from "../../lib/llm/friendlyError";
import { assistantRegistry, type ToolContext } from "../../lib/tools";

export type PausedRun = Extract<AgentResult, { status: "needs_approval" }>;

export type AgentTurn = {
  chatId: string;
  ctx: ToolContext;
  /** Pause before sensitive tools (e.g. web search) and ask the user. */
  askBeforeSensitiveTools?: boolean;
  maxTokens?: number;
  /** Called when the run pauses for approval, before the client hears about it. */
  onPaused?: (run: PausedRun) => void;
};

/**
 * Streams one agent turn as Server-Sent Events: tool progress, screening
 * results, approval requests, the answer text, then `[DONE]`. Shared by the
 * assistant (new message and approval resume) and tabular grid chat.
 */
export async function streamAgentTurn(
  res: Response,
  turn: AgentTurn,
  run: (deps: AgentDeps, signal: AbortSignal) => Promise<AgentResult>,
): Promise<void> {
  const { ctx } = turn;
  const stream = openEventStream(res);
  stream.write(sseEvent("chat_id", { chatId: turn.chatId }));

  ctx.onScreeningProgress = (event) => stream.write(sseEvent("screening_progress", event));
  ctx.onWorkflowApplied = (workflowId, title) =>
    stream.write(sseEvent("workflow_applied", { workflow_id: workflowId, title }));
  ctx.onPlanUpdated = (steps) => stream.write(sseEvent("plan_updated", { steps }));

  const deps: AgentDeps = {
    registry: assistantRegistry,
    write: stream.write,
    ...(turn.maxTokens ? { maxTokens: turn.maxTokens } : {}),
    askBeforeSensitiveTools: turn.askBeforeSensitiveTools ?? false,
    executeTool: async (name, input) => {
      const toolResult = await assistantRegistry.execute(name, input, ctx);
      if (toolResult.screeningResult) {
        ctx.screeningResult = toolResult.screeningResult;
        stream.write(sseEvent("screening_result", { screeningResult: toolResult.screeningResult }));
      }
      return { content: toolResult.content, document: toolResult.document };
    },
  };

  try {
    const result = await run(deps, stream.signal);
    if (result.status === "needs_approval") {
      turn.onPaused?.(result);
      stream.write(sseEvent("approval_required", { runId: result.runId, calls: result.request.calls }));
    }
    if (ctx.screeningResult) {
      stream.write(sseEvent("final_result", { screeningResult: ctx.screeningResult }));
    }
  } catch (err) {
    console.error("[agent] turn failed:", err);
    stream.write(sseEvent("error", { message: friendlyLlmError(err) }));
  } finally {
    stream.done();
    stream.end();
  }
}
