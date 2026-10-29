import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import mongoose from "mongoose";
import { RagDocument } from "../../models/rag/ragDocument";
import { DocChunk } from "../../models/rag/docChunk";
import { retrieveRelevantChunks } from "../rag/retrieveChunks";
import { extractEntitiesFromText } from "../rag/extractEntities";
import { searchWatchman } from "../screening/watchman";
import { classifyScore } from "../screening/classify";
import { coalesceStartupId } from "../shared/startupId";
import { wrapEntityName } from "../shared/promptDelimiters";
import type { ToolDefinition } from "./registry";

// Packaged desktop app: the shell points this at the bundled copy.
const CORPUS_DIR = process.env.CAPSCREEN_CORPUS_DIR ?? join(__dirname, "../../compliance-corpus");

function searchCorpus(query: string): string {
  let files: string[];
  try {
    files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return "Compliance corpus not found. No policy documents are indexed.";
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  type Hit = { file: string; score: number; excerpt: string };
  const hits: Hit[] = [];

  for (const file of files) {
    const text = readFileSync(join(CORPUS_DIR, file), "utf-8");
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const matched = terms.filter((t) => line.includes(t));
      if (matched.length === 0) continue;

      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 4);
      const excerpt = lines.slice(start, end + 1).join("\n").trim();
      hits.push({ file, score: matched.length, excerpt });
    }
  }

  if (hits.length === 0) {
    return `No policy documents matched your query: "${query}". Try different keywords.`;
  }

  hits.sort((a, b) => b.score - a.score);
  return hits
    .slice(0, 3)
    .map((h) => `**Source: ${h.file}**\n${h.excerpt}`)
    .join("\n\n---\n\n");
}

export const searchCompliancePlaybookTool: ToolDefinition = {
  name: "search_compliance_playbook",
  readOnly: true,
  schema: {
    name: "search_compliance_playbook",
    description:
      "Search the firm's compliance policy corpus (OFAC escalation playbook, review-tier guidance, etc.) for answers to policy questions. Call this when the user asks what to do in a specific compliance scenario (e.g. '85% match', 'review tier', 'escalation', 'UBO', 'record keeping').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords or question to search the compliance corpus",
        },
      },
      required: ["query"],
    },
  },
  handler: async (input, _ctx) => {
    const args = input as { query?: string };
    const q = args.query?.trim();
    if (!q) return { content: "Error: query is required." };
    return { content: searchCorpus(q) };
  },
  routingHint: `### search_compliance_playbook
Call when the user asks a policy or procedure question:
- "what do we do for an 85% match?" → search_compliance_playbook
- "what is our escalation procedure?" → search_compliance_playbook
- "review tier guidance", "UBO record keeping" → search_compliance_playbook`,
};

export const listStartupDocumentsTool: ToolDefinition = {
  name: "list_startup_documents",
  readOnly: true,
  schema: {
    name: "list_startup_documents",
    description:
      "List documents uploaded to a startup workspace (PDFs, Word docs, CSVs). Returns document ids, filenames, and processing status. Call this first when the user asks about uploaded documents or wants to screen entities from a specific file.",
    input_schema: {
      type: "object",
      properties: {
        startup_id: {
          type: "string",
          description: "Startup id. Omit to use the active workspace.",
        },
      },
    },
  },
  handler: async (input, ctx) => {
    const args = input as { startup_id?: string };
    const sid = coalesceStartupId(args.startup_id, ctx.startupId);
    if (!sid) {
      return {
        content:
          "No startup workspace active. Open a startup page or pass startup_id.",
      };
    }
    const docs = await RagDocument.find({
      startupId: new mongoose.Types.ObjectId(sid),
    })
      .sort({ uploadedAt: -1 })
      .limit(50)
      .lean();
    if (docs.length === 0) {
      return {
        content:
          "No documents uploaded to this startup yet. Upload PDFs or Word docs via the Documents section.",
      };
    }
    const lines = docs.map((d) => {
      const statusTag =
        d.status === "ready"
          ? `✓ ready (${d.chunkCount} chunks)`
          : d.status === "processing"
            ? "⏳ indexing"
            : `✗ error: ${d.errorMessage ?? "unknown"}`;
      return `- ${d.filename} | id: ${String(d._id)} | ${statusTag} | uploaded: ${new Date(d.uploadedAt as Date).toISOString().slice(0, 10)}`;
    });
    return { content: `Documents for startup ${sid}:\n${lines.join("\n")}` };
  },
  routingHint: `### Document tools (list_startup_documents → search_startup_documents / screen_document_entities)
- User asks about uploaded document content → list_startup_documents first, then search_startup_documents
- User wants to sanction-screen entities in a PDF/Word doc → list_startup_documents first, then screen_document_entities
- Always cite source filename and page number when quoting excerpts.`,
};

export const searchStartupDocumentsTool: ToolDefinition = {
  name: "search_startup_documents",
  readOnly: true,
  schema: {
    name: "search_startup_documents",
    description:
      "Semantic search over documents uploaded to a startup workspace (PDFs, Word docs, CSVs, agreements, UBO declarations, term sheets). Call this when the user asks questions about the content of uploaded documents — e.g. 'what does the SHA say about transfer restrictions?' or 'find all mentions of board seats'.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language question or keyword search against document content",
        },
        startup_id: {
          type: "string",
          description: "Startup id. Omit to use the active workspace.",
        },
        document_id: {
          type: "string",
          description:
            "Scope search to one document. Get the id from list_startup_documents.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (input, ctx) => {
    const args = input as {
      query?: string;
      startup_id?: string;
      document_id?: string;
    };
    const q = args.query?.trim();
    if (!q) return { content: "Error: query is required." };
    const sid = coalesceStartupId(args.startup_id, ctx.startupId);
    if (!sid) {
      return {
        content:
          "No startup workspace active. Open a startup page or pass startup_id.",
      };
    }
    const chunks = await retrieveRelevantChunks({
      startupId: sid,
      query: q,
      documentId: args.document_id?.trim() || undefined,
    });
    if (chunks.length === 0) {
      return {
        content: `No document content matched "${q}". Try different keywords or call list_startup_documents to verify documents are ready.`,
      };
    }
    const body = chunks
      .map((c, i) => {
        const page = c.pageNumber != null ? ` (p.${c.pageNumber})` : "";
        const score = (c.score * 100).toFixed(0);
        return `[${i + 1}] Source: ${c.filename}${page} — relevance ${score}%\n${c.chunkText}`;
      })
      .join("\n\n---\n\n");
    return { content: `Relevant excerpts:\n\n${body}` };
  },
};

export const screenDocumentEntitiesTool: ToolDefinition = {
  name: "screen_document_entities",
  schema: {
    name: "screen_document_entities",
    description:
      "Extract all named persons and companies from an uploaded document and screen them against Watchman sanctions lists. Use this when the user wants to sanction-check a PDF or Word doc (e.g. UBO declaration, shareholder agreement, LP list). Requires document_id from list_startup_documents.",
    input_schema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "RagDocument id from list_startup_documents",
        },
        startup_id: {
          type: "string",
          description: "Startup id. Omit to use the active workspace.",
        },
      },
      required: ["document_id"],
    },
  },
  handler: async (input, ctx) => {
    const args = input as { document_id?: string; startup_id?: string };
    const docId = args.document_id?.trim();
    if (!docId) {
      return {
        content:
          "Error: document_id is required. Call list_startup_documents first.",
      };
    }

    const sid = coalesceStartupId(args.startup_id, ctx.startupId);
    const ragDoc = await RagDocument.findOne(
      sid
        ? { _id: docId, startupId: new mongoose.Types.ObjectId(sid) }
        : { _id: docId },
    ).lean();
    if (!ragDoc) {
      return {
        content: `Document ${docId} not found. Call list_startup_documents to get valid ids.`,
      };
    }
    if (ragDoc.status !== "ready") {
      return {
        content: `Document "${ragDoc.filename}" is not ready (status: ${ragDoc.status}). Wait for indexing to complete.`,
      };
    }

    const chunks = await DocChunk.find({
      documentId: new mongoose.Types.ObjectId(docId),
    })
      .sort({ chunkIndex: 1 })
      .select("chunkText")
      .lean();
    let fullText = chunks.map((c) => c.chunkText).join("\n\n");
    if (fullText.length > 18000) fullText = fullText.slice(0, 18000) + "\n…[truncated]";

    const entities = await extractEntitiesFromText(fullText, ragDoc.filename);
    if (entities.length === 0) {
      return {
        content: `No named persons or companies found in "${ragDoc.filename}". The document may be a template or contain only generic terms.`,
      };
    }

    type EntityResult = {
      name: string;
      type: string;
      context: string;
      riskLevel: string;
      topScore: number | null;
      topMatch: string | null;
    };
    const results: EntityResult[] = [];
    for (const entity of entities) {
      try {
        const matches = await searchWatchman(entity.name, entity.type);
        const topScore = matches.length > 0 ? matches[0].match : null;
        const riskLevel = classifyScore(topScore);
        results.push({
          name: entity.name,
          type: entity.type,
          context: entity.context,
          riskLevel,
          topScore,
          topMatch: matches.length > 0 ? matches[0].sdnName : null,
        });
      } catch {
        results.push({
          name: entity.name,
          type: entity.type,
          context: entity.context,
          riskLevel: "error",
          topScore: null,
          topMatch: null,
        });
      }
    }

    const flagged = results.filter((r) => r.riskLevel === "flagged");
    const review = results.filter((r) => r.riskLevel === "review");
    const clear = results.filter((r) => r.riskLevel === "clear");

    const lines: string[] = [
      `**Document entity screening: "${ragDoc.filename}"**`,
      `Entities found: ${results.length} | Flagged: ${flagged.length} | Review: ${review.length} | Clear: ${clear.length}`,
      "",
    ];

    if (flagged.length > 0) {
      lines.push("### Flagged");
      for (const e of flagged) {
        lines.push(
          `- **${wrapEntityName(e.name)}** (${e.type}) — ${((e.topScore ?? 0) * 100).toFixed(0)}% match vs ${e.topMatch ?? "—"}\n  Context: ${e.context}`,
        );
      }
      lines.push("");
    }
    if (review.length > 0) {
      lines.push("### Review");
      for (const e of review) {
        lines.push(
          `- **${wrapEntityName(e.name)}** (${e.type}) — ${((e.topScore ?? 0) * 100).toFixed(0)}% match vs ${e.topMatch ?? "—"}\n  Context: ${e.context}`,
        );
      }
      lines.push("");
    }
    if (clear.length > 0) {
      lines.push(
        `### Clear (${clear.length} entities — no sanctions matches above threshold)`,
      );
    }

    return { content: lines.join("\n") };
  },
};
