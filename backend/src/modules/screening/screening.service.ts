import mongoose from "mongoose";
import type { CurrentUser } from "../../http/currentUser";
import { HttpError, badRequest, notFound } from "../../http/httpError";
import { friendlyLlmError } from "../../lib/llm/friendlyError";
import { syncPortfolioMonitoringReview } from "../portfolio/portfolioGrid.service";
import type { RiskLevel } from "../../lib/screening/classify";
import { explainMatch } from "../../lib/screening/explain";
import { runScreening } from "../../lib/screening/runScreening";
import {
  computeScreeningDelta,
  getStartupScreeningDelta,
  saveScreeningSnapshot,
} from "./screeningDelta.service";
import { WatchmanUnavailableError, type WatchmanMatch } from "../../lib/screening/watchman";
import type { RosterPurpose, ScreeningResult } from "../../types/screening";
import * as capTablesRepository from "../capTables/capTables.repository";
import type { CapTableCsvRecord } from "../capTables/capTables.repository";
import { purposeStorageKey } from "../capTables/capTables.service";
import * as startupsRepository from "../startups/startups.repository";
import type { StartupRecord } from "../startups/startups.repository";

type StoragePurpose = ReturnType<typeof purposeStorageKey>;

/**
 * Screens one of the startup's CSVs against Watchman and stores the result
 * on the startup (per purpose: cap table, co-investors, vendors). Cap-table
 * screens also keep a snapshot so the next screen can report what changed.
 * Fails closed: if Watchman is down this throws 503, never "clear".
 */
export async function screenStartup(
  startup: StartupRecord,
  input: { csvId?: string; purpose?: string },
  user: CurrentUser,
) {
  const startupId = String(startup._id);
  const csv = await findCsvToScreen(startup, input.csvId, purposeStorageKey(input.purpose));
  if (!csv) throw badRequest("No cap-table CSV uploaded for this startup");
  if (csv.parseStatus === "invalid") {
    throw badRequest("Latest CSV has parse errors — fix and re-upload before screening", {
      parseErrors: csv.parseErrors ?? [],
    });
  }
  if (csv.parseStatus === "needs_review") {
    throw badRequest("Latest CSV needs review — confirm the detected column mapping before screening", {
      parseStatus: "needs_review",
    });
  }

  try {
    const result = await runScreening(csv.content as string, {
      csvId: String(csv._id),
      filename: csv.filename as string | undefined,
    });
    const storagePurpose = purposeStorageKey(csv.rosterPurpose as RosterPurpose | undefined);

    let delta = null;
    if (storagePurpose === "cap_table") {
      delta = await computeScreeningDelta(startupId, result);
      await saveScreeningSnapshot(startupId, "cap_table", result);
    }

    const updated = await startupsRepository.update(startupId, resultFields(storagePurpose, result, csv._id));
    if (!updated) throw notFound("Startup not found");

    await syncPortfolioMonitoringReview(user).catch(() => {});
    return { screeningResult: result, startup: updated, delta, purpose: storagePurpose };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof WatchmanUnavailableError) throw new HttpError(503, err.message);
    throw badRequest(err instanceof Error ? err.message : "Screening failed");
  }
}

/**
 * The CSV to screen: the one asked for, else the latest for the purpose
 * (cap tables fall back to the startup's latest upload, then entity rosters).
 */
async function findCsvToScreen(
  startup: StartupRecord,
  csvId: string | undefined,
  purpose: StoragePurpose,
): Promise<CapTableCsvRecord | null> {
  const startupId = String(startup._id);
  if (csvId && mongoose.Types.ObjectId.isValid(csvId)) {
    return capTablesRepository.findInStartup(csvId, startupId);
  }
  const mappedId = (startup.latestCsvByPurpose as Record<string, string> | undefined)?.[purpose];
  const mapped = mappedId ? await capTablesRepository.findById(mappedId) : null;
  if (mapped) return mapped;
  if (purpose === "cap_table" && startup.latestCsvId) {
    const latest = await capTablesRepository.findById(startup.latestCsvId);
    if (latest) return latest;
  }
  return capTablesRepository.findLatest(startupId, purpose === "cap_table" ? ["cap_table", "entity_roster"] : [purpose]);
}

function resultFields(purpose: StoragePurpose, result: ScreeningResult, csvId: unknown): Record<string, unknown> {
  if (purpose === "co_investor") {
    return { lastCoInvestorScreeningResult: result, lastCoInvestorScreenedAt: new Date() };
  }
  if (purpose === "vendor") {
    return { lastVendorScreeningResult: result, lastVendorScreenedAt: new Date() };
  }
  return { lastScreeningResult: result, lastScreenedAt: new Date(), lastScreenedCsvId: csvId };
}

/** What changed since the previous cap-table screen. */
export async function getDelta(startup: StartupRecord) {
  if (!startup.lastScreeningResult) {
    return { hasPrevious: false, previousScreenedAt: null, changes: [], summary: "No screening on file." };
  }
  return getStartupScreeningDelta(String(startup._id), startup.lastScreeningResult as ScreeningResult);
}

export function latestResult(startup: StartupRecord): ScreeningResult {
  const result = startup.lastScreeningResult as ScreeningResult | null;
  if (!result) throw badRequest("No screening result");
  return result;
}

const AI_DISCLAIMER =
  "DRAFT AI NARRATIVE — screening aid only; not a legal determination or sanctions confirmation";

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** One row per entity; rows with an AI narrative carry the disclaimer. */
export function reportCsv(result: ScreeningResult): string {
  const header =
    "entity,type,risk,match_score,ultimate_owner,ownership_path,sanctions_match,explanation,ai_narrative_disclaimer\n";
  const rows = result.entities.map((e) => {
    const explanation = e.explanation ?? "";
    return [
      csvCell(e.name),
      e.type,
      e.riskLevel,
      e.topScore != null ? String(Math.round(e.topScore * 100)) : "",
      csvCell(e.ultimateOwner ?? ""),
      csvCell(e.ownershipPath.join(" → ")),
      csvCell(e.matches[0]?.sdnName ?? ""),
      csvCell(explanation),
      csvCell(explanation ? AI_DISCLAIMER : ""),
    ].join(",");
  });
  return header + rows.join("\n");
}

export type ExplainInput = {
  name: string;
  type: "person" | "company";
  riskLevel: RiskLevel;
  matches: WatchmanMatch[];
  ownershipPath: string[];
  context: Parameters<typeof explainMatch>[4];
};

/** Analyst narrative for one entity, written by the utility model. */
export async function explain(input: ExplainInput): Promise<string> {
  try {
    return await explainMatch(
      { name: input.name, type: input.type },
      input.matches,
      input.ownershipPath,
      input.riskLevel,
      input.context,
    );
  } catch (err) {
    throw new HttpError(500, friendlyLlmError(err));
  }
}
