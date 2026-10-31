import { CapTableCsv } from "../../models";

/** Data access for uploaded cap-table / roster CSVs. Soft-deleted rows are hidden by the model. */

export type CapTableCsvRecord = Record<string, unknown>;

export async function listForStartup(startupId: string): Promise<CapTableCsvRecord[]> {
  return (await CapTableCsv.find({ startupId }).sort({ uploadedAt: -1 }).lean()) as CapTableCsvRecord[];
}

export async function findById(id: unknown): Promise<CapTableCsvRecord | null> {
  return (await CapTableCsv.findById(id).lean()) as CapTableCsvRecord | null;
}

export async function findInStartup(csvId: string, startupId: string): Promise<CapTableCsvRecord | null> {
  return (await CapTableCsv.findOne({ _id: csvId, startupId }).lean()) as CapTableCsvRecord | null;
}

/** Newest CSV for the startup, optionally limited to some roster purposes. */
export async function findLatest(startupId: string, purposes?: string[]): Promise<CapTableCsvRecord | null> {
  const filter = purposes ? { startupId, rosterPurpose: { $in: purposes } } : { startupId };
  return (await CapTableCsv.findOne(filter).sort({ uploadedAt: -1 }).lean()) as CapTableCsvRecord | null;
}

/** Newest CSV for these purposes that parsed cleanly enough to screen. */
export async function findLatestScreenable(startupId: string, purposes: string[]): Promise<CapTableCsvRecord | null> {
  return (await CapTableCsv.findOne({
    startupId,
    rosterPurpose: { $in: purposes },
    parseStatus: { $nin: ["invalid", "needs_review"] },
  })
    .sort({ uploadedAt: -1 })
    .lean()) as CapTableCsvRecord | null;
}

/** The startup's CSVs without their content (for listings), newest first. */
export async function listSummaries(startupId: string): Promise<CapTableCsvRecord[]> {
  return (await CapTableCsv.find({ startupId })
    .sort({ uploadedAt: -1 })
    .select("filename uploadedAt csvKind parseStatus rosterPurpose recordCount")
    .lean()) as CapTableCsvRecord[];
}

export async function create(fields: Record<string, unknown>): Promise<CapTableCsvRecord> {
  const doc = await CapTableCsv.create(fields);
  return doc.toObject() as CapTableCsvRecord;
}

export async function updateInStartup(
  csvId: string,
  startupId: string,
  patch: Record<string, unknown>,
): Promise<CapTableCsvRecord | null> {
  return (await CapTableCsv.findOneAndUpdate({ _id: csvId, startupId }, patch, { new: true }).lean()) as CapTableCsvRecord | null;
}

export async function softDelete(csvId: string, startupId: string): Promise<boolean> {
  return Boolean(await updateInStartup(csvId, startupId, { $set: { deletedAt: new Date() } }));
}

export async function softDeleteAllForStartup(startupId: string, at: Date): Promise<void> {
  await CapTableCsv.updateMany({ startupId, deletedAt: null }, { $set: { deletedAt: at } });
}
