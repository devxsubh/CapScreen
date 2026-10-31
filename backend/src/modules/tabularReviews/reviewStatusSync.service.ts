import {
  ENTITY_SCREENING_COLUMNS,
  PORTFOLIO_COLUMNS,
  portfolioStartupRowId,
} from "../../lib/tabular/tabularScreening";
import { recordAuditEvent } from "../auditLogs/auditLogs.service";
import * as entityReviewsRepository from "../entityReviews/entityReviews.repository";
import * as startupsRepository from "../startups/startups.repository";
import * as tabularReviewsRepository from "./tabularReviews.repository";

/**
 * A review decision can be made in three places — the entity review panel, an
 * entity grid's Status column, or the portfolio grid's Status column. These
 * keep all of them, and the audit log, in step.
 */

function statusColumn(columns: Array<{ index: number; name: string }>): number {
  const column = columns.find((c) => c.name === "Status");
  if (!column) throw new Error("Grid has no Status column");
  return column.index;
}

/** The human decision column of each grid kind (read from the column definitions). */
export const ENTITY_GRID_STATUS_COLUMN = statusColumn(ENTITY_SCREENING_COLUMNS);
export const PORTFOLIO_GRID_STATUS_COLUMN = statusColumn(PORTFOLIO_COLUMNS);

function statusCell(status: string, notes: string | null | undefined) {
  return { content: { summary: status, flag: "grey", reasoning: notes ?? "" }, status: "done" };
}

const VALID = ["pending", "cleared", "escalated", "blocked"] as const;
export type ReviewStatusValue = (typeof VALID)[number];

export function parseReviewStatus(text: string): ReviewStatusValue | null {
  const t = text.trim().toLowerCase();
  if (!t) return "pending";
  if (VALID.includes(t as ReviewStatusValue)) return t as ReviewStatusValue;
  if (t === "clear" || t === "cleared") return "cleared";
  if (t === "escalate" || t === "escalated") return "escalated";
  if (t === "block" || t === "blocked") return "blocked";
  return null;
}

function decodeEntityRowId(documentId: string): string | null {
  if (!documentId.startsWith("entity:")) return null;
  try {
    return decodeURIComponent(documentId.slice("entity:".length));
  } catch {
    return documentId.slice("entity:".length);
  }
}

function decodeStartupRowId(documentId: string): string | null {
  if (!documentId.startsWith("startup:")) return null;
  return documentId.slice("startup:".length);
}

export async function syncEntityReviewStatus(params: {
  startupId: string;
  entityName: string;
  status: ReviewStatusValue;
  notes?: string | null;
  performedBy: string;
  performedByEmail: string;
}): Promise<void> {
  await entityReviewsRepository.upsert(params.startupId, params.entityName, {
    status: params.status,
    notes: params.notes ?? null,
    reviewedBy: params.performedBy,
    reviewedByEmail: params.performedByEmail,
    reviewedAt: new Date(),
  });

  const docId = `entity:${encodeURIComponent(params.entityName)}`;
  for (const review of await tabularReviewsRepository.listEntityScreeningReviews(params.startupId)) {
    await tabularReviewsRepository.upsertCell(review._id, docId, ENTITY_GRID_STATUS_COLUMN, statusCell(params.status, params.notes));
  }

  await recordAuditEvent(
    { userId: params.performedBy, userEmail: params.performedByEmail },
    "entity_reviewed",
    params.startupId,
    { entityName: params.entityName, outcome: params.status, notes: params.notes ?? null },
  );
}

export async function syncPortfolioStartupStatus(params: {
  startupId: string;
  status: ReviewStatusValue;
  notes?: string | null;
  performedBy: string;
  performedByEmail: string;
}): Promise<void> {
  await startupsRepository.update(params.startupId, {
    portfolioReviewStatus: params.status,
    portfolioReviewNotes: params.notes ?? null,
  });

  const docId = portfolioStartupRowId(params.startupId);
  for (const review of await tabularReviewsRepository.listPortfolioReviews()) {
    await tabularReviewsRepository.upsertCell(review._id, docId, PORTFOLIO_GRID_STATUS_COLUMN, statusCell(params.status, params.notes));
  }

  await recordAuditEvent(
    { userId: params.performedBy, userEmail: params.performedByEmail },
    "portfolio_reviewed",
    params.startupId,
    { outcome: params.status, notes: params.notes ?? null },
  );
}

export async function applyTabularStatusCell(params: {
  reviewId: string;
  documentId: string;
  columnIndex: number;
  summary: string;
  performedBy: string;
  performedByEmail: string;
}): Promise<void> {
  const review = await tabularReviewsRepository.findById(params.reviewId);
  if (!review) return;

  const kind = review.reviewKind as string;
  const status = parseReviewStatus(params.summary);
  if (!status) return;

  if (kind === "entity_screening" && params.columnIndex === ENTITY_GRID_STATUS_COLUMN) {
    const entityName = decodeEntityRowId(params.documentId);
    const startupId = review.projectId ? String(review.projectId) : null;
    if (entityName && startupId) {
      await syncEntityReviewStatus({
        startupId,
        entityName,
        status,
        performedBy: params.performedBy,
        performedByEmail: params.performedByEmail,
      });
    }
    return;
  }

  if (kind === "portfolio_monitoring" && params.columnIndex === PORTFOLIO_GRID_STATUS_COLUMN) {
    const startupId = decodeStartupRowId(params.documentId);
    if (startupId) {
      await syncPortfolioStartupStatus({
        startupId,
        status,
        performedBy: params.performedBy,
        performedByEmail: params.performedByEmail,
      });
    }
  }
}
