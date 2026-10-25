import { getAuthHeaders } from "@/lib/apiAuth";
import type {
  ScreeningProgressEvent,
  ScreeningResult,
} from "@/lib/screenerTypes";
import { apiBase } from "@/lib/apiBase";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ToolActivity = {
  name: string;
  status: "running" | "done";
  summary?: string;
};

const API_BASE = apiBase();

export async function screenCapTable(
  file: File,
  onProgress?: (event: ScreeningProgressEvent) => void,
): Promise<ScreeningResult> {
  const body = new FormData();
  body.append("csv", file);

  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/api/screen/stream`, {
    method: "POST",
    headers: authHeaders,
    body,
  });

  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Screening failed (${resp.status})`);
  }

  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return resp.json() as Promise<ScreeningResult>;
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: ScreeningResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (event.type === "screening_progress") {
        onProgress?.({
          stage: event.stage as ScreeningProgressEvent["stage"],
          status: event.status as ScreeningProgressEvent["status"],
          detail: event.detail as string | undefined,
          current: event.current as number | undefined,
          total: event.total as number | undefined,
        });
      } else if (event.type === "done" && event.screeningResult) {
        result = event.screeningResult as ScreeningResult;
      } else if (event.type === "error" && typeof event.detail === "string") {
        throw new Error(event.detail);
      }
    }
  }

  if (!result) throw new Error("Screening finished without a result");
  return result;
}

export type ToolDocument = {
  id: string;
  startupId: string;
  kind: "ic_memo";
  title: string;
};

export async function streamChatMessage(params: {
  messages: ChatMessage[];
  screeningResult: ScreeningResult | null;
  csvContent?: string | null;
  startupId?: string | null;
  onToken: (text: string) => void;
  onToolCall: (name: string) => void;
  onScreeningResult: (result: ScreeningResult) => void;
  onScreeningProgress?: (event: ScreeningProgressEvent) => void;
  onDocumentCreated?: (document: ToolDocument) => void;
  signal?: AbortSignal;
}): Promise<{ toolActivity: ToolActivity[] }> {
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      messages: params.messages,
      screeningResult: params.screeningResult,
      csvContent: params.csvContent ?? null,
      startupId: params.startupId ?? null,
    }),
    signal: params.signal,
  });

  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Chat failed (${resp.status})`);
  }

  const contentType = resp.headers.get("content-type") ?? "";

  // Legacy non-streaming backend returns JSON { content, screeningResult, toolActivity }.
  if (contentType.includes("application/json")) {
    const data = (await resp.json()) as {
      content?: string;
      screeningResult?: ScreeningResult;
      toolActivity?: ToolActivity[];
    };
    for (const tool of data.toolActivity ?? []) {
      if (tool.name) params.onToolCall(tool.name);
    }
    if (data.screeningResult) {
      params.onScreeningResult(data.screeningResult);
    }
    if (typeof data.content === "string" && data.content) {
      params.onToken(data.content);
    }
    return { toolActivity: data.toolActivity ?? [] };
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let toolActivity: ToolActivity[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = event.type as string;

      if (type === "content_delta" && typeof event.text === "string") {
        params.onToken(event.text);
      } else if (type === "tool_call_start" && typeof event.name === "string") {
        params.onToolCall(event.name);
      } else if (type === "screening_result" && event.screeningResult) {
        params.onScreeningResult(event.screeningResult as ScreeningResult);
      } else if (type === "final_result" && event.screeningResult) {
        params.onScreeningResult(event.screeningResult as ScreeningResult);
      } else if (type === "screening_progress") {
        params.onScreeningProgress?.({
          stage: event.stage as ScreeningProgressEvent["stage"],
          status: event.status as ScreeningProgressEvent["status"],
          detail: event.detail as string | undefined,
          current: event.current as number | undefined,
          total: event.total as number | undefined,
        });
      } else if (type === "tool_activity" && Array.isArray(event.toolActivity)) {
        toolActivity = event.toolActivity as ToolActivity[];
      } else if (type === "document_created" && event.document) {
        params.onDocumentCreated?.(event.document as ToolDocument);
      } else if (type === "error" && typeof event.detail === "string") {
        throw new Error(event.detail);
      }
    }
  }

  return { toolActivity };
}

export const TOOL_LABELS: Record<string, string> = {
  screen_cap_table: "Screening cap table",
  get_screening_summary: "Reading screening summary",
  get_entity_details: "Looking up entity",
  list_entities: "Listing entities",
  list_sanctioned_exposure: "Listing sanctioned exposure",
  generate_ic_memo: "Generating IC compliance memo",
  generate_screening_analysis_doc: "Generating screening analysis document",
  search_compliance_playbook: "Searching compliance policy",
  web_search: "Searching the web…",
};
