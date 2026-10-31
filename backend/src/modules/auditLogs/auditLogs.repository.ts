import { AuditLog, type AuditEventType } from "../../models";

export type AuditLogRecord = Record<string, unknown>;

export type NewAuditEvent = {
  startupId: string | null;
  eventType: AuditEventType;
  performedBy: string;
  performedByEmail: string;
  details: Record<string, unknown>;
};

export async function create(event: NewAuditEvent): Promise<AuditLogRecord> {
  const doc = await AuditLog.create(event);
  return doc.toObject() as AuditLogRecord;
}

export async function find(
  filter: Record<string, unknown>,
  options: { newestFirst: boolean; limit?: number },
): Promise<AuditLogRecord[]> {
  const query = AuditLog.find(filter).sort({ createdAt: options.newestFirst ? -1 : 1 });
  if (options.limit) query.limit(options.limit);
  return (await query.lean()) as AuditLogRecord[];
}
