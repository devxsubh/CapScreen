import type {
  ScreeningProgressEvent,
  ScreeningResult,
} from "@/lib/screenerTypes";
import { apiBase } from "@/lib/apiBase";
import type { ChatFocus } from "@/lib/chatFocus";
import { resumeAgentRun } from "@/app/lib/capScreenApi";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  focus?: ChatFocus;
  workflow?: { id: string; title: string };
};

const API_BASE = apiBase();

export type ToolDocument = {
  id: string;
  startupId: string;
  kind: "ic_memo";
  title: string;
};

export type ApprovalCall = { name: string; input: unknown };

/** Callbacks for one streamed agent turn (POST /chat or an approval resume). */
export type ChatStreamHandlers = {
  onToken: (text: string) => void;
  onToolCall: (name: string) => void;
  onScreeningResult: (result: ScreeningResult) => void;
  onScreeningProgress?: (event: ScreeningProgressEvent) => void;
  onDocumentCreated?: (document: ToolDocument) => void;
  /** The agent paused before a sensitive tool; answer with resumeChatTurn. */
  onApprovalRequired?: (runId: string, calls: ApprovalCall[]) => void;
};

/** Startup-scoped turn on the shared assistant agent (POST /chat). */
export async function streamChatMessage(
  params: {
    messages: ChatMessage[];
    screeningResult: ScreeningResult | null;
    csvContent?: string | null;
    startupId?: string | null;
    signal?: AbortSignal;
  } & ChatStreamHandlers,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages,
      screeningResult: params.screeningResult,
      csvContent: params.csvContent ?? null,
      startup_id: params.startupId ?? undefined,
    }),
    signal: params.signal,
  });
  await readChatStream(resp, params);
}

/** Continue a turn after the user allows or denies a paused tool call. */
export async function resumeChatTurn(
  runId: string,
  approved: boolean,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  await readChatStream(await resumeAgentRun(runId, approved, signal), handlers);
}

async function readChatStream(resp: Response, handlers: ChatStreamHandlers): Promise<void> {
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Chat failed (${resp.status})`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = event.type as string;

      if (type === "content_delta" && typeof event.text === "string") {
        handlers.onToken(event.text);
      } else if (type === "tool_call_start" && typeof event.name === "string") {
        handlers.onToolCall(event.name);
      } else if ((type === "screening_result" || type === "final_result") && event.screeningResult) {
        handlers.onScreeningResult(event.screeningResult as ScreeningResult);
      } else if (type === "screening_progress") {
        handlers.onScreeningProgress?.({
          stage: event.stage as ScreeningProgressEvent["stage"],
          status: event.status as ScreeningProgressEvent["status"],
          detail: event.detail as string | undefined,
          current: event.current as number | undefined,
          total: event.total as number | undefined,
        });
      } else if (type === "document_created" && event.document) {
        handlers.onDocumentCreated?.(event.document as ToolDocument);
      } else if (type === "approval_required" && typeof event.runId === "string") {
        handlers.onApprovalRequired?.(event.runId, (event.calls as ApprovalCall[]) ?? []);
      } else if (type === "error") {
        const message = event.message ?? event.detail;
        throw new Error(typeof message === "string" ? message : "Chat failed");
      }
    }
  }
}

export const TOOL_LABELS: Record<string, string> = {
  update_plan: "Planning",
  delegate_task: "Researching in parallel",
  list_workflows: "Listing workflows",
  read_workflow: "Reading workflow",
  screen_cap_table: "Screening cap table",
  list_mentioned_startups: "Looking up mentioned startups",
  query_screening_data: "Reading screening results",
  generate_document: "Writing document",
  search_compliance_playbook: "Searching compliance policy",
  list_startup_documents: "Listing documents",
  search_startup_documents: "Searching documents",
  screen_document_entities: "Screening document entities",
  web_search: "Searching the web…",
};
