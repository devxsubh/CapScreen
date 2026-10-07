import { readFileSync } from "fs";
import { join } from "path";
import mongoose from "mongoose";
import {
  AssistantChat,
  CapTableCsv,
  EntityReview,
  Startup,
  StartupDocument,
  TabularCell,
  TabularReview,
  findUserByEmail,
} from "../../src/models";
import { connectDb, disconnectDb } from "../../src/lib/infra/db";
import { ingestCsv, deriveParseStatus } from "../../src/lib/screening/csvIngest";
import { extractCsvTable } from "../../src/lib/screening/parseCapTable";
import { detectRosterPurpose } from "../../src/lib/screening/rosterPurpose";
import { runScreening } from "../../src/lib/screening/runScreening";
import {
  SAMPLE_SYSTEM_USER_ID,
} from "../../src/lib/sample/sampleAssets";
import {
  seedEntityScreeningReview,
} from "../../src/lib/portfolio/portfolioGrid";
import {
  entityToCells,
  riskToFlag,
} from "../../src/lib/tabular/tabularScreening";
import type { ColumnConfig } from "../../src/types/tabular";
import type { EntityResult, RosterPurpose, ScreeningResult } from "../../src/types/screening";

export const DEMO_STARTUP_NAME = "NexaFlow AI Inc (Demo)";

const SAMPLE_DIR = join(__dirname, "../../sample-data/showcase");

const TRIAGE_COLUMNS: ColumnConfig[] = [
  { index: 0, name: "Entity", format: "text", prompt: "Entity name." },
  { index: 1, name: "Risk", format: "tag", prompt: "Review or Flagged." },
  { index: 2, name: "Match Score", format: "text", prompt: "Match confidence 0–100%." },
  { index: 3, name: "Source List", format: "text", prompt: "Sanctions list source." },
  {
    index: 4,
    name: "Ownership Path",
    format: "text",
    prompt: "Ownership chain to portfolio company.",
  },
  {
    index: 5,
    name: "Recommended Action",
    format: "text",
    prompt: "Suggested next step.",
  },
  { index: 6, name: "Analyst Notes", format: "text", prompt: "Reviewer notes." },
  { index: 7, name: "Status", format: "text", prompt: "Human disposition." },
];

export type SeedOptions = {
  userId: string;
  userEmail: string;
  reset: boolean;
  dryRun: boolean;
};

export type SeedResult = {
  startupId: string;
  entityReviewId: string;
  triageReviewId: string;
  capTableCsvId: string;
  screening: {
    capTable: ScreeningResult;
    coInvestor: ScreeningResult | null;
    vendor: ScreeningResult | null;
  };
};

function readSample(name: string): string {
  return readFileSync(join(SAMPLE_DIR, name), "utf-8");
}

function purposeStorageKey(purpose: RosterPurpose): string {
  if (purpose === "co_investor") return "co_investor";
  if (purpose === "vendor") return "vendor";
  return "cap_table";
}

function resolveRosterPurpose(
  filename: string,
  headers: string[],
  csvKind: string,
): RosterPurpose {
  const detected = detectRosterPurpose(filename, headers);
  if (detected !== "cap_table") return detected;
  if (csvKind === "entity_roster") return "entity_roster";
  return "cap_table";
}

async function uploadCsv(
  startupId: string,
  filename: string,
  content: string,
): Promise<{ csvId: string; purpose: RosterPurpose }> {
  const ingest = await ingestCsv(content, filename);
  const parseStatus = deriveParseStatus(ingest, true);
  const table = extractCsvTable(content);
  const rosterPurpose = resolveRosterPurpose(
    filename,
    table?.headers ?? [],
    ingest.csvKind,
  );
  const recordCount =
    ingest.csvKind === "entity_roster"
      ? ingest.rosterEntities.length
      : ingest.records.length;

  const csv = await CapTableCsv.create({
    startupId,
    filename,
    content,
    parseStatus,
    parseErrors: ingest.errors,
    recordCount,
    csvKind: ingest.csvKind,
    parseSource: ingest.parseSource,
    confidence: ingest.confidence,
    columnMapping: ingest.columnMapping,
    normalizedContent: ingest.normalizedContent,
    ingestWarnings: ingest.warnings,
    rosterPurpose,
  });

  await Startup.findByIdAndUpdate(startupId, {
    latestCsvId: csv._id,
    [`latestCsvByPurpose.${purposeStorageKey(rosterPurpose)}`]: csv._id,
  });

  return { csvId: String(csv._id), purpose: rosterPurpose };
}

async function screenCsv(
  csvId: string,
  filename: string,
  content: string,
): Promise<ScreeningResult> {
  return runScreening(content, {
    csvId,
    filename,
    skipNarratives: true,
  });
}

function screeningUpdate(
  purpose: RosterPurpose,
  result: ScreeningResult,
  csvId: string,
): Record<string, unknown> {
  if (purpose === "co_investor") {
    return {
      lastCoInvestorScreeningResult: result,
      lastCoInvestorScreenedAt: new Date(),
    };
  }
  if (purpose === "vendor") {
    return {
      lastVendorScreeningResult: result,
      lastVendorScreenedAt: new Date(),
    };
  }
  return {
    lastScreeningResult: result,
    lastScreenedAt: new Date(),
    lastScreenedCsvId: csvId,
  };
}

function triageEntityToCells(entity: EntityResult): Map<
  number,
  { summary: string; flag: "green" | "grey" | "yellow" | "red" }
> {
  const topMatch = entity.matches[0];
  const scorePct =
    entity.topScore != null ? `${Math.round(entity.topScore * 100)}%` : "—";
  const path =
    entity.ownershipPath.length > 0
      ? entity.ownershipPath.join(" → ")
      : "N/A";

  const action =
    entity.riskLevel === "flagged"
      ? "Escalate to CCO; OFAC 50% rule check; freeze pending human review"
      : "Alias review; adverse media check; confirm identity before clearance";

  const map = new Map<
    number,
    { summary: string; flag: "green" | "grey" | "yellow" | "red" }
  >();
  map.set(0, { summary: entity.name, flag: riskToFlag(entity.riskLevel) });
  map.set(1, {
    summary: entity.riskLevel === "review" ? "Review" : "Flagged",
    flag: riskToFlag(entity.riskLevel),
  });
  map.set(2, { summary: scorePct, flag: riskToFlag(entity.riskLevel) });
  map.set(3, {
    summary: topMatch?.programs?.join(", ") ?? "—",
    flag: "grey",
  });
  map.set(4, { summary: path, flag: "grey" });
  map.set(5, { summary: action, flag: riskToFlag(entity.riskLevel) });
  map.set(6, { summary: "", flag: "grey" });
  map.set(7, { summary: "", flag: "grey" });
  return map;
}

async function seedTriageReview(params: {
  userId: string;
  userEmail: string;
  startupId: string;
  startupName: string;
  screeningResult: ScreeningResult;
}): Promise<string> {
  const flaggedOrReview = params.screeningResult.entities.filter(
    (e) => e.riskLevel === "flagged" || e.riskLevel === "review",
  );

  const rowIds: string[] = [];
  const rows: { id: string; name: string; meta: Record<string, unknown> }[] =
    [];

  for (const entity of flaggedOrReview) {
    const id = `entity:${encodeURIComponent(entity.name)}`;
    rowIds.push(id);
    rows.push({
      id,
      name: entity.name,
      meta: { riskLevel: entity.riskLevel },
    });
  }

  const review = await TabularReview.create({
    userId: SAMPLE_SYSTEM_USER_ID,
    userEmail: params.userEmail,
    title: `${params.startupName} — Sanctions Triage Queue`,
    projectId: new mongoose.Types.ObjectId(params.startupId),
    workflowId: "builtin-sanctions-triage",
    reviewKind: "standard",
    isSample: true,
    columnsConfig: TRIAGE_COLUMNS,
    rowIds,
    rows,
  });

  const cellOps = [];
  for (const entity of flaggedOrReview) {
    const docId = `entity:${encodeURIComponent(entity.name)}`;
    const colMap = triageEntityToCells(entity);
    for (const [colIdx, cell] of colMap) {
      cellOps.push({
        reviewId: review._id,
        documentId: docId,
        columnIndex: colIdx,
        content: { summary: cell.summary, flag: cell.flag, reasoning: "" },
        status: "done",
      });
    }
  }
  if (cellOps.length > 0) {
    await TabularCell.insertMany(cellOps);
  }

  return String(review._id);
}

function findEntity(
  result: ScreeningResult,
  name: string,
): EntityResult | undefined {
  return result.entities.find((e) => e.name === name);
}

function topFlaggedEntity(result: ScreeningResult): EntityResult | undefined {
  return (
    result.entities.find((e) => e.riskLevel === "flagged") ??
    result.entities.find((e) => e.riskLevel === "review")
  );
}

async function seedStartupDocuments(
  startupId: string,
  capTableResult: ScreeningResult,
): Promise<{ ddChecklistDocId: string; icMemoDocId: string }> {
  const screenedAt =
    capTableResult.screenedAt ?? new Date().toISOString().slice(0, 10);

  const dd = await StartupDocument.create({
    startupId,
    kind: "custom",
    title: "Due Diligence Checklist — NexaFlow Series A",
    content: readSample("due-diligence-checklist.md"),
    screeningScreenedAt: screenedAt,
  });

  const ddMemo = await StartupDocument.create({
    startupId,
    kind: "screening_analysis",
    title: "Series A DD Memo — Sanctions Screening (Draft)",
    content: readSample("series-a-dd-memo.md"),
    screeningScreenedAt: screenedAt,
  });

  const focus =
    findEntity(capTableResult, "Ivan Petrovich Kozlov") ??
    topFlaggedEntity(capTableResult);
  const exceptions = capTableResult.entities
    .filter((e) => e.riskLevel !== "clear")
    .slice(0, 6);
  const icContent =
    `# Investment Committee Compliance Memo\n\n` +
    `**Company:** NexaFlow AI Inc  \n` +
    `**Screened:** ${screenedAt}  \n` +
    `**Entities:** ${capTableResult.totalEntities} | **Flagged:** ${capTableResult.flaggedCount} | **Review:** ${capTableResult.reviewCount}\n\n` +
    `## Executive summary\n\n` +
    `The fund screened NexaFlow's extended Series A cap table. **${capTableResult.flaggedCount} flagged** and **${capTableResult.reviewCount} review** entities require human verification; the majority cleared. Highest priority: **${focus?.name ?? "see triage queue"}**.\n\n` +
    `## Flagged / review entities\n\n` +
    exceptions
      .map(
        (e) =>
          `- **${e.name}** — ${e.riskLevel}; ${e.ownershipPath.length > 1 ? `${e.ownershipPath.length - 1}-layer chain` : "direct"}`,
      )
      .join("\n") +
    `\n\n` +
    `## Recommended next steps\n\n` +
    `1. CCO escalation on Ivan Kozlov potential match\n` +
    `2. Alias review for Johan Kozlov and Mohammed Al Rahman\n` +
    `3. Enhanced KYC on Cascade SPV and offshore intermediaries\n` +
    `4. IC vote contingent on compliance sign-off\n\n` +
    `*Decision support only — not a legal determination.*`;

  const ic = await StartupDocument.create({
    startupId,
    kind: "ic_memo",
    title: "IC Compliance Memo — NexaFlow AI Inc",
    content: icContent,
    screeningScreenedAt: screenedAt,
  });

  return {
    ddChecklistDocId: String(dd._id),
    icMemoDocId: String(ic._id),
  };
}

async function seedEntityReviews(
  startupId: string,
  userId: string,
  userEmail: string,
  entityReviewId: string,
  screeningResult: ScreeningResult,
): Promise<void> {
  const flagged = screeningResult.entities.filter((e) => e.riskLevel === "flagged");
  const review = screeningResult.entities.filter((e) => e.riskLevel === "review");

  const reviews: Array<{
    entityName: string;
    status: "pending" | "cleared" | "escalated" | "blocked";
    notes: string;
  }> = [];

  if (flagged[0]) {
    reviews.push({
      entityName: flagged[0].name,
      status: "escalated",
      notes: "Top flagged entity — CCO notified; pending OFAC 50% rule analysis",
    });
  }
  if (review[0]) {
    reviews.push({
      entityName: review[0].name,
      status: "pending",
      notes: "Near-match — alias review scheduled",
    });
  }
  if (review[1]) {
    reviews.push({
      entityName: review[1].name,
      status: "cleared",
      notes: "Cleared after transliteration review — no primary SDN match",
    });
  }

  for (const r of reviews) {
    await EntityReview.findOneAndUpdate(
      { startupId, entityName: r.entityName },
      {
        $set: {
          status: r.status,
          notes: r.notes,
          reviewedBy: userId,
          reviewedByEmail: userEmail,
          reviewedAt: new Date(),
        },
      },
      { upsert: true },
    );

    const docId = `entity:${encodeURIComponent(r.entityName)}`;
    await TabularCell.findOneAndUpdate(
      {
        reviewId: entityReviewId,
        documentId: docId,
        columnIndex: 9,
      },
      {
        $set: {
          content: {
            summary: r.status,
            flag: "grey",
            reasoning: r.notes,
          },
          status: "done",
        },
      },
      { upsert: true },
    );
  }
}

async function cleanupGlobalSample(): Promise<void> {
  await AssistantChat.deleteMany({ isSample: true });

  const sampleStartups = await Startup.find({
    $or: [{ isSample: true }, { name: DEMO_STARTUP_NAME }],
  }).lean();

  for (const existing of sampleStartups) {
    const id = String(existing._id);

    const reviewIds = (
      await TabularReview.find({ projectId: id }).select("_id").lean()
    ).map((r) => r._id);

    if (reviewIds.length > 0) {
      await TabularCell.deleteMany({ reviewId: { $in: reviewIds } });
    }
    await Promise.all([
      TabularReview.deleteMany({ projectId: id }),
      CapTableCsv.deleteMany({ startupId: id }),
      StartupDocument.deleteMany({ startupId: id }),
      EntityReview.deleteMany({ startupId: id }),
      AssistantChat.deleteMany({ projectId: id }),
      Startup.findByIdAndDelete(id),
    ]);
  }
}

export async function resolveSeedUser(
  email?: string,
): Promise<{ userId: string; userEmail: string }> {
  if (email) {
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error(`No user found for email: ${email}`);
    }
    return {
      userId: user._id.toString(),
      userEmail: user.email,
    };
  }
  return { userId: "preview-user", userEmail: "admin@capscreen.local" };
}

async function retireLegacyPerUserDemos(): Promise<void> {
  const now = new Date();
  await Startup.updateMany(
    { name: DEMO_STARTUP_NAME, isSample: { $ne: true }, deletedAt: null },
    { $set: { deletedAt: now } },
  );
}

export async function seedDemoShowcase(
  options: SeedOptions,
): Promise<SeedResult> {
  await connectDb();

  try {
    if (!options.dryRun) {
      await retireLegacyPerUserDemos();
    }

    if (options.reset) {
      console.log("Removing existing global sample data (if any)…");
      if (!options.dryRun) {
        await cleanupGlobalSample();
      }
    }

    if (options.dryRun) {
      console.log("[dry-run] Would create demo startup and related records.");
      return {
        startupId: "(dry-run)",
        entityReviewId: "(dry-run)",
        triageReviewId: "(dry-run)",
        capTableCsvId: "(dry-run)",
        screening: {
          capTable: {} as ScreeningResult,
          coInvestor: null,
          vendor: null,
        },
      };
    }

    console.log("Creating global sample startup (visible to all users)…");
    const startup = await Startup.create({
      name: DEMO_STARTUP_NAME,
      ownerId: SAMPLE_SYSTEM_USER_ID,
      isSample: true,
      portfolioReviewStatus: "escalated",
      portfolioReviewNotes:
        "Demo dataset — shared sample workspace for all users",
    });
    const startupId = String(startup._id);

    console.log("Uploading CSVs…");
    const capCsv = readSample("demo-cap-table-extended.csv");
    const { csvId: capTableCsvId } = await uploadCsv(
      startupId,
      "demo-cap-table-extended.csv",
      capCsv,
    );

    const coCsv = readFileSync(
      join(__dirname, "../../sample-data/sample-co-investors.csv"),
      "utf-8",
    );
    await uploadCsv(startupId, "sample-co-investors.csv", coCsv);

    const vendorCsv = readFileSync(
      join(__dirname, "../../sample-data/sample-vendors.csv"),
      "utf-8",
    );
    await uploadCsv(startupId, "sample-vendors.csv", vendorCsv);

    console.log("Running sanctions screening (Watchman required)…");
    const capTableResult = await screenCsv(
      capTableCsvId,
      "demo-cap-table-extended.csv",
      capCsv,
    );
    await Startup.findByIdAndUpdate(
      startupId,
      screeningUpdate("cap_table", capTableResult, capTableCsvId),
    );

    let coInvestorResult: ScreeningResult | null = null;
    let vendorResult: ScreeningResult | null = null;

    try {
      coInvestorResult = await screenCsv(
        "co-investor",
        "sample-co-investors.csv",
        coCsv,
      );
      await Startup.findByIdAndUpdate(
        startupId,
        screeningUpdate("co_investor", coInvestorResult, "co-investor"),
      );
    } catch (err) {
      console.warn("Co-investor screening skipped:", err);
    }

    try {
      vendorResult = await screenCsv(
        "vendor",
        "sample-vendors.csv",
        vendorCsv,
      );
      await Startup.findByIdAndUpdate(
        startupId,
        screeningUpdate("vendor", vendorResult, "vendor"),
      );
    } catch (err) {
      console.warn("Vendor screening skipped:", err);
    }

    console.log(
      `Cap table screen: ${capTableResult.flaggedCount} flagged, ${capTableResult.reviewCount} review, ${capTableResult.totalEntities} total`,
    );

    console.log("Creating tabular reviews…");
    const { reviewId: entityReviewId } = await seedEntityScreeningReview({
      userId: SAMPLE_SYSTEM_USER_ID,
      userEmail: options.userEmail,
      startupId,
      startupName: DEMO_STARTUP_NAME,
      screeningResult: capTableResult,
      title: `${DEMO_STARTUP_NAME} — Cap Table Sanctions Review`,
    });
    await TabularReview.findByIdAndUpdate(entityReviewId, {
      $set: { isSample: true },
    });

    const triageReviewId = await seedTriageReview({
      userId: SAMPLE_SYSTEM_USER_ID,
      userEmail: options.userEmail,
      startupId,
      startupName: DEMO_STARTUP_NAME,
      screeningResult: capTableResult,
    });

    await seedEntityReviews(
      startupId,
      options.userId,
      options.userEmail,
      entityReviewId,
      capTableResult,
    );

    console.log("Creating project documents…");
    await seedStartupDocuments(startupId, capTableResult);

    return {
      startupId,
      entityReviewId,
      triageReviewId,
      capTableCsvId,
      screening: {
        capTable: capTableResult,
        coInvestor: coInvestorResult,
        vendor: vendorResult,
      },
    };
  } finally {
    await disconnectDb();
  }
}
