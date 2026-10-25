import { getLlm, responseText, type LlmRole } from "./providers";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Single-shot completion — narratives, CSV schema inference, entity extraction
export async function completeText(params: {
  systemPrompt?: string;
  user: string;
  maxTokens?: number;
  role?: LlmRole;
}): Promise<string> {
  return chatText({
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.user }],
    maxTokens: params.maxTokens,
    role: params.role,
  });
}

// Multi-turn chat — caller owns the full message history and sends it each time
export async function chatText(params: {
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  role?: LlmRole;
}): Promise<string> {
  const llm = getLlm(params.role ?? "utility");
  const resp = await llm.provider.complete({
    model: llm.model,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    maxTokens: params.maxTokens ?? 1024,
  });
  return responseText(resp);
}
