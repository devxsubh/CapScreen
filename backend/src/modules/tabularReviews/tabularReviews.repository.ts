import mongoose from "mongoose";
import { isWritableTabularReview, visibleTabularReviewFilter } from "../../lib/sample/sampleAssets";
import { TabularCell, TabularReview } from "../../models";

/** Data access for tabular review grids and their cells. */

export type ReviewRecord = Record<string, unknown>;
export type CellRecord = Record<string, unknown>;

export async function listVisible(userId: string, projectId?: string): Promise<ReviewRecord[]> {
  const extra = projectId ? { projectId: new mongoose.Types.ObjectId(projectId) } : {};
  return (await TabularReview.find(visibleTabularReviewFilter(userId, extra)).sort({ updatedAt: -1 }).lean()) as ReviewRecord[];
}

/** The user's own review, or a shared sample. */
export async function findAccessible(id: string, userId: string): Promise<ReviewRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await TabularReview.findOne({ _id: id, ...visibleTabularReviewFilter(userId) }).lean()) as ReviewRecord | null;
}

/** Only a review the user owns (samples are read-only). */
export async function findOwned(id: string, userId: string): Promise<ReviewRecord | null> {
  const review = await findAccessible(id, userId);
  return review && isWritableTabularReview(review, userId) ? review : null;
}

export async function findPortfolioReview(userId: string): Promise<ReviewRecord | null> {
  return (await TabularReview.findOne({ userId, reviewKind: "portfolio_monitoring" }).lean()) as ReviewRecord | null;
}

export async function findById(id: string): Promise<ReviewRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await TabularReview.findById(id).lean()) as ReviewRecord | null;
}

/** Entity grids built from one startup's screening. */
export async function listEntityScreeningReviews(startupId: string): Promise<ReviewRecord[]> {
  return (await TabularReview.find({
    projectId: new mongoose.Types.ObjectId(startupId),
    reviewKind: "entity_screening",
  }).lean()) as ReviewRecord[];
}

/** Every portfolio monitoring grid on this install. */
export async function listPortfolioReviews(): Promise<ReviewRecord[]> {
  return (await TabularReview.find({ reviewKind: "portfolio_monitoring" }).lean()) as ReviewRecord[];
}

/** Creates the user's portfolio grid or overwrites its definition. */
export async function upsertPortfolioReview(userId: string, fields: Record<string, unknown>): Promise<ReviewRecord> {
  return (await TabularReview.findOneAndUpdate(
    { userId, reviewKind: "portfolio_monitoring" },
    { $set: { ...fields, userId, reviewKind: "portfolio_monitoring", updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true },
  ).lean()) as ReviewRecord;
}

export async function create(fields: Record<string, unknown>): Promise<ReviewRecord> {
  return (await TabularReview.create(fields)).toObject() as ReviewRecord;
}

export async function updateOwned(id: string, userId: string, set: Record<string, unknown>): Promise<ReviewRecord | null> {
  return (await TabularReview.findOneAndUpdate({ _id: id, userId }, { $set: set }, { new: true }).lean()) as ReviewRecord | null;
}

/** Deletes the review and all of its cells. */
export async function remove(id: string): Promise<void> {
  await TabularReview.findByIdAndDelete(id);
  await TabularCell.deleteMany({ reviewId: id });
}

export type NewCell = {
  documentId: string;
  columnIndex: number;
  content: { summary: string; flag: string; reasoning: string };
  status: string;
};

export async function insertCells(reviewId: unknown, cells: NewCell[]): Promise<void> {
  if (cells.length > 0) await TabularCell.insertMany(cells.map((c) => ({ ...c, reviewId })));
}

/** Drops every cell of the review and writes `cells` instead. */
export async function replaceCells(reviewId: unknown, cells: NewCell[]): Promise<void> {
  await TabularCell.deleteMany({ reviewId });
  await insertCells(reviewId, cells);
}

export async function listColumnCells(reviewId: unknown, columnIndex: number): Promise<CellRecord[]> {
  return (await TabularCell.find({ reviewId, columnIndex }).lean()) as CellRecord[];
}

export async function listCells(reviewId: string): Promise<CellRecord[]> {
  return (await TabularCell.find({ reviewId }).lean()) as CellRecord[];
}

export async function upsertCell(
  reviewId: unknown,
  documentId: string,
  columnIndex: number,
  set: Record<string, unknown>,
): Promise<CellRecord> {
  return (await TabularCell.findOneAndUpdate(
    { reviewId, documentId, columnIndex },
    { $set: set },
    { upsert: true, new: true },
  ).lean()) as CellRecord;
}

export async function deleteCells(reviewId: string, documentIds: string[]): Promise<void> {
  await TabularCell.deleteMany({ reviewId, documentId: { $in: documentIds } });
}
