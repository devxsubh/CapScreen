import type { TabularRowDoc } from "../../types/tabular";
import type { CellRecord, ReviewRecord } from "./tabularReviews.repository";

export function toReview(raw: ReviewRecord, userId: string) {
  return {
    id: String(raw._id),
    project_id: raw.projectId ? String(raw.projectId) : null,
    user_id: raw.userId as string,
    title: raw.title ?? null,
    columns_config: raw.columnsConfig ?? [],
    document_ids: raw.rowIds ?? [],
    workflow_id: raw.workflowId ?? null,
    is_owner: raw.userId === userId,
    created_at: new Date(raw.createdAt as string).toISOString(),
    updated_at: new Date(raw.updatedAt as string).toISOString(),
    document_count: Array.isArray(raw.rowIds) ? raw.rowIds.length : 0,
    review_kind: raw.reviewKind ?? "standard",
    is_sample: raw.isSample === true,
  };
}

export function toCell(raw: CellRecord) {
  return {
    id: String(raw._id),
    review_id: String(raw.reviewId),
    document_id: raw.documentId,
    column_index: raw.columnIndex,
    content: raw.content ?? null,
    status: raw.status ?? "done",
    created_at: new Date(raw.createdAt as string).toISOString(),
  };
}

/** Grid rows in the document shape the grid UI expects. */
export function toRowDocuments(review: ReviewRecord, userId: string): TabularRowDoc[] {
  const rows = (review.rows as Array<{ id: string; name: string }>) ?? [];
  const projectId = review.projectId ? String(review.projectId) : null;
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    user_id: userId,
    project_id: projectId,
    folder_id: null,
    filename: r.name,
    mime_type: "text/plain",
    size_bytes: 0,
    created_at: now,
    updated_at: now,
  }));
}
