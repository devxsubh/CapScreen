import { EntityReview } from "../../models";

export type EntityReviewRecord = Record<string, unknown>;

export async function listForStartup(startupId: string): Promise<EntityReviewRecord[]> {
  return (await EntityReview.find({ startupId }).sort({ reviewedAt: -1 }).lean()) as EntityReviewRecord[];
}

export async function find(startupId: string, entityName: string): Promise<EntityReviewRecord | null> {
  return (await EntityReview.findOne({ startupId, entityName }).lean()) as EntityReviewRecord | null;
}

/** Creates or replaces the decision on one entity. */
export async function upsert(startupId: string, entityName: string, fields: Record<string, unknown>): Promise<void> {
  await EntityReview.findOneAndUpdate({ startupId, entityName }, { $set: fields }, { upsert: true });
}
