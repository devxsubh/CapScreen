import { ScreeningDigest } from "../../models";

/** Data access for portfolio re-screen digests. */

export type DigestRecord = Record<string, unknown>;

export async function create(fields: Record<string, unknown>): Promise<DigestRecord> {
  return (await ScreeningDigest.create(fields)).toObject() as DigestRecord;
}

export async function findLatest(): Promise<DigestRecord | null> {
  return (await ScreeningDigest.findOne().sort({ generatedAt: -1 }).lean()) as DigestRecord | null;
}
