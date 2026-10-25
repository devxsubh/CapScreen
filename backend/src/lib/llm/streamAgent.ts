import type { ToolActivity, ToolDocumentResult } from "../chat/chatTools";
import {
  getLlm,
  type LlmMessage,
  type LlmResponse,
  type LlmRole,
  type LlmToolChoice,
  type LlmToolResultBlock,
  type LlmToolSchema,
  type LlmToolUseBlock,
} from "./providers";

function truncate(s: string, max = 120): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

export type SseWrite = (line: string) => void;

const NO_TOOLS_NOTE =
  "\n\n## Tool access\nThe configured model does not support tool calling. Answer only from the context in this prompt, " +
  "say plainly when data you would normally look up is unavailable, and never invent entities, scores, or matches.";

export async function runAgentStream(params: {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: LlmToolSchema[];
  executeTool: (
    name: string,
    input: unknown,
  ) => Promise<{ content: string; document?: ToolDocumentResult }>;
  write: SseWrite;
  maxTokens?: number;
  maxRounds?: number;
  /** Force a specific tool on round 0 only. Subsequent rounds always use auto. */
  toolChoice?: LlmToolChoice;
  role?: LlmRole;
}): Promise<{ fullText: string; toolActivity: ToolActivity[] }> {
  const llm = getLlm(params.role ?? "agent");
  const tools = llm.supportsTools ? params.tools : [];
  const systemPrompt = llm.supportsTools ? params.systemPrompt : params.systemPrompt + NO_TOOLS_NOTE;

  const toolActivity: ToolActivity[] = [];
  const messages = [...params.messages];
  const maxRounds = params.maxRounds ?? 8;
  let fullText = "";

  for (let round = 0; round < maxRounds; round++) {
    const announcedTools = new Set<string>();
    let finalResponse: LlmResponse | null = null;

    for await (const event of llm.provider.stream({
      model: llm.model,
      maxTokens: params.maxTokens ?? 2048,
      systemPrompt,
      tools,
      messages,
      ...(round === 0 && params.toolChoice ? { toolChoice: params.toolChoice } : {}),
    })) {
      if (event.type === "tool_use_start") {
        if (!announcedTools.has(event.name)) {
          announcedTools.add(event.name);
          params.write(
            `data: ${JSON.stringify({ type: "tool_call_start", name: event.name })}\n\n`,
          );
        }
      } else if (event.type === "text_delta") {
        fullText += event.text;
        params.write(
          `data: ${JSON.stringify({ type: "content_delta", text: event.text })}\n\n`,
        );
      } else {
        finalResponse = event.response;
      }
    }

    const toolUses = (finalResponse?.content ?? []).filter(
      (b): b is LlmToolUseBlock => b.type === "tool_use",
    );

    if (finalResponse?.stopReason !== "tool_use" || toolUses.length === 0) {
      params.write(`data: ${JSON.stringify({ type: "content_done" })}\n\n`);
      return { fullText, toolActivity };
    }

    messages.push({ role: "assistant", content: finalResponse.content });

    const toolResults: LlmToolResultBlock[] = [];
    for (const block of toolUses) {
      toolActivity.push({ name: block.name, status: "running" });
      const { content, document } = await params.executeTool(
        block.name,
        block.input,
      );
      const idx = toolActivity.length - 1;
      toolActivity[idx] = {
        name: block.name,
        status: "done",
        summary: truncate(content),
      };
      if (document) {
        params.write(
          `data: ${JSON.stringify({ type: "document_created", document })}\n\n`,
        );
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  const fallback =
    "I hit the tool-call limit for this turn. Please try a simpler question.";
  fullText += fallback;
  params.write(
    `data: ${JSON.stringify({ type: "content_delta", text: fallback })}\n\n`,
  );
  params.write(`data: ${JSON.stringify({ type: "content_done" })}\n\n`);
  return { fullText, toolActivity };
}
