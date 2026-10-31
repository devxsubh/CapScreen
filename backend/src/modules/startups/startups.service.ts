import type { CurrentUser } from "../../http/currentUser";
import { notFound } from "../../http/httpError";
import { runPortfolioRescreen } from "../portfolio/rescreen.service";
import * as capTablesRepository from "../capTables/capTables.repository";
import * as chatsRepository from "../chats/chats.repository";
import * as documentsRepository from "../documents/documents.repository";
import * as startupsRepository from "./startups.repository";
import type { StartupRecord } from "./startups.repository";

export async function listStartups(userId: string): Promise<StartupRecord[]> {
  return startupsRepository.listVisible(userId);
}

export async function createStartup(name: string, userId: string): Promise<StartupRecord> {
  return startupsRepository.create(name, userId);
}

/** Renames an owned startup; a blank name leaves it unchanged. */
export async function renameStartup(id: string, userId: string, name: string): Promise<StartupRecord> {
  const startup = await startupsRepository.updateOwned(id, userId, name ? { name } : {});
  if (!startup) throw notFound("Startup not found");
  return startup;
}

/**
 * Soft-deletes the startup and its CSVs (kept for the audit trail) and
 * removes its chat transcript and generated documents.
 */
export async function deleteStartup(id: string): Promise<void> {
  const now = new Date();
  await startupsRepository.update(id, { $set: { deletedAt: now } });
  await capTablesRepository.softDeleteAllForStartup(id, now);
  await chatsRepository.deleteStartupTranscript(id);
  await documentsRepository.deleteGeneratedForStartup(id);
}

export async function rescreenAll(user: CurrentUser) {
  const result = await runPortfolioRescreen({ ownerId: user.userId, userEmail: user.userEmail });
  return { rescreened: result.rescreened, total: result.total, digestId: result.digestId, results: [] };
}
