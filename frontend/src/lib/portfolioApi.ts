import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const resp = await fetch(`${API_BASE}${path}`, {
    ...restInit,
    headers: {
      "Content-Type": "application/json",
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

export interface ScreeningDigest {
  id: string;
  generatedAt: string;
  rescreenedCount: number;
  newFlagCount: number;
  newReviewCount: number;
  summaryText: string;
  changes: Array<{
    startupId: string;
    startupName: string;
    entityName: string;
    previousRisk: string | null;
    newRisk: string;
    matchScore: number | null;
  }>;
}

export const syncPortfolioGrid = () =>
  api<{ reviewId: string; rowCount: number }>("/api/portfolio/sync", {
    method: "POST",
  });

export const runPortfolioRescreen = () =>
  api<{ rescreened: number; total: number; digestId: string | null }>(
    "/api/portfolio/rescreen",
    { method: "POST" },
  );

export const getLatestDigest = () =>
  api<ScreeningDigest | null>("/api/portfolio/digest");

export const createEntityTabularReview = (startupId: string) =>
  api<{ reviewId: string }>(
    `/api/portfolio/startups/${startupId}/entity-review`,
    { method: "POST" },
  );

export interface CompareStartupRow {
  startupId: string;
  startupName: string;
  lastScreenedAt: string | null;
  flaggedCount: number;
  reviewCount: number;
  topEntities: Array<{ name: string; riskLevel: string; topScore: number | null }>;
}

export interface CompareResult {
  startups: CompareStartupRow[];
  sharedUltimateOwners: Array<{ ownerName: string; startups: string[] }>;
}

export const compareStartups = (ids: string[]) =>
  api<CompareResult>(`/api/portfolio/compare?ids=${ids.join(",")}`);
