import express, { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as desktopController from "./desktop.controller";

/** /api/desktop — settings, sanctions data, backup/restore, watched folders, verified audit export. */
export const desktopRouter = Router();

desktopRouter.get("/settings", asyncHandler(desktopController.getSettings));
desktopRouter.put("/settings", asyncHandler(desktopController.updateSettings));
desktopRouter.post("/erase", asyncHandler(desktopController.erase));
desktopRouter.get("/sanctions", asyncHandler(desktopController.sanctions));
desktopRouter.post("/backup", asyncHandler(desktopController.backup));
desktopRouter.post(
  "/restore",
  express.raw({ type: "application/octet-stream", limit: "2gb" }),
  asyncHandler(desktopController.restore),
);
desktopRouter.get("/watch-folders/:startupId", asyncHandler(desktopController.getWatchFolder));
desktopRouter.put("/watch-folders/:startupId", asyncHandler(desktopController.setWatchFolder));
desktopRouter.get("/audit-export", asyncHandler(desktopController.auditExport));
