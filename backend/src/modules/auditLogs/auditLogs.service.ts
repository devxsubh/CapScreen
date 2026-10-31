import crypto from "crypto";
import mongoose from "mongoose";
import { badRequest, notFound } from "../../http/httpError";
import type { CurrentUser } from "../../http/currentUser";
import type { AuditEventType } from "../../models";
import * as startupsRepository from "../startups/startups.repository";
import * as auditLogsRepository from "./auditLogs.repository";
import type { AuditLogRecord } from "./auditLogs.repository";

/** Event types the frontend may record directly; the rest are written by the server. */
export const CLIENT_EVENT_TYPES = [
  "screening_completed",
  "csv_uploaded",
  "csv_updated",
  "entity_reviewed",
  "portfolio_reviewed",
] as const;

/** Writes one compliance record attributed to `user`. */
export async function recordAuditEvent(
  user: CurrentUser,
  eventType: AuditEventType,
  startupId: string | null,
  details: Record<string, unknown> = {},
): Promise<AuditLogRecord> {
  return auditLogsRepository.create({
    startupId,
    eventType,
    performedBy: user.userId,
    performedByEmail: user.userEmail,
    details,
  });
}

/** The user's own entries, optionally limited to one of their startups. */
async function scopedFilter(userId: string, startupId?: string): Promise<Record<string, unknown>> {
  if (!startupId) return { performedBy: userId };
  if (!mongoose.Types.ObjectId.isValid(startupId)) throw badRequest("Invalid startupId");
  if (!(await startupsRepository.findOwned(startupId, userId))) throw notFound("Startup not found");
  return { performedBy: userId, startupId };
}

export async function listRecent(userId: string, startupId?: string): Promise<AuditLogRecord[]> {
  return auditLogsRepository.find(await scopedFilter(userId, startupId), { newestFirst: true, limit: 100 });
}

export async function recordClientEvent(
  user: CurrentUser,
  input: { startupId?: string; eventType: AuditEventType; details?: Record<string, unknown> },
): Promise<AuditLogRecord> {
  if (input.startupId) await scopedFilter(user.userId, input.startupId);
  return recordAuditEvent(user, input.eventType, input.startupId ?? null, input.details ?? {});
}

export async function exportCsv(userId: string, startupId?: string): Promise<string> {
  const logs = await auditLogsRepository.find(await scopedFilter(userId, startupId), { newestFirst: true, limit: 500 });
  const header = "id,startupId,eventType,performedBy,performedByEmail,createdAt,details\n";
  const rows = logs.map((d) => {
    const details = JSON.stringify(d.details ?? {}).replace(/"/g, '""');
    return [
      String(d._id),
      d.startupId ? String(d.startupId) : "",
      d.eventType,
      d.performedBy,
      d.performedByEmail,
      new Date(d.createdAt as Date).toISOString(),
      `"${details}"`,
    ].join(",");
  });
  return header + rows.join("\n");
}

const GENESIS_HASH = "0".repeat(64);

/**
 * Tamper-evident export: every entry carries sha256(prev_hash + entry),
 * and the final hash seals the file. Changing, removing or reordering any line
 * breaks the chain from that point on.
 */
export async function buildVerifiedExport(startupId?: string) {
  const logs = await auditLogsRepository.find(startupId ? { startupId } : {}, { newestFirst: false });

  let prev = GENESIS_HASH;
  const entries = logs.map((d) => {
    const entry = {
      id: String(d._id),
      startupId: d.startupId ? String(d.startupId) : null,
      eventType: d.eventType,
      performedBy: d.performedBy,
      createdAt: new Date(d.createdAt as Date).toISOString(),
      details: d.details ?? {},
    };
    const hash = crypto.createHash("sha256").update(prev + JSON.stringify(entry)).digest("hex");
    prev = hash;
    return { ...entry, hash };
  });

  return {
    format: "capscreen-audit-v1",
    exportedAt: new Date().toISOString(),
    scope: startupId ? { startupId } : "all",
    count: entries.length,
    chain: { algorithm: "sha256(prevHash + JSON(entry))", genesis: GENESIS_HASH, finalHash: prev },
    entries,
  };
}
