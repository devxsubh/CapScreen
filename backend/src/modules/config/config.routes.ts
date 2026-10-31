import { Router } from "express";
import { isWebSearchEnabled } from "../../lib/infra/webSearchConfig";
import { describeLlmConfig } from "../../lib/llm/providers";
import { isEmbeddingEnabled } from "../../lib/rag/embed";
import { getScreeningThresholds } from "../../lib/screening/screeningConfig";

/** /api/config — public runtime config: provider/model names only, never keys. */
export const configRouter = Router();

configRouter.get("/", (_req, res) => {
  res.json({
    llm: describeLlmConfig(),
    screening: getScreeningThresholds(),
    ragEnabled: isEmbeddingEnabled(),
    webSearchEnabled: isWebSearchEnabled(),
  });
});
