import type { CurrentUser } from "../../http/currentUser";
import { notFound } from "../../http/httpError";
import { deriveParseStatus, ingestCsv } from "../../lib/screening/csvIngest";
import { extractCsvTable } from "../../lib/screening/parseCapTable";
import { detectRosterPurpose } from "../../lib/screening/rosterPurpose";
import { buildScreeningPreview } from "../../lib/screening/screeningPreview";
import type { CsvIngestResult, RosterPurpose } from "../../types/screening";
import { recordAuditEvent } from "../auditLogs/auditLogs.service";
import * as startupsRepository from "../startups/startups.repository";
import * as capTablesRepository from "./capTables.repository";
import type { CapTableCsvRecord } from "./capTables.repository";

/**
 * Cap-table and roster CSVs: every upload or edit is ingested (column mapping,
 * validation) so its parse status is known before anyone screens it.
 */

export type CsvInput = { content: string; confirmMapping?: boolean };

/** Dry run: what the CSV would look like once ingested. Nothing is stored. */
export async function preview(content: string, filename?: string) {
  return buildScreeningPreview(content, filename);
}

export async function listCsvs(startupId: string): Promise<CapTableCsvRecord[]> {
  return capTablesRepository.listForStartup(startupId);
}

export async function uploadCsv(
  startupId: string,
  input: CsvInput & { filename: string },
  user: CurrentUser,
): Promise<CapTableCsvRecord> {
  const ingest = await ingestCsv(input.content, input.filename);
  const fields = ingestFields(ingest, input.confirmMapping);
  const rosterPurpose = resolveRosterPurpose(
    input.filename,
    extractCsvTable(input.content)?.headers ?? [],
    ingest.csvKind,
  );

  const csv = await capTablesRepository.create({
    startupId,
    filename: input.filename,
    content: input.content,
    ...fields,
    rosterPurpose,
  });
  await startupsRepository.update(startupId, {
    latestCsvId: csv._id,
    [`latestCsvByPurpose.${purposeStorageKey(rosterPurpose)}`]: csv._id,
  });

  await recordAuditEvent(user, "csv_uploaded", startupId, {
    filename: input.filename,
    recordCount: fields.recordCount,
    parseStatus: fields.parseStatus,
    csvKind: ingest.csvKind,
    parseSource: ingest.parseSource,
    canScreen: ingest.canScreen,
    rosterPurpose,
  });
  return csv;
}

export async function updateCsv(
  startupId: string,
  csvId: string,
  input: CsvInput,
  user: CurrentUser,
): Promise<CapTableCsvRecord> {
  const ingest = await ingestCsv(input.content);
  const fields = ingestFields(ingest, input.confirmMapping);
  const csv = await capTablesRepository.updateInStartup(csvId, startupId, { content: input.content, ...fields });
  if (!csv) throw notFound("CSV not found");

  await recordAuditEvent(user, "csv_updated", startupId, {
    csvId,
    recordCount: fields.recordCount,
    parseStatus: fields.parseStatus,
    csvKind: ingest.csvKind,
  });
  return csv;
}

/** Soft-deletes the CSV; if it was the startup's latest, the next newest takes its place. */
export async function deleteCsv(startupId: string, csvId: string): Promise<void> {
  if (!(await capTablesRepository.softDelete(csvId, startupId))) throw notFound("CSV not found");

  const startup = await startupsRepository.findById(startupId);
  if (startup?.latestCsvId?.toString() === csvId) {
    const latest = await capTablesRepository.findLatest(startupId);
    await startupsRepository.update(startupId, { latestCsvId: latest?._id ?? null });
  }
}

function ingestFields(ingest: CsvIngestResult, confirmMapping?: boolean) {
  return {
    parseStatus: deriveParseStatus(ingest, confirmMapping),
    parseErrors: ingest.errors,
    recordCount: ingest.csvKind === "entity_roster" ? ingest.rosterEntities.length : ingest.records.length,
    csvKind: ingest.csvKind,
    parseSource: ingest.parseSource,
    confidence: ingest.confidence,
    columnMapping: ingest.columnMapping,
    normalizedContent: ingest.normalizedContent,
    ingestWarnings: ingest.warnings,
  };
}

function resolveRosterPurpose(filename: string, headers: string[], csvKind: string): RosterPurpose {
  const detected = detectRosterPurpose(filename, headers);
  if (detected !== "cap_table") return detected;
  if (csvKind === "entity_roster") return "entity_roster";
  return "cap_table";
}

/** Key under startup.latestCsvByPurpose; entity rosters count as cap tables. */
export function purposeStorageKey(purpose: RosterPurpose | string | undefined): "cap_table" | "co_investor" | "vendor" {
  if (purpose === "co_investor") return "co_investor";
  if (purpose === "vendor") return "vendor";
  return "cap_table";
}
