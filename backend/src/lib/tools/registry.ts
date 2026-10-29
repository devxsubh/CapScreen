import type { LlmToolSchema } from "../llm/providers";
import type { ToolContext, ToolExecutorResult } from "./types";

export interface ToolDefinition {
  name: string;
  schema: LlmToolSchema;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolExecutorResult>;
  /** Optional routing hint included in the system prompt's "Tool routing" section. */
  routingHint?: string;
  /**
   * The tool only reads data. The agent loop may run several read-only calls
   * at the same time, and sub-agents may use it.
   */
  readOnly?: boolean;
  /**
   * The tool needs the user's OK before it runs (e.g. it sends data off the
   * machine). The agent loop pauses and asks instead of calling it.
   */
  needsApproval?: boolean;
}

export class ToolRegistry {
  private readonly _tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): this {
    if (this._tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    this._tools.set(def.name, def);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this._tools.get(name);
  }

  getTools(): LlmToolSchema[] {
    return [...this._tools.values()].map((d) => d.schema);
  }

  async execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolExecutorResult> {
    const def = this._tools.get(name);
    if (!def) return { content: `Unknown tool: ${name}` };
    return def.handler(input, ctx);
  }

  createExecutor(ctx: ToolContext) {
    return (name: string, input: unknown) => this.execute(name, input, ctx);
  }

  /** Returns the "## Tool routing" system prompt block built from each tool's routingHint. */
  buildRoutingSection(): string {
    const hints = [...this._tools.values()]
      .filter((d) => d.routingHint)
      .map((d) => d.routingHint!);
    if (hints.length === 0) return "";
    return `## Tool routing — use exactly the right tool\n\n${hints.join("\n\n")}`;
  }
}
