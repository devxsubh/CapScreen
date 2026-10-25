import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmStreamEvent,
} from "./types";

function toStopReason(reason: string | null): LlmStopReason {
  if (reason === "end_turn" || reason === "tool_use" || reason === "max_tokens") {
    return reason;
  }
  return "other";
}

function toResponse(msg: Anthropic.Message): LlmResponse {
  const content: LlmResponse["content"] = [];
  for (const b of msg.content) {
    if (b.type === "text") content.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") {
      content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
  }
  return { content, stopReason: toStopReason(msg.stop_reason) };
}

export class AnthropicProvider implements LlmProvider {
  readonly kind = "anthropic" as const;
  readonly local = false;
  private client: Anthropic | null = null;

  constructor(
    readonly id: string,
    private readonly apiKey: string,
    private readonly baseUrl?: string,
  ) {}

  private sdk(): Anthropic {
    if (!this.apiKey) throw new Error(`API key for provider "${this.id}" is not set`);
    this.client ??= new Anthropic({
      apiKey: this.apiKey,
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    });
    return this.client;
  }

  private params(req: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
    return {
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
      // Neutral blocks share Anthropic's field names, so this is structural.
      messages: req.messages as Anthropic.MessageParam[],
      ...(req.tools?.length ? { tools: req.tools as Anthropic.Tool[] } : {}),
      ...(req.tools?.length && req.toolChoice
        ? { tool_choice: req.toolChoice as Anthropic.ToolChoice }
        : {}),
    };
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    return toResponse(await this.sdk().messages.create(this.params(req)));
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const stream = this.sdk().messages.stream(this.params(req));
    for await (const event of stream) {
      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        yield {
          type: "tool_use_start",
          id: event.content_block.id,
          name: event.content_block.name,
        };
      } else if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text_delta", text: event.delta.text };
      }
    }
    yield { type: "done", response: toResponse(await stream.finalMessage()) };
  }

  async listModels(): Promise<string[]> {
    const page = await this.sdk().models.list({ limit: 100 });
    return page.data.map((m) => m.id);
  }
}
