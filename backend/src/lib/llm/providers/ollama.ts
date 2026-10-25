import crypto from "crypto";
import http from "http";
import https from "https";
import os from "os";
import type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmStreamEvent,
  LlmToolUseBlock,
} from "./types";

/**
 * Native Ollama adapter (/api/chat). Preferred over Ollama's OpenAI-compatible
 * endpoint because it lets us set the context window (Ollama defaults to 4K,
 * too small for CapScreen's tool schemas + screening results) and keep a
 * reasoning model's "thinking" out of the reply text.
 */

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
};

type OllamaChunk = {
  message?: { content?: string; thinking?: string; tool_calls?: Array<{ function: { name: string; arguments: unknown } }> };
  done?: boolean;
  done_reason?: string;
  error?: string;
};

/** Context window sized to the machine: KV cache grows with it. */
function defaultContextWindow(): number {
  const fromEnv = Number(process.env.OLLAMA_NUM_CTX);
  if (Number.isFinite(fromEnv) && fromEnv >= 2048) return fromEnv;
  const gb = os.totalmem() / 1024 ** 3;
  if (gb <= 10) return 8192;
  if (gb <= 20) return 16384;
  return 32768;
}

function toolId(): string {
  return `call_${crypto.randomBytes(8).toString("hex")}`;
}

function toOllamaMessages(systemPrompt: string | undefined, messages: LlmMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  // Ollama links tool results by name, not id.
  const namesById = new Map<string, string>();

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const calls = m.content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");
      calls.forEach((c) => namesById.set(c.id, c.name));
      out.push({
        role: "assistant",
        content: text,
        ...(calls.length ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.input ?? {} } })) } : {}),
      });
      continue;
    }
    const text: string[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", content: b.content, tool_name: namesById.get(b.tool_use_id) ?? "" });
      } else if (b.type === "text") {
        text.push(b.text);
      }
    }
    if (text.length) out.push({ role: "user", content: text.join("\n") });
  }
  return out;
}

function stopReason(doneReason: string | undefined, hasTools: boolean): LlmStopReason {
  if (hasTools) return "tool_use";
  if (doneReason === "length") return "max_tokens";
  return "end_turn";
}

export class OllamaProvider implements LlmProvider {
  readonly kind = "ollama" as const;
  readonly local: boolean;
  private readonly base: string;
  private readonly caps = new Map<string, Promise<string[]>>();

  constructor(
    readonly id: string,
    baseUrl: string | undefined,
    local: boolean,
  ) {
    // Accept either the server root or an OpenAI-style /v1 URL.
    this.base = (baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "").replace(/\/v1$/, "");
    this.local = local;
  }

  private capabilities(model: string): Promise<string[]> {
    let p = this.caps.get(model);
    if (!p) {
      p = fetch(`${this.base}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      })
        .then(async (r) => (r.ok ? (((await r.json()) as { capabilities?: string[] }).capabilities ?? []) : []))
        .catch(() => []);
      this.caps.set(model, p);
    }
    return p;
  }

  private async body(req: LlmRequest, stream: boolean) {
    const caps = await this.capabilities(req.model);
    const thinking = caps.includes("thinking");
    let systemPrompt = req.systemPrompt;
    // Ollama has no tool_choice; ask for the forced tool explicitly instead.
    if (req.tools?.length && req.toolChoice?.type === "tool") {
      systemPrompt = `${systemPrompt ?? ""}\n\nIMPORTANT: Your first action must be to call the \`${req.toolChoice.name}\` tool.`;
    } else if (req.tools?.length && req.toolChoice?.type === "any") {
      systemPrompt = `${systemPrompt ?? ""}\n\nIMPORTANT: You must call one of the available tools before answering.`;
    }
    return {
      model: req.model,
      messages: toOllamaMessages(systemPrompt, req.messages),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description ?? "", parameters: t.input_schema },
            })),
          }
        : {}),
      stream,
      // Reasoning models: some builds keep reasoning even with think:false and
      // then write it into the answer. Asking for it explicitly makes Ollama
      // return it in a separate field, which we drop — the reply stays clean.
      ...(thinking ? { think: true } : {}),
      // Release memory soon after use — matters on 8–16 GB machines.
      keep_alive: "5m",
      options: {
        num_ctx: defaultContextWindow(),
        // Reasoning tokens count against the budget; leave room for the answer.
        num_predict: (req.maxTokens ?? 2048) + (thinking ? 4096 : 0),
        temperature: 0.2,
      },
    };
  }

  /**
   * POST via node:http rather than fetch: on low-memory machines prompt
   * processing can exceed fetch's fixed 300 s header timeout, and Ollama sends
   * no headers until it starts generating.
   */
  private post(path: string, body: unknown): Promise<http.IncomingMessage> {
    const url = new URL(`${this.base}${path}`);
    const payload = JSON.stringify(body);
    const lib = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request(
        url,
        { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
        (res) => {
          if ((res.statusCode ?? 500) < 400) {
            resolve(res);
            return;
          }
          let detail = "";
          res.setEncoding("utf8");
          res.on("data", (c: string) => (detail += c));
          res.on("end", () => {
            let msg = detail;
            try {
              msg = (JSON.parse(detail) as { error?: string }).error ?? detail;
            } catch {
              /* plain text */
            }
            reject(new Error(`Ollama ${res.statusCode}: ${msg}`));
          });
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  }

  private async readJson<T>(res: http.IncomingMessage): Promise<T> {
    let text = "";
    for await (const chunk of res) text += chunk;
    return JSON.parse(text) as T;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const chunk = await this.readJson<OllamaChunk>(await this.post("/api/chat", await this.body(req, false)));
    return this.finalize(chunk.message?.content ?? "", chunk.message?.tool_calls ?? [], chunk.done_reason);
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const resp = await this.post("/api/chat", await this.body(req, true));
    const decoder = new TextDecoder();
    let buffered = "";
    let text = "";
    let doneReason: string | undefined;
    const calls: Array<{ function: { name: string; arguments: unknown } }> = [];

    for await (const part of resp as AsyncIterable<Buffer>) {
      buffered += decoder.decode(part, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (!line) continue;
        const chunk = JSON.parse(line) as OllamaChunk;
        if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
        const content = chunk.message?.content;
        if (content) {
          text += content;
          yield { type: "text_delta", text: content };
        }
        for (const call of chunk.message?.tool_calls ?? []) {
          calls.push(call);
          yield { type: "tool_use_start", id: "", name: call.function.name };
        }
        if (chunk.done) doneReason = chunk.done_reason;
      }
    }
    yield { type: "done", response: this.finalize(text, calls, doneReason) };
  }

  private finalize(text: string, calls: Array<{ function: { name: string; arguments: unknown } }>, doneReason?: string): LlmResponse {
    const content: LlmResponse["content"] = [];
    if (text) content.push({ type: "text", text });
    for (const c of calls) {
      let input = c.function.arguments;
      if (typeof input === "string") {
        try {
          input = JSON.parse(input);
        } catch {
          input = {};
        }
      }
      content.push({ type: "tool_use", id: toolId(), name: c.function.name, input: input ?? {} });
    }
    return { content, stopReason: stopReason(doneReason, calls.length > 0) };
  }

  async embed(model: string, texts: string[]): Promise<number[][]> {
    const res = await this.post("/api/embed", { model, input: texts, keep_alive: "5m" });
    return (await this.readJson<{ embeddings: number[][] }>(res)).embeddings;
  }

  async listModels(): Promise<string[]> {
    const resp = await fetch(`${this.base}/api/tags`);
    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    return ((await resp.json()) as { models: Array<{ name: string }> }).models.map((m) => m.name);
  }
}
