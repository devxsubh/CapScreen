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

// ── Agent tools (POST /chat and tabular review chat) ─────────────────────────
// Adding a capability: add one import above + one .register() here.
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
