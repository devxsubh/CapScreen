import type { ScreeningSummary } from "../../types/screening";

export function toStartup(raw: unknown) {
  const s = raw as Record<string, unknown>;
  return {
    id: String(s._id),
    name: s.name,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt ?? null,
    latestCsvId: s.latestCsvId ? String(s.latestCsvId) : null,
    latestCsvByPurpose: s.latestCsvByPurpose ?? {},
    lastScreeningResult: s.lastScreeningResult ?? null,
    lastScreenedAt: s.lastScreenedAt ?? null,
    lastScreenedCsvId: s.lastScreenedCsvId ? String(s.lastScreenedCsvId) : null,
    lastCoInvestorScreeningResult: s.lastCoInvestorScreeningResult ?? null,
    lastCoInvestorScreenedAt: s.lastCoInvestorScreenedAt ?? null,
    lastVendorScreeningResult: s.lastVendorScreeningResult ?? null,
    lastVendorScreenedAt: s.lastVendorScreenedAt ?? null,
    portfolioReviewStatus: s.portfolioReviewStatus ?? "pending",
    portfolioReviewNotes: s.portfolioReviewNotes ?? null,
    isSample: s.isSample === true,
  };
}

export function toScreeningSummary(raw: unknown): ScreeningSummary {
  const s = raw as Record<string, unknown>;
  const result = s.lastScreeningResult as
    | {
        totalEntities?: number;
        flaggedCount?: number;
        reviewCount?: number;
        entities?: Array<{ name: string; riskLevel: string }>;
      }
    | null
    | undefined;

  let highestRiskEntity: string | null = null;
  let highestRiskLevel: ScreeningSummary["highestRiskLevel"] = null;

  if (result?.entities?.length) {
    const flagged = result.entities.find((e) => e.riskLevel === "flagged");
    const review = result.entities.find((e) => e.riskLevel === "review");
    const top = flagged ?? review ?? null;
    if (top) {
      highestRiskEntity = top.name;
      highestRiskLevel = top.riskLevel as ScreeningSummary["highestRiskLevel"];
    }
  }

  return {
    startupId: String(s._id),
    startupName: s.name as string,
    lastScreenedAt: s.lastScreenedAt
      ? new Date(s.lastScreenedAt as string).toISOString()
      : null,
    totalEntities: result?.totalEntities ?? 0,
    flaggedCount: result?.flaggedCount ?? 0,
    reviewCount: result?.reviewCount ?? 0,
    highestRiskEntity,
    highestRiskLevel,
  };
}
