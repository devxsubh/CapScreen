import { CapTableCsv } from "../../models";
import { Startup } from "../../models";
import { ScreeningDigest } from "../../models";
import { runScreening } from "../screening/runScreening";
import { saveScreeningSnapshot } from "../screening/screeningDelta";
import { syncPortfolioMonitoringReview } from "./portfolioGrid";
import type { RiskLevel, ScreeningResult } from "../../types/screening";
import { ownerFilter } from "../../routes/startups/middleware";

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

async function resolveLatestCsvForPurpose(
  startupId: string,
  purpose: string,
): Promise<Record<string, unknown> | null> {
  return (await CapTableCsv.findOne({
    startupId,
    rosterPurpose: purpose,
    parseStatus: { $nin: ["invalid", "needs_review"] },
  })
    .sort({ uploadedAt: -1 })
    .lean()) as Record<string, unknown> | null;
}

async function resolveLatestCapTableCsv(
  startup: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const id = String(startup._id);
  let csvDoc = null as Record<string, unknown> | null;

  if (startup.latestCsvId) {
    csvDoc = (await CapTableCsv.findById(startup.latestCsvId as string).lean()) as
      | Record<string, unknown>
      | null;
  }
  if (!csvDoc) {
    csvDoc = await resolveLatestCsvForPurpose(id, "cap_table");
  }
  if (!csvDoc) {
    csvDoc = (await CapTableCsv.findOne({ startupId: id })
      .sort({ uploadedAt: -1 })
      .lean()) as Record<string, unknown> | null;
  }
  return csvDoc;
}

export async function runPortfolioRescreen(options?: {
  ownerId?: string;
  userEmail?: string;
}): Promise<{
  rescreened: number;
  total: number;
  digestId: string | null;
}> {
  const query = options?.ownerId ? ownerFilter(options.ownerId) : {};
  const startups = (await Startup.find(query).lean()) as unknown as Array<
    Record<string, unknown> & {
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
      csvDoc: Record<string, unknown> | null,
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

        await Startup.findByIdAndUpdate(id, update);
        if (purpose === "cap_table") {
          allChanges.push(...diffScreenings(prev, result, id, s.name));
          await saveScreeningSnapshot(id, "cap_table", result).catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    }

    const capCsv = (await CapTableCsv.findOne({
      startupId: id,
      rosterPurpose: { $in: ["cap_table", "entity_roster"] },
      parseStatus: { $nin: ["invalid", "needs_review"] },
    })
      .sort({ uploadedAt: -1 })
      .lean()) as Record<string, unknown> | null;

    const capFallback = capCsv ?? (await resolveLatestCapTableCsv(s));
    if (await screenOne(capFallback, "cap_table")) {
      rescreened += 1;
    }

    for (const purpose of ["co_investor", "vendor"] as const) {
      const csv = await resolveLatestCsvForPurpose(id, purpose);
      await screenOne(csv, purpose);
    }
  }

  await syncPortfolioMonitoringReview({
    userId: options?.ownerId ?? "preview-user",
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

  const digest = await ScreeningDigest.create({
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

export function startRescreenScheduler(): void {
  const enabled = process.env.RESCREEN_SCHEDULER_ENABLED === "true";
  if (!enabled) return;

  const hours = Number.parseInt(process.env.RESCREEN_INTERVAL_HOURS ?? "168", 10);
  const ms = Math.max(1, hours) * 60 * 60 * 1000;

  const tick = () => {
    void runPortfolioRescreen().catch((err) => {
      console.error("[rescreen-scheduler]", err);
    });
  };

  setTimeout(tick, 30_000);
  setInterval(tick, ms);
  console.log(`[rescreen-scheduler] enabled — every ${hours}h`);
}

export async function getLatestDigest() {
  return ScreeningDigest.findOne().sort({ generatedAt: -1 }).lean();
}
