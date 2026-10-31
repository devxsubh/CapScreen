import * as startupsRepository from "../startups/startups.repository";
import type { ScreeningResult } from "../../types/screening";

export interface CompareStartupRow {
  startupId: string;
  startupName: string;
  lastScreenedAt: string | null;
  flaggedCount: number;
  reviewCount: number;
  topEntities: Array<{ name: string; riskLevel: string; topScore: number | null }>;
}

export interface SharedOwnerHit {
  ownerName: string;
  startups: string[];
}

function topRiskEntities(result: ScreeningResult | null | undefined, limit = 5) {
  if (!result?.entities?.length) return [];
  const sorted = [...result.entities].sort((a, b) => {
    const order = { flagged: 0, review: 1, clear: 2 };
    const d =
      order[a.riskLevel] - order[b.riskLevel] ||
      (b.topScore ?? 0) - (a.topScore ?? 0);
    return d;
  });
  return sorted.slice(0, limit).map((e) => ({
    name: e.name,
    riskLevel: e.riskLevel,
    topScore: e.topScore,
  }));
}

export async function compareStartups(
  ids: string[],
  userId?: string,
): Promise<CompareStartupRow[]> {
  const startups = await startupsRepository.findByIds(ids, userId);
  return startups.map((raw) => {
    const result = raw.lastScreeningResult as ScreeningResult | null;
    return {
      startupId: String(raw._id),
      startupName: raw.name as string,
      lastScreenedAt: raw.lastScreenedAt
        ? new Date(raw.lastScreenedAt as Date).toISOString()
        : null,
      flaggedCount: result?.flaggedCount ?? 0,
      reviewCount: result?.reviewCount ?? 0,
      topEntities: topRiskEntities(result),
    };
  });
}

export function findSharedUltimateOwners(
  startups: Array<{ name: string; result: ScreeningResult | null }>,
): SharedOwnerHit[] {
  const ownerToStartups = new Map<string, Set<string>>();

  for (const { name: startupName, result } of startups) {
    if (!result?.entities) continue;
    const seen = new Set<string>();
    for (const e of result.entities) {
      const ubo = e.ultimateOwner ?? e.name;
      if (!ubo || seen.has(ubo)) continue;
      seen.add(ubo);
      if (!ownerToStartups.has(ubo)) ownerToStartups.set(ubo, new Set());
      ownerToStartups.get(ubo)!.add(startupName);
    }
  }

  return [...ownerToStartups.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([ownerName, set]) => ({
      ownerName,
      startups: [...set],
    }))
    .sort((a, b) => b.startups.length - a.startups.length);
}

export async function compareStartupsWithSharedOwners(
  ids: string[],
  userId?: string,
) {
  const rows = await compareStartups(ids, userId);
  const docs = await startupsRepository.findByIds(ids, userId);
  const forShared = docs.map((raw) => {
    return {
      name: raw.name as string,
      result: (raw.lastScreeningResult as ScreeningResult | null) ?? null,
    };
  });
  return {
    startups: rows,
    sharedUltimateOwners: findSharedUltimateOwners(forShared),
  };
}
