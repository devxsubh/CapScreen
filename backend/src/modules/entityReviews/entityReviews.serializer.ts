export function toEntityReview(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return {
    id: String(raw._id),
    startupId: String(raw.startupId),
    entityName: raw.entityName,
    status: raw.status,
    notes: raw.notes ?? null,
    reviewedBy: raw.reviewedBy,
    reviewedByEmail: raw.reviewedByEmail,
    reviewedAt: raw.reviewedAt,
  };
}
