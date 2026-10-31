import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import { requireWritableStartup } from "../startups/startupAccess";
import * as screeningController from "./screening.controller";

/** /api/startups/:id/{screen,screening-delta,screening-report} */
export const startupScreeningRouter = Router({ mergeParams: true });

startupScreeningRouter.post("/screen", requireWritableStartup, asyncHandler(screeningController.screen));
startupScreeningRouter.get("/screening-delta", asyncHandler(screeningController.delta));
startupScreeningRouter.get("/screening-report", asyncHandler(screeningController.report));

/** /api/screen — on-demand narrative for one entity. */
export const screenRouter = Router();

screenRouter.post("/explain", asyncHandler(screeningController.explain));
