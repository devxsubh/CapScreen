import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as startupsController from "./startups.controller";

/** /api/startups — the collection. */
export const startupCollectionRouter = Router();

startupCollectionRouter.get("/", asyncHandler(startupsController.list));
startupCollectionRouter.post("/", asyncHandler(startupsController.create));
startupCollectionRouter.get("/screening-summary", asyncHandler(startupsController.screeningSummary));
startupCollectionRouter.post("/rescreen-all", asyncHandler(startupsController.rescreenAll));

/** /api/startups/:id — one startup (mounted behind requireStartupAccess). */
export const startupRouter = Router({ mergeParams: true });

startupRouter.get("/", asyncHandler(startupsController.get));
startupRouter.patch("/", asyncHandler(startupsController.rename));
startupRouter.delete("/", asyncHandler(startupsController.remove));
