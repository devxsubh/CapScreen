import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import { requireWritableStartup } from "../startups/startupAccess";
import * as capTablesController from "./capTables.controller";

/** /api/startups/analyze-csv — preview a CSV before any startup exists. */
export const csvPreviewRouter = Router();

csvPreviewRouter.post("/", asyncHandler(capTablesController.preview));

/** /api/startups/:id/csvs */
export const capTablesRouter = Router({ mergeParams: true });

capTablesRouter.get("/", asyncHandler(capTablesController.list));
capTablesRouter.post("/", requireWritableStartup, asyncHandler(capTablesController.upload));
capTablesRouter.post("/analyze", asyncHandler(capTablesController.preview));
capTablesRouter.patch("/:csvId", asyncHandler(capTablesController.update));
capTablesRouter.delete("/:csvId", asyncHandler(capTablesController.remove));
