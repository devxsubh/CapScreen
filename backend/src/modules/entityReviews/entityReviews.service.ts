import type { CurrentUser } from "../../http/currentUser";
import { syncEntityReviewStatus } from "../tabularReviews/reviewStatusSync.service";
import * as entityReviewsRepository from "./entityReviews.repository";
import type { EntityReviewRecord } from "./entityReviews.repository";

export const REVIEW_STATUSES = ["pending", "cleared", "escalated", "blocked"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export async function listReviews(startupId: string): Promise<EntityReviewRecord[]> {
  return entityReviewsRepository.listForStartup(startupId);
}

/**
 * Records a human decision on one entity. The sync also writes the audit
 * entry and updates any tabular grid showing this entity.
 */
export async function recordReview(
  startupId: string,
  input: { entityName: string; status: ReviewStatus; notes: string | null },
  user: CurrentUser,
): Promise<EntityReviewRecord | null> {
  await syncEntityReviewStatus({
    startupId,
    entityName: input.entityName,
    status: input.status,
    notes: input.notes,
    performedBy: user.userId,
    performedByEmail: user.userEmail,
  });
  return entityReviewsRepository.find(startupId, input.entityName);
}
