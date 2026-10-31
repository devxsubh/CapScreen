import mongoose from "mongoose";
import { visibleStartupFilter } from "../../lib/sample/sampleAssets";
import { Startup } from "../../models";

/** Data access for startups. Records are plain (lean) objects. */

export type StartupRecord = Record<string, unknown>;

/** The user's startups plus shared sample workspaces, newest first. */
export async function listVisible(userId: string): Promise<StartupRecord[]> {
  return (await Startup.find(visibleStartupFilter(userId)).sort({ createdAt: -1 }).lean()) as StartupRecord[];
}

/** A startup the user owns, or a shared sample (read-only). */
export async function findAccessible(id: string, userId: string): Promise<StartupRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await Startup.findOne({ _id: id, ...visibleStartupFilter(userId) }).lean()) as StartupRecord | null;
}

/** Every startup on this install, newest first. */
export async function listAll(): Promise<StartupRecord[]> {
  return (await Startup.find().sort({ createdAt: -1 }).lean()) as StartupRecord[];
}

/** One owner's startups, or all of them when no owner is given. */
export async function listByOwner(ownerId?: string): Promise<StartupRecord[]> {
  return (await Startup.find(ownerId ? { ownerId } : {}).lean()) as StartupRecord[];
}

/** Shared sample workspaces only. */
export async function listSamples(): Promise<StartupRecord[]> {
  return (await Startup.find({ isSample: true }).lean()) as StartupRecord[];
}

/** Startups with at least one CSV, i.e. something a background re-screen could do. */
export async function countScreenable(): Promise<number> {
  return Startup.countDocuments({ deletedAt: null, latestCsvId: { $ne: null } });
}

export async function findByIds(ids: string[], ownerId?: string): Promise<StartupRecord[]> {
  return (await Startup.find({ _id: { $in: ids }, ...(ownerId ? { ownerId } : {}) }).lean()) as StartupRecord[];
}

/** Case-insensitive exact name match among the owner's startups. */
export async function findOwnedByName(ownerId: string, name: string): Promise<StartupRecord | null> {
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  return (await Startup.findOne({ ownerId, name: exact }).lean()) as StartupRecord | null;
}

/** Only a startup the user owns (never a sample). */
export async function findOwned(id: string, userId: string): Promise<StartupRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await Startup.findOne({ _id: id, ownerId: userId }).lean()) as StartupRecord | null;
}

export async function findById(id: string): Promise<StartupRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return (await Startup.findById(id).lean()) as StartupRecord | null;
}

export async function create(name: string, ownerId: string): Promise<StartupRecord> {
  const doc = await Startup.create({ name, ownerId });
  return doc.toObject() as StartupRecord;
}

/** Applies `patch` to an owned startup. Null when it isn't the user's. */
export async function updateOwned(id: string, ownerId: string, patch: Record<string, unknown>): Promise<StartupRecord | null> {
  return (await Startup.findOneAndUpdate({ _id: id, ownerId }, patch, { new: true }).lean()) as StartupRecord | null;
}

export async function update(id: string, patch: Record<string, unknown>): Promise<StartupRecord | null> {
  return (await Startup.findByIdAndUpdate(id, patch, { new: true }).lean()) as StartupRecord | null;
}
