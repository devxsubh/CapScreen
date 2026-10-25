import { getAuthHeaders } from "@/lib/apiAuth";
import type { ScreenPurpose } from "./screenerInitialPrompt";
import type {
  ColumnMapping,
  CsvIngestAnalysis,
  CsvKind,
  ParseError,
  ParseSource,
  ParseStatus,
  RosterPurpose,
  ScreeningResult,
} from "./screenerTypes";
import {
  startupListCache,
  startupDetailCache,
  csvListCache,
  CLIENT_TTL,
} from "./apiCache";
import { dedup } from "./requestDedup";
import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

export interface StartupRecord {
  id: string;
  name: string;
  createdAt: string;
  latestCsvId?: string | null;
  latestCsvByPurpose?: Record<string, string>;
  lastScreeningResult?: ScreeningResult | null;
  lastScreenedAt?: string | null;
  lastScreenedCsvId?: string | null;
  lastCoInvestorScreeningResult?: ScreeningResult | null;
  lastCoInvestorScreenedAt?: string | null;
  lastVendorScreeningResult?: ScreeningResult | null;
  lastVendorScreenedAt?: string | null;
  portfolioReviewStatus?: string;
  portfolioReviewNotes?: string | null;
  isSample?: boolean;
}

export interface ScreeningDelta {
  hasPrevious: boolean;
  previousScreenedAt: string | null;
  changes: Array<{
    entityName: string;
    previousRisk: string | null;
    newRisk: string;
  }>;
  summary: string;
}

export interface CsvRecord {
  id: string;
  startupId: string;
  filename: string;
  content: string;
  uploadedAt: string;
  parseStatus: ParseStatus;
  parseErrors: ParseError[];
  recordCount: number;
  csvKind?: CsvKind | null;
  parseSource?: ParseSource | null;
  confidence?: number | null;
  columnMapping?: ColumnMapping | null;
  normalizedContent?: string | null;
  ingestWarnings?: string[];
  rosterPurpose?: RosterPurpose;
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

// ── Startups ────────────────────────────────────────────────────────────────

export function listStartups(): Promise<StartupRecord[]> {
  return dedup("startups:list", async () => {
    const cached = startupListCache.get("startups");
    if (cached) return cached as StartupRecord[];
    const result = await api<StartupRecord[]>("/api/startups");
    startupListCache.set("startups", result, CLIENT_TTL.startupList);
    return result;
  });
}

export async function createStartup(name: string): Promise<StartupRecord> {
  const result = await api<StartupRecord>("/api/startups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  startupListCache.delete("startups");
  return result;
}

export function getStartup(id: string): Promise<StartupRecord> {
  return dedup(`startups:detail:${id}`, async () => {
    const cached = startupDetailCache.get(id);
    if (cached) return cached as StartupRecord;
    const result = await api<StartupRecord>(`/api/startups/${id}`);
    startupDetailCache.set(id, result, CLIENT_TTL.startupDetail);
    return result;
  });
}

export async function renameStartup(id: string, name: string): Promise<StartupRecord> {
  const result = await api<StartupRecord>(`/api/startups/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  startupListCache.delete("startups");
  startupDetailCache.delete(id);
  return result;
}

export async function deleteStartup(id: string): Promise<void> {
  await api<void>(`/api/startups/${id}`, { method: "DELETE" });
  startupListCache.delete("startups");
  startupDetailCache.delete(id);
  csvListCache.delete(id);
}

// ── Cap-table CSVs ──────────────────────────────────────────────────────────

export function listCsvs(startupId: string): Promise<CsvRecord[]> {
  return dedup(`csvs:list:${startupId}`, async () => {
    const cached = csvListCache.get(startupId);
    if (cached) return cached as CsvRecord[];
    const result = await api<CsvRecord[]>(`/api/startups/${startupId}/csvs`);
    csvListCache.set(startupId, result, CLIENT_TTL.csvList);
    return result;
  });
}

export const analyzeCsv = (filename: string, content: string) =>
  api<CsvIngestAnalysis>("/api/startups/analyze-csv", {
    method: "POST",
    body: JSON.stringify({ filename, content }),
  });

export async function saveCsv(
  startupId: string,
  filename: string,
  content: string,
  confirmMapping?: boolean,
): Promise<CsvRecord> {
  const result = await api<CsvRecord>(`/api/startups/${startupId}/csvs`, {
    method: "POST",
    body: JSON.stringify({ filename, content, confirmMapping }),
  });
  csvListCache.delete(startupId);
  startupDetailCache.delete(startupId);
  startupListCache.delete("startups");
  return result;
}

export async function updateCsv(
  startupId: string,
  csvId: string,
  content: string,
  confirmMapping?: boolean,
): Promise<CsvRecord> {
  const result = await api<CsvRecord>(
    `/api/startups/${startupId}/csvs/${csvId}`,
    { method: "PATCH", body: JSON.stringify({ content, confirmMapping }) },
  );
  csvListCache.delete(startupId);
  return result;
}

export async function deleteCsv(startupId: string, csvId: string): Promise<void> {
  await api<void>(`/api/startups/${startupId}/csvs/${csvId}`, {
    method: "DELETE",
  });
  csvListCache.delete(startupId);
  startupDetailCache.delete(startupId);
  startupListCache.delete("startups");
}

export async function screenStartup(
  id: string,
  options?: { csvId?: string; purpose?: ScreenPurpose },
): Promise<{
  screeningResult: ScreeningResult;
  startup: StartupRecord;
  delta?: ScreeningDelta | null;
  purpose?: ScreenPurpose;
}> {
  const result = await api<{
    screeningResult: ScreeningResult;
    startup: StartupRecord;
    delta?: ScreeningDelta | null;
    purpose?: ScreenPurpose;
  }>(`/api/startups/${id}/screen`, {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
  // Screening updates lastScreeningResult on the startup — bust both caches.
  startupDetailCache.delete(id);
  startupListCache.delete("startups");
  return result;
}

export const getScreeningDelta = (startupId: string) =>
  api<ScreeningDelta>(`/api/startups/${startupId}/screening-delta`);

export function screeningReportCsvUrl(startupId: string): string {
  return `${API_BASE}/api/startups/${startupId}/screening-report?format=csv`;
}

export async function downloadScreeningReportCsv(
  startupId: string,
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(screeningReportCsvUrl(startupId), {
    headers: authHeaders,
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Download failed (${resp.status})`);
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `screening-${startupId}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const rescreenAll = () =>
  api<{
    rescreened: number;
    total: number;
    digestId: string | null;
    results: { startupId: string; name: string; status: string }[];
  }>("/api/startups/rescreen-all", { method: "POST" });

export interface ScreeningSummaryRow {
  startupId: string;
  startupName: string;
  lastScreenedAt: string | null;
  totalEntities: number;
  flaggedCount: number;
  reviewCount: number;
  highestRiskEntity: string | null;
  highestRiskLevel: "clear" | "review" | "flagged" | null;
}

export const listScreeningSummary = () =>
  api<ScreeningSummaryRow[]>("/api/startups/screening-summary");

// ── Entity reviews ───────────────────────────────────────────────────────────

export interface EntityReview {
  id: string;
  startupId: string;
  entityName: string;
  status: "pending" | "cleared" | "escalated" | "blocked";
  notes: string | null;
  reviewedBy: string;
  reviewedByEmail: string;
  reviewedAt: string;
}

export const listEntityReviews = (startupId: string) =>
  api<EntityReview[]>(`/api/startups/${startupId}/entity-reviews`);

export const upsertEntityReview = (
  startupId: string,
  entityName: string,
  status: EntityReview["status"],
  notes?: string,
) =>
  api<EntityReview>(`/api/startups/${startupId}/entity-reviews`, {
    method: "POST",
    body: JSON.stringify({ entityName, status, notes }),
  });

// ── RAG documents ───────────────────────────────────────────────────────────

export interface RagDocumentRecord {
  id: string;
  startupId: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes: number;
  chunkCount: number;
  status: "processing" | "ready" | "error";
  errorMessage: string | null;
}

export const listRagDocuments = (startupId: string) =>
  api<RagDocumentRecord[]>(`/api/startups/${startupId}/rag-documents`);

export async function uploadRagDocument(
  startupId: string,
  file: File,
): Promise<RagDocumentRecord> {
  const authHeaders = await getAuthHeaders();
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(
    `${API_BASE}/api/startups/${startupId}/rag-documents`,
    {
      method: "POST",
      headers: authHeaders,
      body: form,
    },
  );
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Upload failed (${resp.status})`);
  }
  return resp.json() as Promise<RagDocumentRecord>;
}

export const deleteRagDocument = (startupId: string, docId: string) =>
  api<void>(`/api/startups/${startupId}/rag-documents/${docId}`, {
    method: "DELETE",
  });

// ── Screener chat ───────────────────────────────────────────────────────────

export const getStartupChat = (startupId: string) =>
  api<{ messages: unknown[] }>(`/api/startups/${startupId}/chat`);

export const saveStartupChat = (startupId: string, messages: unknown[]) =>
  api<{ ok: boolean }>(`/api/startups/${startupId}/chat`, {
    method: "PUT",
    body: JSON.stringify({ messages }),
  });

// ── IC compliance memo documents ─────────────────────────────────────────────

export interface StartupDocument {
  id: string;
  startupId: string;
  kind: "ic_memo" | "screening_analysis" | "custom";
  title: string;
  content: string;
  screeningScreenedAt: string | null;
  createdAt: string;
}

export async function generateIcMemo(
  startupId: string,
): Promise<StartupDocument> {
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/api/startups/${startupId}/ic-memo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
  });
  if (resp.status === 404) {
    throw new Error(
      "IC memo API not found. Restart the backend: pnpm dev",
    );
  }
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<StartupDocument>;
}

export async function getLatestIcMemo(
  startupId: string,
): Promise<StartupDocument | null> {
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(
    `${API_BASE}/api/startups/${startupId}/ic-memo/latest`,
    { headers: { "Content-Type": "application/json", ...authHeaders } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<StartupDocument>;
}

export const listIcMemos = (startupId: string) =>
  api<StartupDocument[]>(`/api/startups/${startupId}/ic-memo`);

export const getIcMemoDocument = (startupId: string, docId: string) =>
  api<StartupDocument>(`/api/startups/${startupId}/ic-memo/${docId}`);

/** Fetch any generated startup document (IC memo, screening analysis, etc.). */
export const getStartupGeneratedDocument = getIcMemoDocument;
