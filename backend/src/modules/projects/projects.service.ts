import { notFound } from "../../http/httpError";
import { loadProjectAssets } from "../../lib/chat/projectAssets";
import * as documentsRepository from "../documents/documents.repository";
import * as startupsRepository from "../startups/startups.repository";

/** Projects are startups seen as folders: their uploads, CSVs and screening outputs. */

export async function listProjects(userId: string) {
  return startupsRepository.listVisible(userId);
}

export async function getProject(projectId: string, userId: string) {
  const startup = await startupsRepository.findAccessible(projectId, userId);
  if (!startup) throw notFound("Project not found");
  const [documents, assets] = await Promise.all([
    documentsRepository.listStored(userId, projectId),
    loadProjectAssets(projectId, userId),
  ]);
  return { startup, documents, assets: assets ?? { csvs: [], screening_assets: [] } };
}
