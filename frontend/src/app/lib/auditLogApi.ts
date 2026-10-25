import { getAuthHeaders } from "@/lib/apiAuth";
import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

export interface AuditLogEntry {
  id: string;
  startupId: string | null;
  eventType:
    | "screening_completed"
    | "csv_uploaded"
    | "csv_updated"
    | "entity_reviewed"
    | "portfolio_reviewed"
    | "ic_memo_generated"
    | "screening_analysis_generated"
    | "document_generated"
    | "document_uploaded"
    | "document_deleted";
  performedBy: string;
  performedByEmail: string;
  details: Record<string, unknown>;
  createdAt: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const { headers: initHeaders, ...restInit } = init ?? {};
  const resp = await fetch(`${API_BASE}${path}`, {
    ...restInit,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(initHeaders as Record<string, string> | undefined),
    },
  });
  if (resp.status === 204) return undefined as T;
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<T>;
}

export const listAuditLogs = (startupId?: string) =>
  api<AuditLogEntry[]>(
    `/api/audit-logs${startupId ? `?startupId=${encodeURIComponent(startupId)}` : ""}`,
  );

export const createAuditLog = (entry: {
  startupId?: string;
  eventType: AuditLogEntry["eventType"];
  details?: Record<string, unknown>;
}) =>
  api<AuditLogEntry>("/api/audit-logs", {
    method: "POST",
    body: JSON.stringify(entry),
  });

export function auditLogExportUrl(startupId?: string): string {
  const q = startupId ? `?startupId=${encodeURIComponent(startupId)}` : "";
  return `${API_BASE}/api/audit-logs/export${q}`;
}
