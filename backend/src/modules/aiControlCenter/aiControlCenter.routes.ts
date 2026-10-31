import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as aiController from "./aiControlCenter.controller";

/** /api/ai — AI Control Center: providers, keys, model roles, on-device runtimes. */
export const aiControlCenterRouter = Router();

aiControlCenterRouter.get("/state", asyncHandler(aiController.state));
aiControlCenterRouter.get("/health", asyncHandler(aiController.health));

aiControlCenterRouter.put("/providers/:id", asyncHandler(aiController.saveProvider));
aiControlCenterRouter.delete("/providers/:id", asyncHandler(aiController.removeProvider));
aiControlCenterRouter.put("/providers/:id/key", asyncHandler(aiController.saveKey));
aiControlCenterRouter.delete("/providers/:id/key", asyncHandler(aiController.removeKey));
aiControlCenterRouter.get("/providers/:id/models", asyncHandler(aiController.models));
aiControlCenterRouter.post("/providers/:id/test", asyncHandler(aiController.test));
aiControlCenterRouter.post("/probe-tools", asyncHandler(aiController.probeTools));

aiControlCenterRouter.put("/roles", asyncHandler(aiController.assignRoles));
aiControlCenterRouter.put("/policy", asyncHandler(aiController.policy));

aiControlCenterRouter.get("/local", asyncHandler(aiController.local));
aiControlCenterRouter.post("/local/start", asyncHandler(aiController.startLocal));
aiControlCenterRouter.post("/local/pull", asyncHandler(aiController.pull));
aiControlCenterRouter.delete("/local/models/:name", asyncHandler(aiController.deleteLocalModel));

aiControlCenterRouter.post("/quick-setup/local", asyncHandler(aiController.quickSetupLocal));
aiControlCenterRouter.post("/quick-setup/cloud", asyncHandler(aiController.quickSetupCloud));
