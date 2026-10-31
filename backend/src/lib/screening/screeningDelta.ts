import { ScreeningSnapshot } from "../../models";
import type { ScreeningResult } from "../../types/screening";

interface SnapshotLean {
  screenedAt?: Date;
  flaggedCount?: number;
  reviewCount?: number;
  entityRisks?: Map<string, string> | Record<string, string>;
}

export interface ScreeningDeltaChange {
  entityName: string;
  previousRisk: string | null;
  newRisk: string;
}

/**
 * Mongoose map keys may not contain "." or "$", but entity names often do ("Acme Inc.", "Dr. Petrov"), so snapshot
 * keys are stored percent-encoded. Names without those characters (and older snapshots) are unchanged.
 */
export function encodeRiskKey(name: string): string {
  return name.replace(/%/g, "%25").replace(/\./g, "%2E").replace(/\$/g, "%24");
}

export function decodeRiskKey(key: string): string {
  return key.replace(/%2E/g, ".").replace(/%24/g, "$").replace(/%25/g, "%");
}

function entityRisksFromSnapshot(
  snap: Record<string, unknown>,
): Map<string, string> {
  const raw = snap.entityRisks as Map<string, string> | Record<string, string>;
  const map = new Map<string, string>();
  if (raw instanceof Map) {
    raw.forEach((v, k) => map.set(decodeRiskKey(k), v));
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      map.set(decodeRiskKey(k), v);
    }
  }
  return map;
}

function computeChanges(
  prevMap: Map<string, string>,
  current: ScreeningResult,
): ScreeningDeltaChange[] {
  const changes: ScreeningDeltaChange[] = [];
  for (const e of current.entities) {
    const before = prevMap.get(e.name) ?? null;
    const worsened =
      (before === "clear" || before === null) &&
      (e.riskLevel === "review" || e.riskLevel === "flagged");
    const escalated = before === "review" && e.riskLevel === "flagged";
    if (worsened || escalated) {
      changes.push({
        entityName: e.name,
        previousRisk: before,
        newRisk: e.riskLevel,
      });
    }
  }
  return changes;
}

export async function getPreviousSnapshot(startupId: string): Promise<SnapshotLean | null> {
  return ScreeningSnapshot.findOne({ startupId, purpose: "cap_table" })
    .sort({ screenedAt: -1 })
    .lean() as Promise<SnapshotLean | null>;
}

export async function computeScreeningDelta(
  startupId: string,
  current: ScreeningResult,
): Promise<{
  hasPrevious: boolean;
  previousScreenedAt: string | null;
  changes: ScreeningDeltaChange[];
  summary: string;
}> {
  const prev = await getPreviousSnapshot(startupId);
  if (!prev) {
    return {
      hasPrevious: false,
      previousScreenedAt: null,
      changes: [],
      summary: "First screening — no prior baseline to compare.",
    };
  }

  const prevMap = entityRisksFromSnapshot(prev as Record<string, unknown>);
  const changes = computeChanges(prevMap, current);
  const prevAt = prev.screenedAt
    ? new Date(prev.screenedAt).toISOString()
    : null;

  let summary = "No new or escalated flags since last screen.";
  if (changes.length > 0) {
    summary = `${changes.length} entity(s) newly flagged or escalated since last screen.`;
  } else if (
    current.flaggedCount !== prev.flaggedCount ||
    current.reviewCount !== prev.reviewCount
  ) {
    summary = "Risk counts changed but no new entity-level escalations.";
  }

  return {
    hasPrevious: true,
    previousScreenedAt: prevAt,
    changes,
    summary,
  };
}

export async function saveScreeningSnapshot(
  startupId: string,
  purpose: "cap_table" | "co_investor" | "vendor",
  result: ScreeningResult,
): Promise<void> {
  const entityRisks: Record<string, string> = {};
  for (const e of result.entities) {
    entityRisks[encodeRiskKey(e.name)] = e.riskLevel;
  }

  await ScreeningSnapshot.create({
    startupId,
    purpose,
    screenedAt: new Date(),
    flaggedCount: result.flaggedCount,
    reviewCount: result.reviewCount,
    entityRisks,
  });

  const old = await ScreeningSnapshot.find({ startupId, purpose })
    .sort({ screenedAt: -1 })
    .skip(10)
    .select("_id")
    .lean();
  if (old.length > 0) {
    await ScreeningSnapshot.deleteMany({
      _id: { $in: old.map((o) => o._id) },
    });
  }
}

/** After a new snapshot exists, compare against the prior run. */
export async function getStartupScreeningDelta(
  startupId: string,
  current: ScreeningResult,
): Promise<{
  hasPrevious: boolean;
  previousScreenedAt: string | null;
  changes: ScreeningDeltaChange[];
  summary: string;
}> {
  const snapshots = await ScreeningSnapshot.find({
    startupId,
    purpose: "cap_table",
  })
    .sort({ screenedAt: -1 })
    .limit(2)
    .lean();

  if (snapshots.length < 2) {
    return {
      hasPrevious: snapshots.length === 1,
      previousScreenedAt: null,
      changes: [],
      summary:
        snapshots.length === 1
          ? "Only one screening on file — run again to see deltas."
          : "No screening history yet.",
    };
  }

  const prev = snapshots[1] as Record<string, unknown>;
  const prevMap = entityRisksFromSnapshot(prev);
  const changes = computeChanges(prevMap, current);
  const prevAt = prev.screenedAt
    ? new Date(prev.screenedAt as Date).toISOString()
    : null;

  let summary = "No new or escalated flags since last screen.";
  if (changes.length > 0) {
    summary = `${changes.length} entity(s) newly flagged or escalated since last screen.`;
  }

  return {
    hasPrevious: true,
    previousScreenedAt: prevAt,
    changes,
    summary,
  };
}
