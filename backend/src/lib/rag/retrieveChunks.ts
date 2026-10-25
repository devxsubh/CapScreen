import mongoose from "mongoose";
import { DocChunk } from "../../models/rag/docChunk";
import { embedQuery, isEmbeddingEnabled } from "./embed";

const TOP_K = parseInt(process.env.RAG_TOP_K ?? "6", 10);
const MIN_SCORE = 0.60;

export type RetrievedChunk = {
  filename: string;
  chunkText: string;
  score: number;
  pageNumber: number | null;
};

export async function retrieveRelevantChunks(params: {
  startupId: string;
  query: string;
  topK?: number;
  documentId?: string;
}): Promise<RetrievedChunk[]> {
  const { startupId, query, topK = TOP_K, documentId } = params;

  if (isEmbeddingEnabled()) {
    // Chunks embedded with a different model (dimension mismatch) are skipped
    // by vector search, so fall back to keywords rather than return nothing.
    const hits = await vectorSearch(startupId, query, topK, documentId);
    if (hits.length) return hits;
  }
  return keywordFallback(startupId, query, topK, documentId);
}

async function vectorSearch(
  startupId: string,
  query: string,
  topK: number,
  documentId?: string,
): Promise<RetrievedChunk[]> {
  const queryVector = await embedQuery(query);

  const filter: Record<string, unknown> = {
    startupId: new mongoose.Types.ObjectId(startupId),
  };
  if (documentId) {
    filter.documentId = new mongoose.Types.ObjectId(documentId);
  }

  const pipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "rag_vector_index",
        path: "embedding",
        queryVector,
        numCandidates: topK * 10,
        limit: topK * 2,
        filter,
      },
    } as mongoose.PipelineStage,
    {
      $project: {
        filename: 1,
        chunkText: 1,
        pageNumber: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  type VectorRow = { filename: string; chunkText: string; pageNumber: number | null; score: number };
  const rows = (await DocChunk.aggregate(pipeline)) as VectorRow[];

  return rows
    .filter((r) => r.score >= MIN_SCORE)
    .slice(0, topK)
    .map((r) => ({
      filename: r.filename,
      chunkText: r.chunkText,
      score: r.score,
      pageNumber: r.pageNumber ?? null,
    }));
}

async function keywordFallback(
  startupId: string,
  query: string,
  topK: number,
  documentId?: string,
): Promise<RetrievedChunk[]> {
  const filter: Record<string, unknown> = {
    startupId: new mongoose.Types.ObjectId(startupId),
  };
  if (documentId) {
    filter.documentId = new mongoose.Types.ObjectId(documentId);
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return [];

  const chunks = await DocChunk.find(filter)
    .select("filename chunkText pageNumber")
    .limit(300)
    .lean();

  type ScoredChunk = { filename: string; chunkText: string; pageNumber: number | null; score: number };
  const scored: ScoredChunk[] = chunks
    .map((c) => {
      const lower = c.chunkText.toLowerCase();
      const matched = terms.filter((t) => lower.includes(t)).length;
      return { filename: c.filename, chunkText: c.chunkText, pageNumber: c.pageNumber ?? null, score: matched / terms.length };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
