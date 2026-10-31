import mongoose from "mongoose";
import {
  ENTITY_SCREENING_COLUMNS,
  PORTFOLIO_COLUMNS,
  entityToCells,
  formatCoInvestorRisk,
  formatOpenFlags,
  portfolioStartupRowId,
  riskToFlag,
  screeningResultToRows,
} from "../../lib/tabular/tabularScreening";
import type { ScreeningResult } from "../../types/screening";
import * as entityReviewsRepository from "../entityReviews/entityReviews.repository";
import * as startupsRepository from "../startups/startups.repository";
import {
  ENTITY_GRID_STATUS_COLUMN,
  PORTFOLIO_GRID_STATUS_COLUMN,
} from "../tabularReviews/reviewStatusSync.service";
import * as tabularReviewsRepository from "../tabularReviews/tabularReviews.repository";
import type { NewCell } from "../tabularReviews/tabularReviews.repository";

/**
 * Screening-backed grids: an entity grid per screened startup, and one
 * portfolio monitoring grid across every startup. Cells are computed from the
 * stored screening results; human Status decisions are kept.
 */

export async function seedEntityScreeningReview(params: {
  userId: string;
  userEmail: string;
  startupId: string;
  startupName: string;
  screeningResult: ScreeningResult;
  title?: string;
}): Promise<{ reviewId: string }> {
  const { rowIds, rows } = screeningResultToRows(params.screeningResult);

  const review = await tabularReviewsRepository.create({
    userId: params.userId,
    userEmail: params.userEmail,
    title: params.title ?? `${params.startupName} — Sanctions Review`,
    projectId: new mongoose.Types.ObjectId(params.startupId),
    workflowId: "builtin-cap-table-review",
    reviewKind: "entity_screening",
    columnsConfig: ENTITY_SCREENING_COLUMNS,
    rowIds,
    rows,
  });

  const cells: NewCell[] = [];
  for (const entity of params.screeningResult.entities) {
    const docId = `entity:${encodeURIComponent(entity.name)}`;
    const colMap = entityToCells(entity);
    for (const [colIdx, cell] of colMap) {
      cells.push({
        documentId: docId,
        columnIndex: colIdx,
        content: { summary: cell.summary, flag: cell.flag, reasoning: "" },
        status: "done",
      });
    }
  }
  await tabularReviewsRepository.insertCells(review._id, cells);

  return { reviewId: String(review._id) };
}

interface StartupScreenFields {
  _id: unknown;
  name: string;
  lastScreenedAt?: Date | null;
  lastScreeningResult?: ScreeningResult | null;
  lastCoInvestorScreeningResult?: ScreeningResult | null;
  portfolioReviewStatus?: string | null;
}

export async function syncPortfolioMonitoringReview(params: {
  userId: string;
  userEmail: string;
}): Promise<{ reviewId: string; rowCount: number }> {
  const startups = (await startupsRepository.listAll()) as unknown as StartupScreenFields[];

  const rowIds: string[] = [];
  const rows: { id: string; name: string; meta: Record<string, unknown> }[] =
    [];
  const cells: NewCell[] = [];

  const existing = await tabularReviewsRepository.findPortfolioReview(params.userId);

  // Keep the human Status decision per startup row.
  const existingStatus = new Map<string, string>();
  if (existing) {
    const statusCells = await tabularReviewsRepository.listColumnCells(existing._id, PORTFOLIO_GRID_STATUS_COLUMN);
    for (const c of statusCells) {
      const summary = (c.content as { summary?: string } | null)?.summary;
      if (summary?.trim()) {
        existingStatus.set(c.documentId as string, summary);
      }
    }
  }

  for (const s of startups) {
    const startupId = String(s._id);
    const docId = portfolioStartupRowId(startupId);
    rowIds.push(docId);
    rows.push({ id: docId, name: s.name, meta: { startupId } });

    const result = s.lastScreeningResult ?? null;
    const coInv = s.lastCoInvestorScreeningResult ?? null;
    const lastScreened = s.lastScreenedAt
      ? new Date(s.lastScreenedAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Never";

    let highestEntity = "—";
    let highestFlag: "green" | "grey" | "yellow" | "red" = "grey";
    if (result?.entities?.length) {
      const flagged = result.entities.find((e) => e.riskLevel === "flagged");
      const reviewEnt = result.entities.find((e) => e.riskLevel === "review");
      const top = flagged ?? reviewEnt;
      if (top) {
        highestEntity = top.name;
        highestFlag = riskToFlag(top.riskLevel);
      }
    }

    const openFlags = formatOpenFlags(
      result?.flaggedCount ?? 0,
      result?.reviewCount ?? 0,
    );
    const openFlagLevel: "green" | "yellow" | "red" | "grey" =
      (result?.flaggedCount ?? 0) > 0
        ? "red"
        : (result?.reviewCount ?? 0) > 0
          ? "yellow"
          : result
            ? "green"
            : "grey";

    const maxExposure =
      result?.maxSanctionedExposurePct != null
        ? `${result.maxSanctionedExposurePct.toFixed(1)}%`
        : "—";
    const exposureFlag: "green" | "yellow" | "red" | "grey" =
      (result?.maxSanctionedExposurePct ?? 0) >= 50
        ? "red"
        : (result?.maxSanctionedExposurePct ?? 0) >= 25
          ? "yellow"
          : result?.maxSanctionedExposurePct != null
            ? "green"
            : "grey";

    const coRisk = formatCoInvestorRisk(
      coInv
        ? {
            flaggedCount: coInv.flaggedCount,
            reviewCount: coInv.reviewCount,
          }
        : null,
    );
    const coFlag: "green" | "yellow" | "red" | "grey" =
      (coInv?.flaggedCount ?? 0) > 0
        ? "red"
        : (coInv?.reviewCount ?? 0) > 0
          ? "yellow"
          : coInv
            ? "green"
            : "grey";

    const statusSummary =
      existingStatus.get(docId) ??
      (s.portfolioReviewStatus as string | undefined) ??
      "";

    const row: [number, string, "green" | "grey" | "yellow" | "red"][] = [
      [0, lastScreened, "grey"],
      [1, openFlags, openFlagLevel],
      [2, highestEntity, highestFlag],
      [3, maxExposure, exposureFlag],
      [4, coRisk, coFlag],
      [PORTFOLIO_GRID_STATUS_COLUMN, statusSummary, "grey"],
    ];

    for (const [colIdx, summary, flag] of row) {
      cells.push({
        documentId: docId,
        columnIndex: colIdx,
        content: { summary, flag, reasoning: "" },
        status: "done",
      });
    }
  }

  const review = await tabularReviewsRepository.upsertPortfolioReview(params.userId, {
    userEmail: params.userEmail,
    title: "Portfolio Sanctions Monitoring",
    projectId: null,
    workflowId: "builtin-portfolio-monitoring",
    columnsConfig: PORTFOLIO_COLUMNS,
    rowIds,
    rows,
  });
  await tabularReviewsRepository.replaceCells(review._id, cells);

  return { reviewId: String(review._id), rowCount: rows.length };
}

/** Copy entity review statuses into tabular Status column for entity_screening reviews. */
export async function syncEntityReviewStatusesToTabular(
  startupId: string,
  reviewId: string,
): Promise<void> {
  for (const r of await entityReviewsRepository.listForStartup(startupId)) {
    const docId = `entity:${encodeURIComponent(r.entityName as string)}`;
    await tabularReviewsRepository.upsertCell(reviewId, docId, ENTITY_GRID_STATUS_COLUMN, {
      content: { summary: r.status as string, flag: "grey", reasoning: (r.notes as string) ?? "" },
      status: "done",
    });
  }
}
