import { isWaitingForApproval, type ApprovalRequest } from "../../lib/agent/agentGraph";
import type { ToolContext } from "../../lib/tools";

/** The parts of ToolContext that are plain data, kept so a paused turn can be resumed. */
export type SavedContext = Pick<
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
export type WaitingRun = {
  userId: string;
  chatId: string;
  context: SavedContext;
  request: ApprovalRequest;
};

const waitingRuns = new Map<string, WaitingRun>();

export function saveContext(ctx: ToolContext): SavedContext {
  return {
    csvContent: ctx.csvContent,
    screeningResult: ctx.screeningResult,
    startupId: ctx.startupId,
    mentionedStartups: ctx.mentionedStartups,
    attachedDocuments: ctx.attachedDocuments,
    displayedDocument: ctx.displayedDocument,
  };
}

export function rememberWaitingRun(runId: string, run: WaitingRun): void {
  // Drop entries the graph has already forgotten (expired after 24 h).
  for (const id of waitingRuns.keys()) {
    if (!isWaitingForApproval(id)) waitingRuns.delete(id);
  }
  waitingRuns.set(runId, run);
}

/** Returns the run and removes it, so the same request can't be answered twice. */
export function takeWaitingRun(runId: string, userId: string): WaitingRun | null {
  const run = waitingRuns.get(runId);
  if (!run || run.userId !== userId || !isWaitingForApproval(runId)) return null;
  waitingRuns.delete(runId);
  return run;
}
