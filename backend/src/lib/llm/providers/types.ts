/**
 * Provider-neutral LLM types.
 *
 * Field names deliberately mirror the Anthropic wire format (input_schema,
 * tool_use_id, …) so existing tool definitions work unchanged; adapters
 * translate to each provider's own format.
 */

export type LlmTextBlock = { type: "text"; text: string };
export type LlmToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
export type LlmToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export type LlmMessage = {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
};

export type LlmToolSchema = {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown> | null;
    required?: string[] | null;
    [k: string]: unknown;
  };
};

export type LlmToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string };

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "other";

export type LlmRequest = {
  model: string;
  systemPrompt?: string;
  messages: LlmMessage[];
  tools?: LlmToolSchema[];
  toolChoice?: LlmToolChoice;
  maxTokens?: number;
};

export type LlmResponse = {
  content: Array<LlmTextBlock | LlmToolUseBlock>;
  stopReason: LlmStopReason;
};

export type LlmStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "done"; response: LlmResponse };

export type ProviderKind = "anthropic" | "openai-compatible" | "ollama";

export interface LlmProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  /** True when requests never leave this machine (Ollama, LM Studio, …). */
  readonly local: boolean;
  complete(req: LlmRequest): Promise<LlmResponse>;
  stream(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
  embed?(model: string, texts: string[]): Promise<number[][]>;
  listModels?(): Promise<string[]>;
}

export function responseText(resp: LlmResponse): string {
  return resp.content
    .filter((b): b is LlmTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
