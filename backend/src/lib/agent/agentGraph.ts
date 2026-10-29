/**
 * The assistant's agent, built as a LangGraph state graph.
 *
 *            ┌─────────────┐  no tools   ┌─────┐
 *   START ──▶│  callModel  │────────────▶│ END │
 *            └─────────────┘             └─────┘
 *              │ tools   ▲                   ▲
 *              │         │ under limit       │
 *              ▼         │                   │
 *   ┌─────────────┐   ┌──────────┐  limit  ┌──────────────────┐
 *   │ askApproval │──▶│ runTools │────────▶│ stopAtRoundLimit │
 *   └─────────────┘   └──────────┘         └──────────────────┘
 *     (only if a tool needs the user's OK)
 *
 * - `askApproval` calls LangGraph's `interrupt()`. The graph stops, the
 *   checkpointer keeps its state, and `resumeAgent` continues it with the
 *   user's answer via `Command({ resume })`.
 * - Per-run dependencies (tools, SSE writer, model role) are passed as
 *   LangGraph runtime context, so they are never saved in a checkpoint.
 * - We call models through our own provider layer (lib/llm/providers), so
 *   local models, BYO keys and local-only mode keep working.
 */
import {
  Annotation,
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isInterrupted,
  type Runtime,
} from "@langchain/langgraph";
import { randomUUID } from "crypto";
import {
  getLlm,
  type LlmMessage,
  type LlmResponse,
  type LlmRole,
  type LlmToolChoice,
  type LlmToolUseBlock,
} from "../llm/providers";
import type { ToolRegistry } from "../tools/registry";
import type { ToolActivity } from "../tools/types";
import { runTools } from "./runTools";
import { sseEvent, type ExecuteTool, type SseWrite } from "./types";

const NO_TOOLS_NOTE =
  "\n\n## Tool access\nThe configured model does not support tool calling. Answer only from the context in this prompt, " +
  "say plainly when data you would normally look up is unavailable, and never invent entities, scores, or matches.";

const ROUND_LIMIT_TEXT = "I hit the tool-call limit for this turn. Please try a simpler question.";

// ── State ────────────────────────────────────────────────────────────────────

const AgentState = Annotation.Root({
  systemPrompt: Annotation<string>,
  maxRounds: Annotation<number>,
  /** The conversation. Each node appends to it. */
  messages: Annotation<LlmMessage[]>({
    reducer: (current, added) => current.concat(added),
    default: () => [],
  }),
  /** Tool calls from the model's latest reply that haven't run yet. */
  pendingCalls: Annotation<LlmToolUseBlock[]>,
  /** True when one of the pending calls needs the user's OK first. */
  needsApproval: Annotation<boolean>,
  /** Pending calls the user declined. */
  declinedIds: Annotation<string[]>,
  rounds: Annotation<number>,
  /** Everything the model has written to the user this run. */
  answer: Annotation<string>({ reducer: (current, added) => current + added, default: () => "" }),
  toolActivity: Annotation<ToolActivity[]>({
    reducer: (current, added) => current.concat(added),
    default: () => [],
  }),
});

type State = typeof AgentState.State;

/** Per-run dependencies, passed as LangGraph runtime context (never checkpointed). */
const AgentContext = Annotation.Root({
  registry: Annotation<ToolRegistry>,
  executeTool: Annotation<ExecuteTool>,
  write: Annotation<SseWrite>,
  role: Annotation<LlmRole>,
  maxTokens: Annotation<number>,
  /** Force a specific tool on the first round only. */
  toolChoice: Annotation<LlmToolChoice | undefined>,
  /** Pause before tools marked `needsApproval`. Off for callers with no approval UI. */
  askBeforeSensitiveTools: Annotation<boolean>,
});

type AgentContextValues = typeof AgentContext.State;
type AgentRuntime = Runtime<AgentContextValues>;

/** What callers pass in. Anything left out gets a default from `withDefaults`. */
export type AgentDeps = Pick<AgentContextValues, "registry" | "executeTool" | "write"> &
  Partial<AgentContextValues>;

function withDefaults(deps: AgentDeps): AgentContextValues {
  return {
    role: "agent",
    maxTokens: 2048,
    toolChoice: undefined,
    askBeforeSensitiveTools: false,
    ...deps,
  };
}

/** What the user sees on the approval card. */
export type ApprovalRequest = { calls: { name: string; input: unknown }[] };
type ApprovalAnswer = { approved: boolean };

// ── Nodes ────────────────────────────────────────────────────────────────────

/** Ask the model what to do next, streaming its text to the client. */
async function callModel(state: State, runtime: AgentRuntime): Promise<Partial<State>> {
  const deps = runtime.context!;
  const llm = getLlm(deps.role);
  const firstRound = (state.rounds ?? 0) === 0;

  let text = "";
  let response: LlmResponse | null = null;
  const announced = new Set<string>();

  for await (const event of llm.provider.stream({
    model: llm.model,
    maxTokens: deps.maxTokens,
    systemPrompt: llm.supportsTools ? state.systemPrompt : state.systemPrompt + NO_TOOLS_NOTE,
    tools: llm.supportsTools ? deps.registry.getTools() : [],
    messages: state.messages,
    ...(firstRound && deps.toolChoice ? { toolChoice: deps.toolChoice } : {}),
  })) {
    if (runtime.signal?.aborted) return { answer: text, pendingCalls: [] };

    if (event.type === "text_delta") {
      text += event.text;
      deps.write(sseEvent("content_delta", { text: event.text }));
    } else if (event.type === "tool_use_start") {
      if (!announced.has(event.name)) {
        announced.add(event.name);
        deps.write(sseEvent("tool_call_start", { name: event.name }));
      }
    } else {
      response = event.response;
    }
  }

  const calls = (response?.content ?? []).filter(
    (b): b is LlmToolUseBlock => b.type === "tool_use",
  );
  if (response?.stopReason !== "tool_use" || calls.length === 0) {
    deps.write(sseEvent("content_done"));
    return { answer: text, pendingCalls: [] };
  }

  return {
    answer: text,
    messages: [{ role: "assistant", content: response.content }],
    pendingCalls: calls,
    needsApproval:
      deps.askBeforeSensitiveTools &&
      calls.some((c) => deps.registry.get(c.name)?.needsApproval),
    declinedIds: [],
    rounds: (state.rounds ?? 0) + 1,
  };
}

/** Pause the graph until the user allows or denies the sensitive tool calls. */
function askApproval(state: State, runtime: AgentRuntime): Partial<State> {
  const sensitive = state.pendingCalls.filter(
    (c) => runtime.context!.registry.get(c.name)?.needsApproval,
  );
  const request: ApprovalRequest = {
    calls: sensitive.map((c) => ({ name: c.name, input: c.input })),
  };
  // First time through this throws and the run stops here. On resume it
  // returns the user's answer and the node finishes normally.
  const answer = interrupt<ApprovalRequest, ApprovalAnswer>(request);
  return { declinedIds: answer.approved ? [] : sensitive.map((c) => c.id) };
}

/** Run the pending tools and add their results to the conversation. */
async function runToolsNode(state: State, runtime: AgentRuntime): Promise<Partial<State>> {
  const { results, activity } = await runTools(state.pendingCalls, {
    ...runtime.context!,
    declinedIds: new Set(state.declinedIds ?? []),
  });
  return {
    messages: [{ role: "user", content: results }],
    toolActivity: activity,
    pendingCalls: [],
    needsApproval: false,
  };
}

/** A model stuck calling tools gets stopped with a short note. */
function stopAtRoundLimit(_state: State, runtime: AgentRuntime): Partial<State> {
  runtime.context!.write(sseEvent("content_delta", { text: ROUND_LIMIT_TEXT }));
  runtime.context!.write(sseEvent("content_done"));
  return { answer: ROUND_LIMIT_TEXT };
}

// ── Routing (plain functions of the state) ───────────────────────────────────

function afterModel(state: State) {
  if (state.pendingCalls.length === 0) return END;
  return state.needsApproval ? "askApproval" : "runTools";
}

function afterTools(state: State) {
  return state.rounds >= state.maxRounds ? "stopAtRoundLimit" : "callModel";
}

// ── Graph ────────────────────────────────────────────────────────────────────

const graphBuilder = new StateGraph(AgentState, AgentContext)
  .addNode("callModel", callModel)
  .addNode("askApproval", askApproval)
  .addNode("runTools", runToolsNode)
  .addNode("stopAtRoundLimit", stopAtRoundLimit)
  .addEdge(START, "callModel")
  .addConditionalEdges("callModel", afterModel, ["askApproval", "runTools", END])
  .addEdge("askApproval", "runTools")
  .addConditionalEdges("runTools", afterTools, ["callModel", "stopAtRoundLimit"])
  .addEdge("stopAtRoundLimit", END);

/**
 * Saves graph state between steps so a run can pause for approval and
 * resume later. In memory: a paused run doesn't survive an app restart.
 */
const checkpointer = new MemorySaver();

/** Main agent: checkpointed, so it can pause for approval. */
const agentGraph = graphBuilder.compile({ checkpointer });

/** Same graph without a checkpointer, for sub-agents (they never pause). */
const subAgentGraph = graphBuilder.compile();

// ── Running it ───────────────────────────────────────────────────────────────

export type AgentResult =
  | { status: "done" | "cancelled"; answer: string; toolActivity: ToolActivity[] }
  | {
      status: "needs_approval";
      answer: string;
      toolActivity: ToolActivity[];
      /** Pass this to resumeAgent with the user's answer. */
      runId: string;
      request: ApprovalRequest;
    };

type RunInput = {
  systemPrompt: string;
  messages: LlmMessage[];
  maxRounds?: number;
};

/** Paused runs older than this are forgotten. */
const PAUSED_RUN_TTL_MS = 24 * 60 * 60 * 1000;
const pausedAt = new Map<string, number>();

function initialState(input: RunInput) {
  return {
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    maxRounds: input.maxRounds ?? 8,
    rounds: 0,
  };
}

/** Start a new agent run. It may finish, or pause and ask for approval. */
export async function runAgent(
  input: RunInput,
  deps: AgentDeps,
  signal?: AbortSignal,
): Promise<AgentResult> {
  await forgetStalePausedRuns();
  return invokeGraph(randomUUID(), initialState(input), deps, signal);
}

/** Continue a run that paused for approval, with the user's answer. */
export async function resumeAgent(
  runId: string,
  approved: boolean,
  deps: AgentDeps,
  signal?: AbortSignal,
): Promise<AgentResult> {
  return invokeGraph(runId, new Command({ resume: { approved } }), deps, signal);
}

/** True while a run is paused and waiting for the user's answer. */
export function isWaitingForApproval(runId: string): boolean {
  return pausedAt.has(runId);
}

/** Run a sub-agent to completion. No checkpointer, so it can't pause. */
export async function runSubAgent(
  input: RunInput,
  deps: AgentDeps,
): Promise<{ answer: string; toolActivity: ToolActivity[] }> {
  const state = await subAgentGraph.invoke(initialState(input), { context: withDefaults(deps) });
  return { answer: state.answer, toolActivity: state.toolActivity };
}

async function invokeGraph(
  runId: string,
  input: Parameters<typeof agentGraph.invoke>[0],
  deps: AgentDeps,
  signal?: AbortSignal,
): Promise<AgentResult> {
  let state: State;
  try {
    state = await agentGraph.invoke(input, {
      configurable: { thread_id: runId },
      context: withDefaults(deps),
      signal,
    });
  } catch (err) {
    if (!signal?.aborted) throw err;
    await forgetRun(runId);
    return { status: "cancelled", answer: "", toolActivity: [] };
  }

  if (isInterrupted<ApprovalRequest>(state)) {
    pausedAt.set(runId, Date.now());
    const request = state[INTERRUPT][0].value!;
    return { status: "needs_approval", answer: state.answer, toolActivity: state.toolActivity, runId, request };
  }

  // Finished: nothing will resume it, so drop the saved state.
  await forgetRun(runId);
  return {
    status: signal?.aborted ? "cancelled" : "done",
    answer: state.answer,
    toolActivity: state.toolActivity,
  };
}

async function forgetRun(runId: string): Promise<void> {
  pausedAt.delete(runId);
  await checkpointer.deleteThread(runId);
}

async function forgetStalePausedRuns(): Promise<void> {
  const cutoff = Date.now() - PAUSED_RUN_TTL_MS;
  for (const [runId, at] of pausedAt) {
    if (at < cutoff) await forgetRun(runId);
  }
}
