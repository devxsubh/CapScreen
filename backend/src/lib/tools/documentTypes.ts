import { AuditLog, Startup, StartupDocument } from "../../models";
import {
  createIcMemoDocument,
  createScreeningAnalysisDocument,
} from "../documents/icMemoDocument";
import { buildFactsBlock } from "../documents/generateIcMemo";
import { completeText } from "../llm/complete";
import { toToolDocument } from "./_shared";
import type { ToolContext, ToolDocumentResult, ToolExecutorResult } from "./types";
import type { ScreeningResult } from "../screening/runScreening";

export interface DocTypeParams {
  resolved: { result: ScreeningResult; id: string };
  ctx: ToolContext;
  contentIntent?: string;
}

export interface DocTypeHandler {
  /** Matches doc_type value the LLM supplies (e.g. "ic_memo"). */
  name: string;
  /** Example shown in generate_document's routingHint. */
  routingExample: string;
  handle: (params: DocTypeParams) => Promise<ToolExecutorResult>;
}

export class DocumentTypeRegistry {
  private readonly _handlers = new Map<string, DocTypeHandler>();

  register(def: DocTypeHandler): this {
    this._handlers.set(def.name, def);
    return this;
  }

  /** Returns "- ic_memo: ...\n- screening_analysis: ..." for the routing hint. */
  getRoutingExamples(): string {
    return [...this._handlers.values()]
      .map((h) => `- ${h.name}: ${h.routingExample}`)
      .join("\n");
  }

  async dispatch(
    docType: string,
    params: DocTypeParams,
  ): Promise<ToolExecutorResult> {
    const handler = this._handlers.get(docType);
    if (handler) return handler.handle(params);
    return genericClaudeDocument(docType, params);
  }
}

// ── Generic fallback ──────────────────────────────────────────────────────────

async function genericClaudeDocument(
  docType: string,
  { resolved, ctx, contentIntent }: DocTypeParams,
): Promise<ToolExecutorResult> {
  const startup = (await Startup.findById(resolved.id).lean()) as
    | Record<string, unknown>
    | null;
  const startupName =
    (startup?.name as string | undefined) ??
    resolved.result.startupName ??
    "Portfolio company";

  const facts = buildFactsBlock(startupName, resolved.result);
  const intentLine = contentIntent ? `Intent: ${contentIntent}\n\n` : "";

  const customContent = await completeText({
    systemPrompt:
      "You are a VC compliance analyst. Write the requested document using only the provided screening facts. " +
      "Never confirm guilt or sanctions violations. Use Markdown formatting.",
    user: `Write a ${docType.replace(/_/g, " ")} document.\n\n${intentLine}Screening facts:\n${facts}`,
    maxTokens: 1200,
  });

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const title = `${docType.replace(/_/g, " ")} — ${startupName} — ${dateStr}`;

  const doc = await StartupDocument.create({
    startupId: resolved.id,
    kind: "custom" as const,
    title,
    content: customContent,
    screeningScreenedAt: resolved.result.screenedAt ?? null,
  });

  const docId = String((doc as unknown as Record<string, unknown>)._id);

  await AuditLog.create({
    startupId: resolved.id,
    eventType: "document_generated",
    performedBy: ctx.userId ?? "system",
    performedByEmail: ctx.userEmail ?? "system@local",
    details: { documentId: docId, title, docType },
  }).catch(() => {});

  const docResult: ToolDocumentResult = {
    id: docId,
    startupId: resolved.id,
    kind: "screening_analysis", // ToolDocumentResult kind union — frontend handles display
    title,
    downloadUrl: `/api/documents/${docId}/download`,
  };

  return {
    content: `Document "${title}" saved. A download card will appear in chat — reply with one short confirmation sentence only.`,
    document: docResult,
  };
}

// ── Built-in doc type handlers ────────────────────────────────────────────────

const icMemoHandler: DocTypeHandler = {
  name: "ic_memo",
  routingExample: "IC memo, investment committee memo, IC compliance memo",
  handle: async ({ resolved, ctx }) => {
    const doc = await createIcMemoDocument({
      startupId: resolved.id,
      screeningResult: resolved.result,
      performedBy: ctx.userId,
      performedByEmail: ctx.userEmail,
    });
    return {
      content: `IC Compliance Memo saved. Title: "${doc.title}". A download card will appear in chat — reply with one short confirmation sentence only; do not repeat screening details.`,
      document: toToolDocument(doc),
    };
  },
};

const screeningAnalysisHandler: DocTypeHandler = {
  name: "screening_analysis",
  routingExample: "screening analysis, analyst write-up, analysis document",
  handle: async ({ resolved, ctx }) => {
    const doc = await createScreeningAnalysisDocument({
      startupId: resolved.id,
      screeningResult: resolved.result,
      performedBy: ctx.userId,
      performedByEmail: ctx.userEmail,
    });
    return {
      content: `Screening analysis document saved. Title: "${doc.title}". A download card will appear in chat — reply with one short confirmation sentence only; do not repeat screening details.`,
      document: toToolDocument(doc),
    };
  },
};

// Module-level registry — import this in generateDocumentTool.ts.
// To add a new structured doc type: create a DocTypeHandler and call .register() here.
export const docTypeRegistry = new DocumentTypeRegistry()
  .register(icMemoHandler)
  .register(screeningAnalysisHandler);
