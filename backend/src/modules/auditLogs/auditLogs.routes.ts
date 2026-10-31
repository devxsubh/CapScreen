import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as auditLogsController from "./auditLogs.controller";

/** /api/audit-logs */
export const auditLogsRouter = Router();

auditLogsRouter.get("/", asyncHandler(auditLogsController.list));
auditLogsRouter.post("/", asyncHandler(auditLogsController.create));
auditLogsRouter.get("/export", asyncHandler(auditLogsController.exportCsv));
