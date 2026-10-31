import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as assistantController from "./assistant.controller";

/** /chat — the compliance assistant agent (Server-Sent Events). */
export const assistantRouter = Router();

assistantRouter.post("/", asyncHandler(assistantController.chat));
assistantRouter.post("/create", asyncHandler(assistantController.create));
assistantRouter.post("/runs/:runId/resume", asyncHandler(assistantController.resume));
