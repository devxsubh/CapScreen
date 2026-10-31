import type { AuditLogRecord } from "./auditLogs.repository";

export function toAuditLog(doc: AuditLogRecord) {
  return {
    id: String(doc._id),
    startupId: doc.startupId ?? null,
    eventType: doc.eventType,
    performedBy: doc.performedBy,
    performedByEmail: doc.performedByEmail,
    details: doc.details ?? {},
    createdAt: doc.createdAt,
  };
}
