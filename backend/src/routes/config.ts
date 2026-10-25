import express from "express";
import { describeLlmConfig } from "../lib/llm/providers";
import { getScreeningThresholds } from "../lib/screening/screeningConfig";
import { isEmbeddingEnabled } from "../lib/rag/embed";
import { isWebSearchEnabled } from "../lib/infra/webSearchConfig";

export const configRouter = express.Router();

/** Public runtime config — provider/model names only, never keys. */
configRouter.get("/", (_req, res) => {
  res.json({
    llm: describeLlmConfig(),
    screening: getScreeningThresholds(),
    ragEnabled: isEmbeddingEnabled(),
    webSearchEnabled: isWebSearchEnabled(),
  });
});
