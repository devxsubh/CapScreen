import type { Request, Response } from "express";
import { asBody } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import type { AuditEventType } from "../../models";
import * as auditLogsService from "./auditLogs.service";
import { toAuditLog } from "./auditLogs.serializer";

function startupIdQuery(req: Request): string | undefined {
  return typeof req.query.startupId === "string" ? req.query.startupId : undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  const logs = await auditLogsService.listRecent(currentUser(res).userId, startupIdQuery(req));
  res.json(logs.map(toAuditLog));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const eventType = body.eventType;
  if (typeof eventType !== "string" || !(auditLogsService.CLIENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw badRequest("valid eventType is required");
  }
  const log = await auditLogsService.recordClientEvent(currentUser(res), {
    startupId: typeof body.startupId === "string" && body.startupId ? body.startupId : undefined,
    eventType: eventType as AuditEventType,
    details: body.details as Record<string, unknown> | undefined,
  });
  res.status(201).json(toAuditLog(log));
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  const csv = await auditLogsService.exportCsv(currentUser(res).userId, startupIdQuery(req));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="compliance-audit-log.csv"');
  res.send(csv);
}
