import type { LlmMessage } from "../../lib/llm/providers";
import type { ScreeningResult } from "../../lib/screening/runScreening";
import { badRequest } from "../../http/httpError";
import { FOCUS_INSTRUCTIONS, type ChatFocus } from "./assistant.prompts";

/** Chat payload parsing shared by the assistant and tabular grid chat. */

const MAX_MESSAGES = 50;
const MAX_MESSAGE_BYTES = 16 * 1024;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  workflow?: { id: string; title: string };
  focus?: ChatFocus;
};

export type DocumentRef = { filename: string; document_id: string };

/** Keeps well-formed user/assistant turns; rejects empty, oversized or too-long conversations. */
export function parseChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest("'messages' must be a non-empty array");
  }
  if (value.length > MAX_MESSAGES) throw badRequest(`Too many messages (max ${MAX_MESSAGES})`);

  const out: ChatMessage[] = [];
  for (const m of value) {
    if (typeof m !== "object" || m === null) continue;
    const row = m as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    const content = row.content.trim();
    if (Buffer.byteLength(content, "utf8") > MAX_MESSAGE_BYTES) {
      throw badRequest("Message exceeds 16 KB limit");
    }
    const workflow =
      row.workflow && typeof row.workflow === "object" ? (row.workflow as { id: string; title: string }) : undefined;
    const focus =
      typeof row.focus === "string" && row.focus in FOCUS_INSTRUCTIONS ? (row.focus as ChatFocus) : undefined;
    out.push({ role: row.role, content, workflow, focus });
  }

  if (out.length === 0) throw badRequest("'messages' must contain at least one valid entry");
  return out;
}

/** A selected workflow is announced to the model at the top of the user's message. */
export function toLlmMessages(messages: ChatMessage[]): LlmMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      m.role === "user" && m.workflow?.id
        ? `[Workflow: ${m.workflow.title} (id: ${m.workflow.id})]\n\n${m.content}`
        : m.content,
  }));
}

export function parseScreeningResult(value: unknown): ScreeningResult | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ScreeningResult;
  if (!Array.isArray(r.entities) || typeof r.totalEntities !== "number") return null;
  return r;
}

export function parseDocumentRef(value: unknown): DocumentRef | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.filename !== "string" || typeof row.document_id !== "string") return null;
  const filename = row.filename.trim();
  const document_id = row.document_id.trim();
  if (!filename || !document_id) return null;
  return { filename, document_id };
}

export function parseDocumentRefs(value: unknown): DocumentRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(parseDocumentRef).filter((d): d is DocumentRef => d !== null);
  return out.length > 0 ? out : undefined;
}
