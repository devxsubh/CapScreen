import crypto from "crypto";
import OpenAI from "openai";
import type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmStreamEvent,
  LlmToolChoice,
  LlmToolUseBlock,
} from "./types";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

function toolId(): string {
  return `call_${crypto.randomBytes(8).toString("hex")}`;
}

function parseArgs(raw: string | undefined): unknown {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toChatMessages(systemPrompt: string | undefined, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    if (m.role === "assistant") {
      const text = m.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
      const toolCalls = m.content
        .filter((b): b is LlmToolUseBlock => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // User turn: tool results become `tool` messages, text stays a user message.
    const text: string[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
      } else if (b.type === "text") {
        text.push(b.text);
      }
    }
    if (text.length) out.push({ role: "user", content: text.join("\n") });
  }
  return out;
}

function toToolChoice(choice: LlmToolChoice | undefined) {
  if (!choice) return undefined;
  if (choice.type === "auto") return "auto" as const;
  if (choice.type === "any") return "required" as const;
  return { type: "function" as const, function: { name: choice.name } };
}

function toStopReason(finish: string | null | undefined, hasToolCalls: boolean): LlmStopReason {
  // Several local servers report "stop" even when they emitted tool calls.
  if (hasToolCalls) return "tool_use";
  if (finish === "stop") return "end_turn";
  if (finish === "length") return "max_tokens";
  return "other";
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly kind = "openai-compatible" as const;
  private client: OpenAI | null = null;

  constructor(
    readonly id: string,
    private readonly baseUrl: string | undefined,
    private readonly apiKey: string,
    readonly local: boolean,
  ) {}

  private sdk(): OpenAI {
    // Local servers ignore the key, but the SDK requires a non-empty value.
    this.client ??= new OpenAI({
      apiKey: this.apiKey || "not-needed",
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    });
    return this.client;
  }

  private params(req: LlmRequest) {
    const tools: ChatTool[] | undefined = req.tools?.length
      ? req.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description ?? "",
            parameters: t.input_schema as Record<string, unknown>,
          },
        }))
      : undefined;
    return {
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: toChatMessages(req.systemPrompt, req.messages),
      ...(tools ? { tools } : {}),
      ...(tools && req.toolChoice ? { tool_choice: toToolChoice(req.toolChoice) } : {}),
    };
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const resp = await this.sdk().chat.completions.create({ ...this.params(req), stream: false });
    const choice = resp.choices[0];
    const content: LlmResponse["content"] = [];
    if (choice?.message.content) content.push({ type: "text", text: choice.message.content });
    for (const tc of choice?.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      content.push({
        type: "tool_use",
        id: tc.id || toolId(),
        name: tc.function.name,
        input: parseArgs(tc.function.arguments),
      });
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    return { content, stopReason: toStopReason(choice?.finish_reason, hasTools) };
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const stream = await this.sdk().chat.completions.create({ ...this.params(req), stream: true });

    let text = "";
    let finish: string | null = null;
    const calls = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;

      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        yield { type: "text_delta", text: delta.content };
      }
      for (const tc of delta?.tool_calls ?? []) {
        let call = calls.get(tc.index);
        if (!call) {
          call = { id: tc.id || toolId(), name: tc.function?.name ?? "", args: "" };
          calls.set(tc.index, call);
          if (call.name) yield { type: "tool_use_start", id: call.id, name: call.name };
        } else if (!call.name && tc.function?.name) {
          call.name = tc.function.name;
          yield { type: "tool_use_start", id: call.id, name: call.name };
        }
        if (tc.function?.arguments) call.args += tc.function.arguments;
      }
    }

    const content: LlmResponse["content"] = [];
    if (text) content.push({ type: "text", text });
    for (const call of [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c)) {
      if (!call.name) continue;
      content.push({ type: "tool_use", id: call.id, name: call.name, input: parseArgs(call.args) });
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    yield { type: "done", response: { content, stopReason: toStopReason(finish, hasTools) } };
  }

  async embed(model: string, texts: string[]): Promise<number[][]> {
    const resp = await this.sdk().embeddings.create({ model, input: texts });
    return resp.data.map((d) => d.embedding);
  }

  async listModels(): Promise<string[]> {
    const page = await this.sdk().models.list();
    return page.data.map((m) => m.id);
  }
}
