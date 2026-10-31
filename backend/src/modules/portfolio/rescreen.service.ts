import { readSettings } from "../../lib/infra/settings";
import { runScreening } from "../../lib/screening/runScreening";
import { LOCAL_USER_ID } from "../../middleware/requireAuth";
import type { RiskLevel, ScreeningResult } from "../../types/screening";
import * as capTablesRepository from "../capTables/capTables.repository";
import type { CapTableCsvRecord } from "../capTables/capTables.repository";
import { saveScreeningSnapshot } from "../screening/screeningDelta.service";
import * as startupsRepository from "../startups/startups.repository";
import type { StartupRecord } from "../startups/startups.repository";
import * as digestsRepository from "./digests.repository";
import { syncPortfolioMonitoringReview } from "./portfolioGrid.service";

/**
 * Portfolio re-screening: screens every startup's latest CSVs again (lists
 * change daily), records what got worse in a digest, and optionally posts the
 * digest to DIGEST_WEBHOOK_URL. Runs on demand or in the background.
 */

function entityRiskMap(
  result: ScreeningResult | null | undefined,
): Map<string, RiskLevel> {
  const map = new Map<string, RiskLevel>();
  for (const e of result?.entities ?? []) {
    map.set(e.name, e.riskLevel);
  }
  return map;
}

interface DigestChange {
  startupId: string;
  startupName: string;
  entityName: string;
  previousRisk: string | null;
  newRisk: string;
  matchScore: number | null;
}

function diffScreenings(
  prev: ScreeningResult | null | undefined,
  next: ScreeningResult,
  startupId: string,
  startupName: string,
): DigestChange[] {
  const prevMap = entityRiskMap(prev);
  const changes: DigestChange[] = [];

  for (const entity of next.entities) {
    const before = prevMap.get(entity.name) ?? null;
    const worsened =
      (before === "clear" || before === null) &&
      (entity.riskLevel === "review" || entity.riskLevel === "flagged");
    const escalated = before === "review" && entity.riskLevel === "flagged";

    if (worsened || escalated) {
      changes.push({
        startupId,
        startupName,
        entityName: entity.name,
        previousRisk: before,
        newRisk: entity.riskLevel,
        matchScore: entity.topScore,
      });
    }
  }

  return changes;
}

/**
 * The cap-table CSV to re-screen: newest screenable cap table or roster,
 * else the startup's latest upload, else its newest CSV of any kind.
 */
async function latestCapTableCsv(startup: StartupRecord): Promise<CapTableCsvRecord | null> {
  const id = String(startup._id);
  return (
    (await capTablesRepository.findLatestScreenable(id, ["cap_table", "entity_roster"])) ??
    (startup.latestCsvId ? await capTablesRepository.findById(startup.latestCsvId) : null) ??
    (await capTablesRepository.findLatest(id))
  );
}

export async function runPortfolioRescreen(options?: {
  ownerId?: string;
  userEmail?: string;
}): Promise<{
  rescreened: number;
  total: number;
  digestId: string | null;
}> {
  const startups = (await startupsRepository.listByOwner(options?.ownerId)) as Array<
    StartupRecord & {
      name: string;
      lastScreeningResult?: ScreeningResult | null;
      lastCoInvestorScreeningResult?: ScreeningResult | null;
      lastVendorScreeningResult?: ScreeningResult | null;
    }
  >;

  const allChanges: DigestChange[] = [];
  let rescreened = 0;

  for (const s of startups) {
    const id = String(s._id);

    async function screenOne(
      csvDoc: CapTableCsvRecord | null,
      purpose: "cap_table" | "co_investor" | "vendor",
    ): Promise<boolean> {
      if (
        !csvDoc ||
        csvDoc.parseStatus === "invalid" ||
        csvDoc.parseStatus === "needs_review"
      ) {
        return false;
      }

      const prev =
        purpose === "co_investor"
          ? s.lastCoInvestorScreeningResult
          : purpose === "vendor"
            ? s.lastVendorScreeningResult
            : s.lastScreeningResult;

      try {
        const result = await runScreening(csvDoc.content as string, {
          csvId: String(csvDoc._id),
          filename: csvDoc.filename as string | undefined,
        });

        const update: Record<string, unknown> = {};
        if (purpose === "co_investor") {
          update.lastCoInvestorScreeningResult = result;
          update.lastCoInvestorScreenedAt = new Date();
        } else if (purpose === "vendor") {
          update.lastVendorScreeningResult = result;
          update.lastVendorScreenedAt = new Date();
        } else {
          update.lastScreeningResult = result;
          update.lastScreenedAt = new Date();
          update.lastScreenedCsvId = csvDoc._id;
        }

        await startupsRepository.update(id, update);
        if (purpose === "cap_table") {
          allChanges.push(...diffScreenings(prev, result, id, s.name));
          await saveScreeningSnapshot(id, "cap_table", result).catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    }

    if (await screenOne(await latestCapTableCsv(s), "cap_table")) {
      rescreened += 1;
    }

    for (const purpose of ["co_investor", "vendor"] as const) {
      await screenOne(await capTablesRepository.findLatestScreenable(id, [purpose]), purpose);
    }
  }

  await syncPortfolioMonitoringReview({
    userId: options?.ownerId ?? LOCAL_USER_ID,
    userEmail: options?.userEmail ?? "admin@capscreen.local",
  });

  const newFlags = allChanges.filter((c) => c.newRisk === "flagged").length;
  const newReview = allChanges.filter((c) => c.newRisk === "review").length;

  let summaryText = `Re-screened ${rescreened} of ${startups.length} startups.`;
  if (allChanges.length === 0) {
    summaryText += " No new flags this cycle.";
  } else {
    summaryText += ` ${allChanges.length} new or escalated hit(s): ${newFlags} flagged, ${newReview} review.`;
  }

  const digest = await digestsRepository.create({
    rescreenedCount: rescreened,
    newFlagCount: newFlags,
    newReviewCount: newReview,
    changes: allChanges,
    summaryText,
  });

  const webhook = process.env.DIGEST_WEBHOOK_URL?.trim();
  if (webhook && allChanges.length > 0) {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: summaryText,
        changes: allChanges,
        digestId: String(digest._id),
      }),
    }).catch(() => {});
  }

  return {
    rescreened,
    total: startups.length,
    digestId: String(digest._id),
  };
}

const CHECK_EVERY_MS = 15 * 60 * 1000;
let rescreenRunning = false;

/**
 * Desktop background re-screening. Rather than a fixed timer from launch, this
 * checks every 15 minutes whether a run is due (last digest older than the
 * configured interval), so it catches up after sleep, restarts, or days off.
 */
export function startRescreenScheduler(): void {
  const tick = async () => {
    const { enabled, intervalHours } = readSettings().backgroundScreening;
    if (!enabled || rescreenRunning) return;
    const last = await digestsRepository.findLatest();
    const dueAt = (last?.generatedAt ? new Date(last.generatedAt as Date).getTime() : 0) + Math.max(1, intervalHours) * 3_600_000;
    if (Date.now() < dueAt) return;
    if ((await startupsRepository.countScreenable()) === 0) return;

    rescreenRunning = true;
    try {
      const r = await runPortfolioRescreen();
      console.log(`[rescreen-scheduler] re-screened ${r.rescreened}/${r.total} startups`);
    } catch (err) {
      console.error("[rescreen-scheduler]", err);
    } finally {
      rescreenRunning = false;
    }
  };

  // First check shortly after boot (Watchman lists need a minute to load).
  setTimeout(() => void tick(), 2 * 60_000).unref();
  setInterval(() => void tick(), CHECK_EVERY_MS).unref();
}

export async function getLatestDigest() {
  return digestsRepository.findLatest();
}
