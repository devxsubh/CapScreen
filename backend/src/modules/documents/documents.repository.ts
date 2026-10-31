import mongoose from "mongoose";
import { DocChunk, RagDocument, StartupDocument, StoredDocument, type IRagDocument } from "../../models";

/**
 * Data access for the three kinds of document:
 *  - stored documents: files the user uploaded (optionally to a project)
 *  - generated documents: IC memos and analyses written from a screening
 *  - RAG documents: startup files parsed into searchable chunks
 */

export type DocumentRecord = Record<string, unknown>;

/** A RAG document's stored fields. */
export type RagDocumentRecord = Pick<
  IRagDocument,
  "startupId" | "filename" | "mimeType" | "uploadedBy" | "uploadedAt" | "storageKey" | "sizeBytes" | "chunkCount" | "status" | "errorMessage"
> & { _id: unknown };

// ── Stored documents ─────────────────────────────────────────────────────────

export async function listStored(ownerId: string, projectId: string | null): Promise<DocumentRecord[]> {
  return (await StoredDocument.find({ ownerId, projectId }).sort({ createdAt: -1 }).lean()) as DocumentRecord[];
}

export async function findStored(id: string, ownerId: string): Promise<DocumentRecord | null> {
  return (await StoredDocument.findOne({ _id: id, ownerId }).lean()) as DocumentRecord | null;
}

export async function createStored(fields: Record<string, unknown>): Promise<DocumentRecord> {
  return (await StoredDocument.create(fields)).toObject() as DocumentRecord;
}

export async function setStoredKey(id: unknown, storageKey: string): Promise<void> {
  await StoredDocument.updateOne({ _id: id }, { $set: { storageKey } });
}

export async function removeStored(id: unknown): Promise<void> {
  await StoredDocument.deleteOne({ _id: id });
}

/** Deletes one of the owner's documents and returns it (for its storage key). */
export async function deleteStored(id: string, ownerId: string): Promise<DocumentRecord | null> {
  return (await StoredDocument.findOneAndDelete({ _id: id, ownerId }).lean()) as DocumentRecord | null;
}

// ── Generated documents ──────────────────────────────────────────────────────

export async function findGenerated(id: string): Promise<DocumentRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await StartupDocument.findById(id).lean()) as DocumentRecord | null;
}

export async function createGenerated(fields: {
  startupId: string;
  kind: string;
  title: string;
  content: string;
  screeningScreenedAt: unknown;
}): Promise<DocumentRecord> {
  return (await StartupDocument.create(fields)).toObject() as DocumentRecord;
}

/** Newest first. */
export async function listGenerated(startupId: string, kind: string): Promise<DocumentRecord[]> {
  return (await StartupDocument.find({ startupId, kind }).sort({ createdAt: -1 }).lean()) as DocumentRecord[];
}

export async function findGeneratedInStartup(id: string, startupId: string): Promise<DocumentRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await StartupDocument.findOne({ _id: id, startupId }).lean()) as DocumentRecord | null;
}

export async function deleteGeneratedForStartup(startupId: string): Promise<void> {
  await StartupDocument.deleteMany({ startupId });
}

// ── RAG documents ────────────────────────────────────────────────────────────

/** Newest first. */
export async function listRag(startupId: string, limit?: number): Promise<RagDocumentRecord[]> {
  const query = RagDocument.find({ startupId: new mongoose.Types.ObjectId(startupId) }).sort({ uploadedAt: -1 });
  if (limit) query.limit(limit);
  return (await query.lean()) as unknown as RagDocumentRecord[];
}

/** A RAG document by id, limited to one startup when given. */
export async function findRag(id: string, startupId?: string): Promise<RagDocumentRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const filter = startupId ? { _id: id, startupId: new mongoose.Types.ObjectId(startupId) } : { _id: id };
  return (await RagDocument.findOne(filter).lean()) as unknown as RagDocumentRecord | null;
}

/** Indexing progress: status, chunkCount, errorMessage. */
export async function updateRag(id: string, fields: Record<string, unknown>): Promise<void> {
  await RagDocument.findByIdAndUpdate(id, fields);
}

export async function createRag(fields: Record<string, unknown>): Promise<DocumentRecord> {
  return (await RagDocument.create(fields)).toObject() as unknown as DocumentRecord;
}

export async function setRagKey(id: unknown, storageKey: string): Promise<void> {
  await RagDocument.updateOne({ _id: id }, { $set: { storageKey } });
}

export async function removeRag(id: unknown): Promise<void> {
  await RagDocument.deleteOne({ _id: id });
}

/** Deletes a startup's document and its search chunks; returns the document. */
export async function deleteRag(id: string, startupId: string): Promise<DocumentRecord | null> {
  const doc = (await RagDocument.findOneAndDelete({ _id: id, startupId }).lean()) as DocumentRecord | null;
  if (doc) await DocChunk.deleteMany({ documentId: new mongoose.Types.ObjectId(id) });
  return doc;
}

// ── RAG chunks ───────────────────────────────────────────────────────────────

export type ChunkHit = { filename: string; chunkText: string; pageNumber: number | null; score: number };

export async function insertChunks(chunks: Record<string, unknown>[]): Promise<void> {
  await DocChunk.insertMany(chunks, { ordered: false });
}

/** The document's text, chunk by chunk, in order. */
export async function listChunkTexts(documentId: string): Promise<string[]> {
  const chunks = await DocChunk.find({ documentId: new mongoose.Types.ObjectId(documentId) })
    .sort({ chunkIndex: 1 })
    .select("chunkText")
    .lean();
  return chunks.map((c) => c.chunkText);
}

function chunkFilter(startupId: string, documentId?: string): Record<string, unknown> {
  return {
    startupId: new mongoose.Types.ObjectId(startupId),
    ...(documentId ? { documentId: new mongoose.Types.ObjectId(documentId) } : {}),
  };
}

/** Nearest chunks by embedding ($vectorSearch; in-process cosine on SQLite). */
export async function vectorSearchChunks(
  startupId: string,
  queryVector: number[],
  limit: number,
  documentId?: string,
): Promise<ChunkHit[]> {
  const pipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "rag_vector_index",
        path: "embedding",
        queryVector,
        numCandidates: limit * 5,
        limit,
        filter: chunkFilter(startupId, documentId),
      },
    } as mongoose.PipelineStage,
    { $project: { filename: 1, chunkText: 1, pageNumber: 1, score: { $meta: "vectorSearchScore" } } },
  ];
  return (await DocChunk.aggregate(pipeline)) as ChunkHit[];
}

/** Candidate chunks for keyword scoring (no embeddings needed). */
export async function listChunksForKeywordSearch(
  startupId: string,
  limit: number,
  documentId?: string,
): Promise<Array<{ filename: string; chunkText: string; pageNumber?: number | null }>> {
  return DocChunk.find(chunkFilter(startupId, documentId)).select("filename chunkText pageNumber").limit(limit).lean();
}
