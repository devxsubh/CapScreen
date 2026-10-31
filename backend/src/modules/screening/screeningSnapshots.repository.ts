import { ScreeningSnapshot } from "../../models";

/** Data access for per-run risk snapshots (what each entity's risk was at each screen). */

export type SnapshotRecord = Record<string, unknown>;
export type SnapshotPurpose = "cap_table" | "co_investor" | "vendor";

/** Newest first. */
export async function listRecent(startupId: string, purpose: SnapshotPurpose, limit: number): Promise<SnapshotRecord[]> {
  return (await ScreeningSnapshot.find({ startupId, purpose }).sort({ screenedAt: -1 }).limit(limit).lean()) as SnapshotRecord[];
}

export async function create(fields: {
  startupId: string;
  purpose: SnapshotPurpose;
  flaggedCount: number;
  reviewCount: number;
  entityRisks: Record<string, string>;
}): Promise<void> {
  await ScreeningSnapshot.create({ ...fields, screenedAt: new Date() });
}

/** Deletes all but the newest `keep` snapshots. */
export async function prune(startupId: string, purpose: SnapshotPurpose, keep: number): Promise<void> {
  const old = await ScreeningSnapshot.find({ startupId, purpose }).sort({ screenedAt: -1 }).skip(keep).select("_id").lean();
  if (old.length > 0) {
    await ScreeningSnapshot.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
}
