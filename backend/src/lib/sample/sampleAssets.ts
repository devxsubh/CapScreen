import mongoose from "mongoose";
import { Startup, TabularReview } from "../../models";

/** System owner for global sample workspaces — not a real login user. */
export const SAMPLE_SYSTEM_USER_ID = "sample";

/** Startups owned by the user or marked as the global (read-only) sample. */
export function visibleStartupFilter(userId: string): Record<string, unknown> {
  return { $or: [{ ownerId: userId }, { isSample: true }] };
}

export async function findAccessibleStartup(
  id: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Startup.findOne({
    _id: id,
    $or: [{ ownerId: userId }, { isSample: true }],
  }).lean() as Promise<Record<string, unknown> | null>;
}

export function isSampleRecord(
  row: Record<string, unknown> | null | undefined,
): boolean {
  return row?.isSample === true;
}

export function isWritableStartup(
  row: Record<string, unknown>,
  userId: string,
): boolean {
  if (isSampleRecord(row)) return false;
  return row.ownerId === userId;
}

export function visibleTabularReviewFilter(
  userId: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { $or: [{ userId }, { isSample: true }], ...extra };
}

export async function findAccessibleTabularReview(
  id: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return TabularReview.findOne({
    _id: id,
    $or: [{ userId }, { isSample: true }],
  }).lean() as Promise<Record<string, unknown> | null>;
}

export function isWritableTabularReview(
  row: Record<string, unknown>,
  userId: string,
): boolean {
  if (isSampleRecord(row)) return false;
  return row.userId === userId;
}
