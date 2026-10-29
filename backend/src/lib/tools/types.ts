import type { ScreeningResult } from "../screening/runScreening";
import type { ScreeningProgressFn } from "../screening/screeningProgress";
import type { WorkflowPrompt } from "../workflows/workflowMemory";
import type { MentionedStartup } from "../chat/startupMentions";

export type ToolActivity = {
  name: string;
  status: "running" | "done";
  summary?: string;
};

export type ToolDocumentResult = {
  id: string;
  startupId: string;
  kind: "ic_memo" | "screening_analysis" | "custom";
  title: string;
  downloadUrl: string;
};

export type PlanStep = {
  title: string;
  status: "pending" | "in_progress" | "done";
};

export type ToolExecutorResult = {
  content: string;
  screeningResult?: ScreeningResult;
  document?: ToolDocumentResult;
};

export type ToolContext = {
  csvContent: string | null;
  screeningResult: ScreeningResult | null;
  startupId?: string | null;
  userId?: string;
  userEmail?: string;
  mentionedStartups?: MentionedStartup[];
  workflowStore?: Map<string, WorkflowPrompt>;
  onWorkflowApplied?: (workflowId: string, title: string) => void;
  onScreeningProgress?: ScreeningProgressFn;
  /** Called when the agent writes or updates its step-by-step plan. */
  onPlanUpdated?: (steps: PlanStep[]) => void;
  attachedDocuments?: Array<{ filename: string; document_id: string }>;
  displayedDocument?: { filename: string; document_id: string };
};
