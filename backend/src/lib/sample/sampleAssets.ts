/**
 * Access rules for the shared sample workspace: everyone can read it, nobody
 * can change it. Repositories use these filters; services use the checks.
 */

/** System owner for global sample workspaces — not a real login user. */
export const SAMPLE_SYSTEM_USER_ID = "sample";

/** Startups owned by the user or marked as the global (read-only) sample. */
export function visibleStartupFilter(userId: string): Record<string, unknown> {
  return { $or: [{ ownerId: userId }, { isSample: true }] };
}

/** Tabular reviews owned by the user or marked as samples. */
export function visibleTabularReviewFilter(
  userId: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { $or: [{ userId }, { isSample: true }], ...extra };
}

export function isSampleRecord(
  row: Record<string, unknown> | null | undefined,
): boolean {
  return row?.isSample === true;
}

export function isWritableTabularReview(
  row: Record<string, unknown>,
  userId: string,
): boolean {
  if (isSampleRecord(row)) return false;
  return row.userId === userId;
}
