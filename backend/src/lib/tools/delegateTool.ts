import { runSubAgent } from "../agent/agentGraph";
import { ToolRegistry, type ToolDefinition } from "./registry";
import { listMentionedStartupsTool } from "./mentionTools";
import { queryScreeningDataTool } from "./queryScreeningData";
import {
  listStartupDocumentsTool,
  searchCompliancePlaybookTool,
  searchStartupDocumentsTool,
} from "./searchTools";

/**
 * Sub-agents run the same LangGraph agent (compiled without a checkpointer)
 * with read-only tools only: they can look things up but can't screen,
 * write documents, or send anything off the machine.
 */
const subAgentTools = new ToolRegistry()
  .register(queryScreeningDataTool)
  .register(listMentionedStartupsTool)
  .register(searchCompliancePlaybookTool)
  .register(listStartupDocumentsTool)
  .register(searchStartupDocumentsTool);

const SUB_AGENT_PROMPT =
  "You are a research sub-agent inside CapScreen, a sanctions screening tool for venture capital teams. " +
  "You get one focused task from the main assistant. Use your tools to find the facts, then reply with a short, " +
  "factual summary of what you found and which tool or document each fact came from. " +
  "Never invent entities, scores or matches. Never conclude guilt or confirm a sanctions violation. " +
  "If you could not find something, say so plainly.";

/**
 * Hands a focused research task to a sub-agent and returns its findings.
 * Useful for splitting a big job: the model can call this several times in
 * one turn (e.g. one per flagged entity) and the calls run in parallel.
 */
export const delegateTaskTool: ToolDefinition = {
  name: "delegate_task",
  readOnly: true,
  schema: {
    name: "delegate_task",
    description:
      "Give a focused, read-only research task to a sub-agent and get back its findings. " +
      "Call it several times in one turn to research independent things in parallel " +
      "(e.g. one call per flagged entity, or policy lookup + document search at the same time). " +
      "Sub-agents can query screening data, search the compliance playbook and search startup documents. " +
      "They cannot screen, generate documents or search the web.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to find out, written so it makes sense without the chat history.",
        },
        context: {
          type: "string",
          description: "Optional facts the sub-agent needs, e.g. startup_id or document ids.",
        },
      },
      required: ["task"],
    },
  },
  handler: async (input, ctx) => {
    const { task, context } = input as { task?: string; context?: string };
    if (!task?.trim()) return { content: "Error: task is required." };

    const brief = context?.trim() ? `${task.trim()}\n\nContext:\n${context.trim()}` : task.trim();
    const result = await runSubAgent(
      { systemPrompt: SUB_AGENT_PROMPT, messages: [{ role: "user", content: brief }], maxRounds: 5 },
      {
        registry: subAgentTools,
        executeTool: (name, toolInput) => subAgentTools.execute(name, toolInput, ctx),
        write: () => {}, // works silently; only the final answer goes back to the main agent
      },
    );

    const used = result.toolActivity.map((a) => a.name).join(", ") || "none";
    return { content: `Sub-agent findings (tools used: ${used}):\n\n${result.answer.trim()}` };
  },
  routingHint: `### delegate_task
For jobs with several independent lookups (e.g. investigate each flagged entity, or check policy and documents together), call delegate_task once per lookup in the same turn so they run in parallel. Then combine the findings in your answer.`,
};
