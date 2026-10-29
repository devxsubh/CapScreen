// Minimal chat types for the screener (subset of the CapScreen assistant)

import type { ChatFocus } from "@/lib/chatFocus";

import type { ScreeningProgressEvent } from "@/lib/screenerTypes";

export type AssistantEvent =
  | { type: "thinking"; isStreaming?: boolean }
  | {
      type: "tool_call_start";
      name: string;
      isStreaming?: boolean;
    }
  | {
      type: "screening_progress";
      progressHistory: ScreeningProgressEvent[];
      isStreaming?: boolean;
    }
  | {
      type: "document_created";
      document: {
        id: string;
        startupId: string;
        kind: "ic_memo";
        title: string;
      };
    }
  | {
      type: "approval_request";
      runId: string;
      calls: { name: string; input: unknown }[];
      /** "skipped" = the user sent a new message instead of answering. */
      status: "pending" | "approved" | "declined" | "skipped";
    }
  | { type: "content"; text: string; isStreaming?: boolean };

export interface ScreenerMessage {
  role: "user" | "assistant";
  content: string;
  files?: { filename: string }[];
  focus?: ChatFocus;
  workflow?: { id: string; title: string };
  events?: AssistantEvent[];
  error?: string;
}
