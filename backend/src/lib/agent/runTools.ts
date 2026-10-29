/**
 * Runs the tool calls the model asked for in one turn.
 *
 * - Consecutive read-only calls run in parallel; anything that changes data
 *   runs one at a time, in the order the model asked for it.
 * - A failing, slow or malformed call never crashes the run. The model gets
 *   an error message as the tool result and decides what to do next.
 * - Very long results are trimmed so one tool can't flood the context window.
 */
import type { LlmToolResultBlock, LlmToolUseBlock } from "../llm/providers";
import type { ToolRegistry } from "../tools/registry";
import type { ToolActivity } from "../tools/types";
import { sseEvent, type ExecuteTool, type SseWrite } from "./types";

const TOOL_TIMEOUT_MS = 5 * 60_000;
const MAX_RESULT_CHARS = 20_000;

export const DECLINED_RESULT =
  "The user declined this tool call. Do not retry it. Continue without it and tell the user what you could not check.";

export type RunToolsOptions = {
  registry: ToolRegistry;
  executeTool: ExecuteTool;
  write: SseWrite;
  /** Ids of tool calls the user said no to. They are answered without running. */
  declinedIds?: Set<string>;
};

export async function runTools(
  calls: LlmToolUseBlock[],
  opts: RunToolsOptions,
): Promise<{ results: LlmToolResultBlock[]; activity: ToolActivity[] }> {
  const results: LlmToolResultBlock[] = [];
  const activity: ToolActivity[] = [];

  for (const batch of groupReadOnlyCalls(calls, opts.registry)) {
    const contents = await Promise.all(batch.map((call) => runOneTool(call, opts)));
    batch.forEach((call, i) => {
      results.push({ type: "tool_result", tool_use_id: call.id, content: contents[i] });
      activity.push({ name: call.name, status: "done", summary: oneLine(contents[i]) });
    });
  }

  return { results, activity };
}

/**
 * Splits calls into batches that are safe to run together:
 * [read, read, write, read] → [[read, read], [write], [read]]
 */
function groupReadOnlyCalls(
  calls: LlmToolUseBlock[],
  registry: ToolRegistry,
): LlmToolUseBlock[][] {
  const batches: LlmToolUseBlock[][] = [];
  for (const call of calls) {
    const readOnly = registry.get(call.name)?.readOnly === true;
    const current = batches[batches.length - 1];
    const currentIsReadOnly = current?.every((c) => registry.get(c.name)?.readOnly === true);
    if (readOnly && current && currentIsReadOnly) current.push(call);
    else batches.push([call]);
  }
  return batches;
}

async function runOneTool(call: LlmToolUseBlock, opts: RunToolsOptions): Promise<string> {
  if (opts.declinedIds?.has(call.id)) return DECLINED_RESULT;

  const tool = opts.registry.get(call.name);
  if (!tool) return `Error: unknown tool "${call.name}".`;

  const inputError = checkRequiredFields(call.input, tool.schema.input_schema.required);
  if (inputError) return `Error: ${inputError}`;

  try {
    const { content, document } = await withTimeout(
      opts.executeTool(call.name, call.input),
      TOOL_TIMEOUT_MS,
    );
    if (document) opts.write(sseEvent("document_created", { document }));
    return trim(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] tool ${call.name} failed:`, message);
    return `Error: ${call.name} failed (${message}). Tell the user this step did not complete.`;
  }
}

function checkRequiredFields(input: unknown, required?: string[] | null): string | null {
  if (typeof input !== "object" || input === null) return "tool input must be a JSON object.";
  const missing = (required ?? []).filter((field) => !(field in input));
  return missing.length > 0 ? `missing required field(s): ${missing.join(", ")}.` : null;
}

/** Stops waiting after `ms`. The underlying work is not cancelled, only abandoned. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function trim(content: string): string {
  if (content.length <= MAX_RESULT_CHARS) return content;
  return `${content.slice(0, MAX_RESULT_CHARS)}\n…[output trimmed: ${content.length - MAX_RESULT_CHARS} more characters]`;
}

function oneLine(s: string, max = 120): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}
