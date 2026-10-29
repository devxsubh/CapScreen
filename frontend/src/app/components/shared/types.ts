// Shared TypeScript types for CapScreen compliance assistant

import type { ChatFocus } from "@/lib/chatFocus";
import type { ScreeningResult } from "@/lib/screenerTypes";

export interface AppCapTableCsvMeta {
  id: string;
  filename: string;
  uploaded_at: string;
  csv_kind: string | null;
  parse_status: string;
  roster_purpose: string;
  record_count: number;
}

export interface AppScreeningAsset {
  id: string;
  label: string;
  purpose: "cap_table" | "co_investor" | "vendor";
  screened_at: string | null;
  csv_filename: string | null;
  total_entities: number;
  flagged_count: number;
  review_count: number;
}

export interface AppProject {
  id: string;
  user_id: string;
  is_owner?: boolean;
  /** Global read-only demo workspace visible to all users. */
  is_sample?: boolean;
  name: string;
  cm_number: string | null;
  shared_with: string[];
  created_at: string;
  updated_at: string;
  documents?: AppDocument[];
  csvs?: AppCapTableCsvMeta[];
  screening_assets?: AppScreeningAsset[];
  document_count?: number;
  chat_count?: number;
  review_count?: number;
}

export interface AppDocument {
  id: string;
  user_id?: string;
  project_id: string | null;
  folder_id?: string | null;
  filename: string;
  file_type: string | null; // pdf | docx | doc
  storage_path: string | null;
  pdf_storage_path: string | null;
  size_bytes: number | null;
  page_count: number | null;
  structure_tree: StructureNode[] | null;
  status: "pending" | "processing" | "ready" | "error";
  created_at: string | null;
  updated_at?: string | null;
  /** Max version_number across assistant_edit rows, null if doc is unedited. */
  latest_version_number?: number | null;
}

export interface StructureNode {
  id: string;
  title: string;
  level: number;
  page_number: number | null;
  children: StructureNode[];
}

export interface AppChat {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  created_at: string;
}

export interface AgentPlanStep {
  title: string;
  status: "pending" | "in_progress" | "done";
}

export type AssistantEvent =
  | {
        type: "tool_call_start";
        name: string;
        isStreaming?: boolean;
    }
  | { type: "thinking"; isStreaming?: boolean }
  | {
        type: "doc_created";
        filename: string;
        download_url: string;
        /** Set when the generated doc is persisted as a first-class document. */
        document_id?: string;
        /** Startup workspace id — used to load generated docs in the panel. */
        startup_id?: string;
        version_id?: string;
        version_number?: number | null;
        isStreaming?: boolean;
    }
  | {
        type: "screening_complete";
        startupName?: string | null;
        totalEntities: number;
        flaggedCount: number;
        reviewCount: number;
        screeningConfidence?: number | null;
        /** Full graph + entity payload — persisted so the side panel reopens from history. */
        result?: ScreeningResult;
        isStreaming?: boolean;
    }
  | { type: "workflow_applied"; workflow_id: string; title: string }
  /** The agent's step-by-step plan; replaced in place each time it updates. */
  | { type: "plan"; steps: AgentPlanStep[] }
  /** The agent paused to ask before running a sensitive tool (e.g. web search). */
  | {
        type: "approval_request";
        runId: string;
        calls: { name: string; input: unknown }[];
        /** "skipped" = the user sent a new message instead of answering. */
        status: "pending" | "approved" | "declined" | "skipped";
    }
  | { type: "content"; text: string; isStreaming?: boolean };

export interface AppMessage {
  role: "user" | "assistant";
  content: string;
  files?: { filename: string; document_id?: string }[];
  workflow?: { id: string; title: string };
  /** Capability picked in the composer's Tools menu. */
  focus?: ChatFocus;
  model?: string;
  /** Client-only cap-table text for screening; not persisted to chat history. */
  csvContent?: string;
  /** Client-only screening result for workflow bootstrap; not persisted. */
  screeningResult?: ScreeningResult;
  annotations?: AppCitationAnnotation[];
  events?: AssistantEvent[];
  /** Set when streaming failed; rendered as a red error block. */
  error?: string;
}

export interface CitationQuote {
  page: number;
  quote: string;
}

/**
 * A citation emitted by the assistant. Single-page citations have a numeric
 * `page` and a plain `quote`. A citation that spans a page break (one
 * continuous sentence cut by a page boundary) has `page` as a range string
 * like "41-42" and a `quote` containing the `[[PAGE_BREAK]]` sentinel at the
 * break point (text before is on page 41, text after is on page 42).
 */
export interface AppCitationAnnotation {
  type: "citation_data";
  ref: number;
  doc_id: string;
  document_id: string;
  version_id?: string | null;
  version_number?: number | null;
  filename: string;
  page: number | string;
  quote: string;
}

const PAGE_BREAK_SENTINEL = "[[PAGE_BREAK]]";

/**
 * Expand a citation into one or more (page, quote) entries suitable for
 * highlighting in the PDF viewer. A single-page citation yields one entry; a
 * cross-page citation with page "N-M" and a `[[PAGE_BREAK]]` split yields two.
 */
export function expandCitationToEntries(
  a: AppCitationAnnotation,
): CitationQuote[] {
  const rangeMatch =
    typeof a.page === "string"
      ? a.page.match(/^(\d+)\s*-\s*(\d+)$/)
      : null;
  if (rangeMatch && a.quote.includes(PAGE_BREAK_SENTINEL)) {
    const startPage = parseInt(rangeMatch[1], 10);
    const endPage = parseInt(rangeMatch[2], 10);
    const [before, after] = a.quote.split(PAGE_BREAK_SENTINEL);
    return [
      { page: startPage, quote: before.trim() },
      { page: endPage, quote: after.trim() },
    ].filter((e) => e.quote.length > 0);
  }
  const pageNum =
    typeof a.page === "number" ? a.page : parseInt(String(a.page), 10);
  if (!Number.isFinite(pageNum)) return [];
  return [{ page: pageNum, quote: a.quote }];
}

/** Format the page(s) of a citation for display, e.g. "Page 3" or "Page 41-42". */
export function formatCitationPage(a: AppCitationAnnotation): string {
  if (typeof a.page === "string") return `Page ${a.page}`;
  return `Page ${a.page}`;
}

/** Produce a reader-friendly version of the quote (replaces [[PAGE_BREAK]] with "..."). */
export function displayCitationQuote(a: AppCitationAnnotation): string {
  return a.quote.replaceAll(PAGE_BREAK_SENTINEL, "...");
}

// Tabular Review

export type ColumnFormat =
    | "text"
    | "bulleted_list"
    | "number"
    | "currency"
    | "yes_no"
    | "date"
    | "tag"
    | "percentage"
    | "monetary_amount";

export interface ColumnConfig {
    index: number;
    name: string;
    prompt: string;
    format?: ColumnFormat;
    tags?: string[];
}

export interface TabularReview {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  columns_config: ColumnConfig[] | null;
  document_ids?: string[] | null;
  workflow_id: string | null;
  practice?: string | null;
  /** Per-review email list. Used so standalone (project_id null) reviews can be shared directly. */
  shared_with?: string[];
  /** Server-set: true when the requesting user is the review's creator. */
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
  document_count?: number;
  review_kind?: string;
}

export interface TabularCell {
  id: string;
  review_id: string;
  document_id: string;
  column_index: number;
  content: {
    summary: string;
    flag?: "green" | "grey" | "yellow" | "red";
    reasoning?: string;
  } | null;
  status: "pending" | "generating" | "done" | "error";
  created_at: string;
}

// Workflows

export interface AppWorkflow {
  id: string;
  user_id: string | null;
  title: string;
  type: "assistant" | "tabular";
  prompt_md: string | null;
  columns_config: ColumnConfig[] | null;
  is_system: boolean;
  created_at: string;
  practice?: string | null;
}

// API helpers

export interface AppChatDetailOut {
  chat: AppChat;
  messages: AppMessage[];
}

export interface TabularReviewDetailOut {
  review: TabularReview;
  cells: TabularCell[];
  documents: AppDocument[];
}
