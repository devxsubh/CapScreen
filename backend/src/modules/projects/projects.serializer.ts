import type { loadProjectAssets } from "../../lib/chat/projectAssets";
import { isSampleRecord } from "../../lib/sample/sampleAssets";
import type { StartupRecord } from "../startups/startups.repository";

type ProjectAssets = NonNullable<Awaited<ReturnType<typeof loadProjectAssets>>>;

/** A startup in the "project" shape the file explorer uses. */
export function toProject(
  startup: StartupRecord,
  viewerUserId: string,
  documents: unknown[] = [],
  assets?: ProjectAssets,
) {
  const isSample = isSampleRecord(startup);
  return {
    id: String(startup._id),
    user_id: startup.ownerId,
    is_owner: !isSample && startup.ownerId === viewerUserId,
    is_sample: isSample,
    name: startup.name,
    cm_number: null,
    shared_with: [],
    created_at: new Date(startup.createdAt as Date).toISOString(),
    updated_at: new Date(
      (startup.updatedAt as Date | undefined) ?? (startup.createdAt as Date),
    ).toISOString(),
    documents,
    csvs: assets?.csvs ?? [],
    screening_assets: assets?.screening_assets ?? [],
    document_count: documents.length,
    chat_count: 0,
    review_count: 0,
  };
}
