import * as documentsRepository from "../../modules/documents/documents.repository";
import { parseDocumentToText } from "./parseDocument";
import { chunkText } from "./chunkText";
import { embedTexts } from "./embed";
import mongoose from "mongoose";

const MAX_WORDS = parseInt(process.env.RAG_CHUNK_MAX_TOKENS ?? "450", 10);
const OVERLAP_WORDS = Math.floor(MAX_WORDS * 0.15);

export async function ingestDocument(params: {
  startupId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<void> {
  const { startupId, documentId, filename, mimeType, buffer } = params;

  try {
    // 1. Parse to text pages
    const pages = await parseDocumentToText(buffer, mimeType, filename);
    if (pages.length === 0) {
      await documentsRepository.updateRag(documentId, {
        status: "error",
        errorMessage: "Document parsed to empty text — no content found.",
      });
      return;
    }

    // 2. Chunk each page
    type RawChunk = { text: string; pageNum: number | null; index: number };
    const rawChunks: RawChunk[] = [];
    let globalIndex = 0;
    for (const page of pages) {
      const chunks = chunkText(page.text, {
        maxWords: MAX_WORDS,
        overlapWords: OVERLAP_WORDS,
      });
      for (const text of chunks) {
        rawChunks.push({ text, pageNum: page.pageNum, index: globalIndex++ });
      }
    }

    if (rawChunks.length === 0) {
      await documentsRepository.updateRag(documentId, {
        status: "error",
        errorMessage: "No text chunks produced from document.",
      });
      return;
    }

    // 3. Embed all chunks
    const embeddings = await embedTexts(rawChunks.map((c) => c.text));

    // 4. Bulk insert chunks
    const docs = rawChunks.map((c, i) => ({
      startupId: new mongoose.Types.ObjectId(startupId),
      documentId: new mongoose.Types.ObjectId(documentId),
      filename,
      mimeType,
      chunkIndex: c.index,
      chunkText: c.text,
      embedding: embeddings[i] ?? [],
      pageNumber: c.pageNum,
      createdAt: new Date(),
    }));

    await documentsRepository.insertChunks(docs);

    // 5. Mark ready
    await documentsRepository.updateRag(documentId, {
      status: "ready",
      chunkCount: docs.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await documentsRepository.updateRag(documentId, {
      status: "error",
      errorMessage: msg.slice(0, 500),
    }).catch(() => {});
  }
}
