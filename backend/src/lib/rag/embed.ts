import { getLlm, hasLlmRole } from "../llm/providers";

const EMBED_BATCH_SIZE = parseInt(process.env.RAG_EMBED_BATCH_SIZE ?? "16", 10);

/**
 * Embeddings go through the "embedding" model role — e.g. nomic-embed-text in
 * Ollama (on-device) or a cloud embedding model chosen in the AI Control Center.
 * With no embedding model configured, chunks get empty vectors and retrieval
 * uses keyword search.
 */
export function isEmbeddingEnabled(): boolean {
  if (!hasLlmRole("embedding")) return false;
  return !!getLlm("embedding").provider.embed;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!isEmbeddingEnabled()) return texts.map(() => []);
  const llm = getLlm("embedding");

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    results.push(...(await llm.provider.embed!(llm.model, batch)));
  }
  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector ?? [];
}

export function logRagStartupWarnings(): void {
  if (isEmbeddingEnabled()) {
    const llm = getLlm("embedding");
    console.log(`[rag] embeddings: ${llm.providerId}/${llm.model}${llm.local ? " (local)" : ""}`);
    return;
  }
  console.warn("[rag] no embedding model configured — document search uses keyword matching");
}
