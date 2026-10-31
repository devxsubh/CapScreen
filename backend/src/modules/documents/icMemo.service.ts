import { buildIcMemo } from "../../lib/documents/generateIcMemo";
import { buildScreeningAnalysis } from "../../lib/documents/generateScreeningAnalysis";
import { isValidStartupObjectId } from "../../lib/shared/startupId";
import type { StartupDocumentKind } from "../../models/documents/startupDocument";
import type { ScreeningResult } from "../../types/screening";
import { recordAuditEvent } from "../auditLogs/auditLogs.service";
import * as startupsRepository from "../startups/startups.repository";
import * as documentsRepository from "./documents.repository";

/** IC memos and screening analyses: LLM-written documents saved against a startup. */

export interface StartupDocumentRecord {
  id: string;
  startupId: string;
  kind: StartupDocumentKind;
  title: string;
  content: string;
  screeningScreenedAt: string | null;
  createdAt: string;
}

function toRecord(doc: Record<string, unknown>): StartupDocumentRecord {
  return {
    id: String(doc._id),
    startupId: String(doc.startupId),
    kind: doc.kind as StartupDocumentKind,
    title: doc.title as string,
    content: doc.content as string,
    screeningScreenedAt: (doc.screeningScreenedAt as string | null) ?? null,
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  };
}

async function createStartupScreeningDocument(params: {
  startupId: string;
  screeningResult: ScreeningResult;
  kind: StartupDocumentKind;
  performedBy?: string;
  performedByEmail?: string;
}): Promise<StartupDocumentRecord> {
  if (!isValidStartupObjectId(params.startupId)) {
    throw new Error("Invalid startup id");
  }

  const startup = await startupsRepository.findById(params.startupId);

  const startupName =
    (startup?.name as string | undefined) ??
    params.screeningResult.startupName ??
    "Portfolio company";

  const generated =
    params.kind === "ic_memo"
      ? await buildIcMemo(startupName, params.screeningResult)
      : await buildScreeningAnalysis(startupName, params.screeningResult);

  const doc = await documentsRepository.createGenerated({
    startupId: params.startupId,
    kind: params.kind,
    title: generated.title,
    content: generated.content,
    screeningScreenedAt: generated.screeningScreenedAt,
  });

  await recordAuditEvent(
    { userId: params.performedBy ?? "system", userEmail: params.performedByEmail ?? "system@local" },
    params.kind === "ic_memo" ? "ic_memo_generated" : "screening_analysis_generated",
    params.startupId,
    { documentId: String(doc._id), title: generated.title },
  );

  return toRecord(doc);
}

export async function createIcMemoDocument(params: {
  startupId: string;
  screeningResult: ScreeningResult;
  performedBy?: string;
  performedByEmail?: string;
}): Promise<StartupDocumentRecord> {
  return createStartupScreeningDocument({ ...params, kind: "ic_memo" });
}

export async function createScreeningAnalysisDocument(params: {
  startupId: string;
  screeningResult: ScreeningResult;
  performedBy?: string;
  performedByEmail?: string;
}): Promise<StartupDocumentRecord> {
  return createStartupScreeningDocument({
    ...params,
    kind: "screening_analysis",
  });
}

export async function getLatestIcMemo(
  startupId: string,
): Promise<StartupDocumentRecord | null> {
  const [doc] = await documentsRepository.listGenerated(startupId, "ic_memo");
  return doc ? toRecord(doc) : null;
}

export async function listIcMemos(
  startupId: string,
): Promise<StartupDocumentRecord[]> {
  const docs = await documentsRepository.listGenerated(startupId, "ic_memo");
  return docs.map(toRecord);
}

export async function getStartupDocument(
  startupId: string,
  documentId: string,
): Promise<StartupDocumentRecord | null> {
  const doc = await documentsRepository.findGeneratedInStartup(documentId, startupId);
  return doc ? toRecord(doc) : null;
}
