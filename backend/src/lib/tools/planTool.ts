import type { ToolDefinition } from "./registry";
import type { PlanStep } from "./types";

const STATUSES = new Set<PlanStep["status"]>(["pending", "in_progress", "done"]);

/**
 * Lets the agent show its plan as a live checklist for multi-step jobs
 * (e.g. "screen, check the flagged names, draft the IC memo"). The agent
 * sends the whole list each time; the UI replaces the previous one.
 */
export const updatePlanTool: ToolDefinition = {
  name: "update_plan",
  readOnly: true,
  schema: {
    name: "update_plan",
    description:
      "Show the user your step-by-step plan for a task with 3 or more steps, then update it as you go. " +
      "Send the full list every time, with each step's status. Skip this for simple questions.",
    input_schema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "All steps in order.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short step description" },
              status: { type: "string", enum: ["pending", "in_progress", "done"] },
            },
            required: ["title", "status"],
          },
        },
      },
      required: ["steps"],
    },
  },
  handler: async (input, ctx) => {
    const raw = (input as { steps?: unknown }).steps;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { content: "Error: steps must be a non-empty array." };
    }
    const steps: PlanStep[] = raw
      .filter((s): s is PlanStep => typeof s?.title === "string" && STATUSES.has(s?.status))
      .slice(0, 12);
    ctx.onPlanUpdated?.(steps);
    const done = steps.filter((s) => s.status === "done").length;
    return { content: `Plan updated (${done}/${steps.length} done). Continue with the next step.` };
  },
  routingHint: `### update_plan
Use for jobs with 3+ steps (e.g. running a workflow). Post the plan before starting, then mark steps in_progress / done as you go.`,
};
