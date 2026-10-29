import type { ToolDefinition } from "./registry";

export const listWorkflowsTool: ToolDefinition = {
  name: "list_workflows",
  readOnly: true,
  schema: {
    name: "list_workflows",
    description:
      "List available assistant workflows (id and title). Use when the user asks what workflows exist.",
    input_schema: { type: "object", properties: {} },
  },
  handler: async (_input, ctx) => {
    const store = ctx.workflowStore;
    if (!store || store.size === 0) {
      return { content: "No workflows available." };
    }
    const lines = [...store.values()].map((wf) => `- ${wf.title} (id: ${wf.id})`);
    return { content: lines.join("\n") };
  },
};

export const readWorkflowTool: ToolDefinition = {
  name: "read_workflow",
  readOnly: true,
  schema: {
    name: "read_workflow",
    description:
      "Read the full instructions (prompt) of a workflow by its ID. Call this when the user selects a workflow or asks to apply one.",
    input_schema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Workflow id from list_workflows or the user's selection",
        },
      },
      required: ["workflow_id"],
    },
  },
  handler: async (input, ctx) => {
    const args = input as { workflow_id?: string };
    const wfId = args.workflow_id?.trim();
    if (!wfId) return { content: "Error: workflow_id is required." };
    const wf = ctx.workflowStore?.get(wfId);
    if (!wf) {
      return { content: `Workflow "${wfId}" not found. Call list_workflows first.` };
    }
    ctx.onWorkflowApplied?.(wf.id, wf.title);
    return { content: `# Workflow: ${wf.title}\n\n${wf.prompt_md}` };
  },
  routingHint: `### Workflow tools (list_workflows → read_workflow)
When a user message selects a workflow, call read_workflow with that workflow's id immediately before other tools.
To discover available workflows, call list_workflows first.`,
};
