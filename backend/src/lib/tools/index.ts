import { ToolRegistry } from "./registry";
import { screenCapTableTool } from "./screenCapTable";
import { listWorkflowsTool, readWorkflowTool } from "./workflowTools";
import { listMentionedStartupsTool } from "./mentionTools";
import { queryScreeningDataTool } from "./queryScreeningData";
import { generateDocumentTool } from "./generateDocumentTool";
import {
  searchCompliancePlaybookTool,
  listStartupDocumentsTool,
  searchStartupDocumentsTool,
  screenDocumentEntitiesTool,
} from "./searchTools";
import { webSearchTool } from "./webSearchTool";
import { updatePlanTool } from "./planTool";
import { delegateTaskTool } from "./delegateTool";

export { ToolRegistry } from "./registry";
export type { ToolDefinition } from "./registry";
export type {
  ToolContext,
  ToolExecutorResult,
  ToolDocumentResult,
  ToolActivity,
  PlanStep,
} from "./types";
export { SCREEN_CAP_TABLE_TOOL_NAME } from "./screenCapTable";

// ── Screener registry (POST /api/chat) ───────────────────────────────────────
// No workflow tools — workflowStore is never populated in the screener route.
// Adding a new screener capability: add one import above + one .register() here.
export const screenerRegistry = new ToolRegistry()
  .register(screenCapTableTool)
  .register(listMentionedStartupsTool)
  .register(queryScreeningDataTool)
  .register(generateDocumentTool)
  .register(searchCompliancePlaybookTool)
  .register(listStartupDocumentsTool)
  .register(searchStartupDocumentsTool)
  .register(screenDocumentEntitiesTool)
  .register(webSearchTool);

// ── Assistant registry (POST /api/assistant-chat) ────────────────────────────
// Superset of screenerRegistry — adds workflow tools, planning and sub-agents.
export const assistantRegistry = new ToolRegistry()
  .register(updatePlanTool)
  .register(delegateTaskTool)
  .register(listWorkflowsTool)
  .register(readWorkflowTool)
  .register(screenCapTableTool)
  .register(listMentionedStartupsTool)
  .register(queryScreeningDataTool)
  .register(generateDocumentTool)
  .register(searchCompliancePlaybookTool)
  .register(listStartupDocumentsTool)
  .register(searchStartupDocumentsTool)
  .register(screenDocumentEntitiesTool)
  .register(webSearchTool);

// Legacy alias — kept so chatTools.ts shim doesn't break any residual imports.
export const appToolRegistry = assistantRegistry;
