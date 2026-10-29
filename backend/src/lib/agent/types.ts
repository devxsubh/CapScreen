import type { ToolDocumentResult } from "../tools/types";

/** Writes one Server-Sent Events line to the client. */
export type SseWrite = (line: string) => void;

/** Runs one tool. Routes wrap the registry so they can react to results (e.g. stream a new screening). */
export type ExecuteTool = (
  name: string,
  input: unknown,
) => Promise<{ content: string; document?: ToolDocumentResult }>;

export function sseEvent(type: string, payload: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}
