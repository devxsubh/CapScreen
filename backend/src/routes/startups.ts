import express from "express";
import mongoose from "mongoose";
import { connectDb } from "../lib/infra/db";
import { deriveParseStatus, ingestCsv, toIngestApiResponse } from "../lib/screening/csvIngest";
import { runScreening } from "../lib/screening/runScreening";
import { syncPortfolioMonitoringReview } from "../lib/portfolio/portfolioGrid";
import { detectRosterPurpose } from "../lib/screening/rosterPurpose";
import { runPortfolioRescreen } from "../lib/portfolio/rescreenScheduler";
import { extractCsvTable } from "../lib/screening/parseCapTable";
import {
  computeScreeningDelta,
  getStartupScreeningDelta,
  saveScreeningSnapshot,
} from "../lib/screening/screeningDelta";
import { syncEntityReviewStatus } from "../lib/tabular/reviewStatusSync";
import { Startup } from "../models/startup";
import { CapTableCsv } from "../models/capTableCsv";
import { StartupChat } from "../models/chat/startupChat";
import { EntityReview } from "../models/screening/entityReview";
import { AuditLog } from "../models/audit/auditLog";
import { StartupDocument } from "../models/documents/startupDocument";
import {
  createIcMemoDocument,
  getLatestIcMemo,
  getStartupDocument,
  listIcMemos,
} from "../lib/documents/icMemoDocument";
import { requireAuth } from "../middleware/requireAuth";
import type { ScreeningSummary, ScreeningResult, RosterPurpose } from "../types/screening";

export const startupsRouter = express.Router();

startupsRouter.use(requireAuth);
startupsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

function ownerFilter(userId: string) {
  return { ownerId: userId };
}

async function findOwnedStartup(id: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const s = await Startup.findOne({ _id: id, ...ownerFilter(userId) }).lean();
  return s;
}

startupsRouter.param("id", async (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const userId = res.locals.userId as string;
  const owned = await findOwnedStartup(id, userId);
  if (!owned) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  next();
});

// ── Portfolio summary (must be before /:id) ─────────────────────────────────

startupsRouter.get("/screening-summary", async (req, res) => {
  const userId = res.locals.userId as string;
  const list = await Startup.find(ownerFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  res.json(list.map(toScreeningSummary));
});

// ── Startups ────────────────────────────────────────────────────────────────

startupsRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const list = await Startup.find(ownerFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  res.json(list.map(toStartup));
});

startupsRouter.post("/", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ detail: "name is required" });
    return;
  }
  const s = await Startup.create({
    name: name.trim(),
    ownerId: res.locals.userId as string,
  });
  res.status(201).json(toStartup(s.toObject()));
});

startupsRouter.get("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const s = await findOwnedStartup(req.params.id, userId);
  if (!s) { res.status(404).json({ detail: "Startup not found" }); return; }
  res.json(toStartup(s));
});

startupsRouter.patch("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const { name } = req.body as { name?: string };
  const s = await Startup.findOneAndUpdate(
    { _id: req.params.id, ...ownerFilter(userId) },
    { ...(name?.trim() && { name: name.trim() }) },
    { new: true },
  ).lean();
  if (!s) { res.status(404).json({ detail: "Startup not found" }); return; }
  res.json(toStartup(s));
});

startupsRouter.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const s = await findOwnedStartup(req.params.id, userId);
  if (!s) { res.status(404).json({ detail: "Startup not found" }); return; }
  await Startup.findByIdAndDelete(req.params.id);
  await CapTableCsv.deleteMany({ startupId: req.params.id });
  await StartupChat.deleteOne({ startupId: req.params.id });
  await StartupDocument.deleteMany({ startupId: req.params.id });
  res.status(204).send();
});

// ── Cap-table CSVs ──────────────────────────────────────────────────────────

startupsRouter.post("/analyze-csv", async (req, res) => {
  const { filename, content } = req.body as {
    filename?: string;
    content?: string;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  const ingest = await ingestCsv(content, filename?.trim());
  res.json(toIngestApiResponse(ingest));
});

startupsRouter.get("/:id/csvs", async (req, res) => {
  const list = await CapTableCsv.find({ startupId: req.params.id })
    .sort({ uploadedAt: -1 })
    .lean();
  res.json(list.map(toCsv));
});

startupsRouter.post("/:id/csvs/analyze", async (req, res) => {
  const { filename, content } = req.body as {
    filename?: string;
    content?: string;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  const ingest = await ingestCsv(content, filename?.trim());
  res.json(toIngestApiResponse(ingest));
});

startupsRouter.post("/:id/csvs", async (req, res) => {
  const { filename, content, confirmMapping } = req.body as {
    filename?: string;
    content?: string;
    confirmMapping?: boolean;
  };
  if (!filename?.trim() || !content?.trim()) {
    res.status(400).json({ detail: "filename and content are required" });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }

  const ingest = await ingestCsv(content, filename.trim());
  const parseStatus = deriveParseStatus(ingest, confirmMapping);
  const table = extractCsvTable(content);
  const rosterPurpose = resolveRosterPurpose(
    filename.trim(),
    table?.headers ?? [],
    ingest.csvKind,
  );
  const recordCount =
    ingest.csvKind === "entity_roster"
      ? ingest.rosterEntities.length
      : ingest.records.length;

  const csv = await CapTableCsv.create({
    startupId: req.params.id,
    filename: filename.trim(),
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
  await Startup.findByIdAndUpdate(req.params.id, {
    latestCsvId: csv._id,
    [`latestCsvByPurpose.${purposeStorageKey(rosterPurpose)}`]: csv._id,
  });

  // Audit: csv_uploaded
  await AuditLog.create({
    startupId: req.params.id,
    eventType: "csv_uploaded",
    performedBy: res.locals.userId ?? "preview-user",
    performedByEmail: res.locals.userEmail ?? "admin@capscreen.local",
    details: {
      filename: filename.trim(),
      recordCount,
      parseStatus,
      csvKind: ingest.csvKind,
      parseSource: ingest.parseSource,
      canScreen: ingest.canScreen,
      rosterPurpose,
    },
  });

  res.status(201).json(toCsv(csv.toObject()));
});

startupsRouter.patch("/:id/csvs/:csvId", async (req, res) => {
  const { content, confirmMapping } = req.body as {
    content?: string;
    confirmMapping?: boolean;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }

  const ingest = await ingestCsv(content);
  const parseStatus = deriveParseStatus(ingest, confirmMapping);
  const recordCount =
    ingest.csvKind === "entity_roster"
      ? ingest.rosterEntities.length
      : ingest.records.length;

  const csv = await CapTableCsv.findOneAndUpdate(
    { _id: req.params.csvId, startupId: req.params.id },
    {
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
    },
    { new: true },
  ).lean();

  if (!csv) {
    res.status(404).json({ detail: "CSV not found" });
    return;
  }

  await AuditLog.create({
    startupId: req.params.id,
    eventType: "csv_updated",
    performedBy: res.locals.userId ?? "preview-user",
    performedByEmail: res.locals.userEmail ?? "admin@capscreen.local",
    details: {
      csvId: req.params.csvId,
      recordCount,
      parseStatus,
      csvKind: ingest.csvKind,
    },
  });

  res.json(toCsv(csv));
});

startupsRouter.delete("/:id/csvs/:csvId", async (req, res) => {
  const deleted = await CapTableCsv.findOneAndDelete({
    _id: req.params.csvId,
    startupId: req.params.id,
  });
  if (!deleted) {
    res.status(404).json({ detail: "CSV not found" });
    return;
  }

  const startup = (await Startup.findById(req.params.id).lean()) as
    | Record<string, unknown>
    | null;
  if (startup?.latestCsvId?.toString() === req.params.csvId) {
    const latest = (await CapTableCsv.findOne({ startupId: req.params.id })
      .sort({ uploadedAt: -1 })
      .lean()) as Record<string, unknown> | null;
    await Startup.findByIdAndUpdate(req.params.id, {
      latestCsvId: latest?._id ?? null,
    });
  }

  res.status(204).send();
});

// ── Portfolio re-screen (must be before /:id routes) ────────────────────────

startupsRouter.post("/rescreen-all", async (req, res) => {
  const result = await runPortfolioRescreen();
  res.json({
    rescreened: result.rescreened,
    total: result.total,
    digestId: result.digestId,
    results: [],
  });
});

// ── Screening ────────────────────────────────────────────────────────────────

startupsRouter.post("/:id/screen", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }

  const { csvId, purpose: purposeBody } = (req.body ?? {}) as {
    csvId?: string;
    purpose?: string;
  };

  const startup = (await Startup.findById(req.params.id).lean()) as
    | Record<string, unknown>
    | null;
  if (!startup) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }

  const purposeKey =
    purposeBody === "co_investor" || purposeBody === "vendor"
      ? purposeBody
      : "cap_table";

  let csvDoc = null as Record<string, unknown> | null;

  if (csvId && mongoose.Types.ObjectId.isValid(csvId)) {
    csvDoc = (await CapTableCsv.findOne({
      _id: csvId,
      startupId: req.params.id,
    }).lean()) as Record<string, unknown> | null;
  } else {
    const byPurpose = startup.latestCsvByPurpose as
      | Record<string, string>
      | undefined;
    const mappedId = byPurpose?.[purposeKey];
    if (mappedId) {
      csvDoc = (await CapTableCsv.findById(mappedId).lean()) as Record<
        string,
        unknown
      > | null;
    }
  }
  if (!csvDoc && purposeKey === "cap_table" && startup.latestCsvId) {
    csvDoc = (await CapTableCsv.findById(startup.latestCsvId as string).lean()) as
      | Record<string, unknown>
      | null;
  }
  if (!csvDoc) {
    csvDoc = (await CapTableCsv.findOne({
      startupId: req.params.id,
      rosterPurpose:
        purposeKey === "cap_table"
          ? { $in: ["cap_table", "entity_roster"] }
          : purposeKey,
    })
      .sort({ uploadedAt: -1 })
      .lean()) as Record<string, unknown> | null;
  }
  if (!csvDoc) {
    res.status(400).json({ detail: "No cap-table CSV uploaded for this startup" });
    return;
  }
  if (csvDoc.parseStatus === "invalid") {
    res.status(400).json({
      detail: "Latest CSV has parse errors — fix and re-upload before screening",
      parseErrors: csvDoc.parseErrors ?? [],
    });
    return;
  }
  if (csvDoc.parseStatus === "needs_review") {
    res.status(400).json({
      detail:
        "Latest CSV needs review — confirm the detected column mapping before screening",
      parseStatus: "needs_review",
    });
    return;
  }

  try {
    const result = await runScreening(csvDoc.content as string, {
      csvId: String(csvDoc._id),
      filename: csvDoc.filename as string | undefined,
    });
    const purpose = (csvDoc.rosterPurpose as RosterPurpose) ?? "cap_table";
    const storagePurpose =
      purpose === "co_investor"
        ? "co_investor"
        : purpose === "vendor"
          ? "vendor"
          : "cap_table";

    let delta = null;
    if (storagePurpose === "cap_table") {
      delta = await computeScreeningDelta(req.params.id, result);
      await saveScreeningSnapshot(req.params.id, "cap_table", result);
    }

    const update = screeningUpdateForPurpose(purpose, result, csvDoc._id);
    const updated = await Startup.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    ).lean();
    if (!updated) {
      res.status(404).json({ detail: "Startup not found" });
      return;
    }

    await syncPortfolioMonitoringReview({
      userId: res.locals.userId ?? "preview-user",
      userEmail: res.locals.userEmail ?? "admin@capscreen.local",
    }).catch(() => {});
    res.json({
      screeningResult: result,
      startup: toStartup(updated),
      delta,
      purpose: storagePurpose,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Screening failed";
    res.status(400).json({ detail });
  }
});

startupsRouter.post("/:id/ic-memo", async (req, res) => {
  const startup = (await Startup.findById(req.params.id).lean()) as
    | Record<string, unknown>
    | null;
  if (!startup) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const result = startup.lastScreeningResult as ScreeningResult | null;
  if (!result) {
    res.status(400).json({ detail: "No screening result — run a screen first" });
    return;
  }

  try {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string;
    const doc = await createIcMemoDocument({
      startupId: req.params.id,
      screeningResult: result,
      performedBy: userId,
      performedByEmail: userEmail,
    });
    res.status(201).json(doc);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to generate IC memo";
    res.status(500).json({ detail });
  }
});

startupsRouter.get("/:id/ic-memo", async (req, res) => {
  const docs = await listIcMemos(req.params.id);
  res.json(docs);
});

startupsRouter.get("/:id/ic-memo/latest", async (req, res) => {
  const doc = await getLatestIcMemo(req.params.id);
  if (!doc) {
    res.status(404).json({ detail: "No IC memo found" });
    return;
  }
  res.json(doc);
});

startupsRouter.get("/:id/ic-memo/:docId", async (req, res) => {
  const doc = await getStartupDocument(req.params.id, req.params.docId);
  if (!doc) {
    res.status(404).json({ detail: "Document not found" });
    return;
  }
  res.json(doc);
});

startupsRouter.get("/:id/screening-delta", async (req, res) => {
  const startup = (await Startup.findById(req.params.id).lean()) as
    | Record<string, unknown>
    | null;
  if (!startup?.lastScreeningResult) {
    res.json({
      hasPrevious: false,
      previousScreenedAt: null,
      changes: [],
      summary: "No screening on file.",
    });
    return;
  }
  const delta = await getStartupScreeningDelta(
    req.params.id,
    startup.lastScreeningResult as ScreeningResult,
  );
  res.json(delta);
});

startupsRouter.get("/:id/screening-report", async (req, res) => {
  const format = (req.query.format as string) ?? "json";
  const startup = (await Startup.findById(req.params.id).lean()) as
    | Record<string, unknown>
    | null;
  if (!startup) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const result = startup.lastScreeningResult as ScreeningResult | null;
  if (!result) {
    res.status(400).json({ detail: "No screening result" });
    return;
  }

  if (format === "csv") {
    const header =
      "entity,type,risk,match_score,ultimate_owner,ownership_path,sanctions_match\n";
    const rows = result.entities.map((e) => {
      const match = e.matches[0]?.sdnName ?? "";
      const path = e.ownershipPath.join(" → ");
      const score = e.topScore != null ? String(Math.round(e.topScore * 100)) : "";
      return [
        `"${e.name.replace(/"/g, '""')}"`,
        e.type,
        e.riskLevel,
        score,
        `"${(e.ultimateOwner ?? "").replace(/"/g, '""')}"`,
        `"${path.replace(/"/g, '""')}"`,
        `"${match.replace(/"/g, '""')}"`,
      ].join(",");
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(startup.name as string).replace(/\s+/g, "-")}-screening.csv"`,
    );
    res.send(header + rows.join("\n"));
    return;
  }

  res.json({
    startupName: startup.name,
    screenedAt: startup.lastScreenedAt,
    screeningResult: result,
  });
});

startupsRouter.patch("/:id/screening-result", async (req, res) => {
  const { screeningResult } = req.body as { screeningResult?: unknown };
  if (!screeningResult || typeof screeningResult !== "object") {
    res.status(400).json({ detail: "screeningResult is required" });
    return;
  }
  const s = await Startup.findByIdAndUpdate(
    req.params.id,
    { lastScreeningResult: screeningResult, lastScreenedAt: new Date() },
    { new: true },
  ).lean();
  if (!s) { res.status(404).json({ detail: "Startup not found" }); return; }
  res.json(toStartup(s));
});

// ── Entity reviews ───────────────────────────────────────────────────────────

// GET /api/startups/:id/entity-reviews
startupsRouter.get("/:id/entity-reviews", async (req, res) => {
  const reviews = await EntityReview.find({ startupId: req.params.id })
    .sort({ reviewedAt: -1 })
    .lean();
  res.json(reviews.map(toReview));
});

// POST /api/startups/:id/entity-reviews
startupsRouter.post("/:id/entity-reviews", async (req, res) => {
  const { entityName, status, notes } = req.body as {
    entityName?: string;
    status?: string;
    notes?: string;
  };
  const validStatuses = ["pending", "cleared", "escalated", "blocked"];
  if (!entityName?.trim()) {
    res.status(400).json({ detail: "entityName is required" });
    return;
  }
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ detail: "status must be one of: " + validStatuses.join(", ") });
    return;
  }

  const reviewedBy = res.locals.userId ?? "preview-user";
  const reviewedByEmail = res.locals.userEmail ?? "admin@capscreen.local";

  await syncEntityReviewStatus({
    startupId: req.params.id,
    entityName: entityName.trim(),
    status: status as "pending" | "cleared" | "escalated" | "blocked",
    notes: notes?.trim() ?? null,
    performedBy: reviewedBy,
    performedByEmail: reviewedByEmail,
  });

  const review = await EntityReview.findOne({
    startupId: req.params.id,
    entityName: entityName.trim(),
  }).lean();

  res.status(201).json(toReview(review as Record<string, unknown>));
});

// ── Screener chat ───────────────────────────────────────────────────────────

startupsRouter.get("/:id/chat", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const doc = (await StartupChat.findOne({ startupId: req.params.id }).lean()) as
    | { messages?: unknown[] }
    | null;
  res.json({ messages: doc?.messages ?? [] });
});

startupsRouter.put("/:id/chat", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ detail: "Startup not found" });
    return;
  }
  const { messages } = req.body as { messages?: unknown[] };
  if (!Array.isArray(messages)) {
    res.status(400).json({ detail: "messages array is required" });
    return;
  }
  await StartupChat.findOneAndUpdate(
    { startupId: req.params.id },
    { $set: { messages, updatedAt: new Date() } },
    { upsert: true },
  );
  res.json({ ok: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function toStartup(raw: unknown) {
  const s = raw as Record<string, unknown>;
  return {
    id: String(s._id),
    name: s.name,
    createdAt: s.createdAt,
    latestCsvId: s.latestCsvId ? String(s.latestCsvId) : null,
    latestCsvByPurpose: s.latestCsvByPurpose ?? {},
    lastScreeningResult: s.lastScreeningResult ?? null,
    lastScreenedAt: s.lastScreenedAt ?? null,
    lastScreenedCsvId: s.lastScreenedCsvId ? String(s.lastScreenedCsvId) : null,
    lastCoInvestorScreeningResult: s.lastCoInvestorScreeningResult ?? null,
    lastCoInvestorScreenedAt: s.lastCoInvestorScreenedAt ?? null,
    lastVendorScreeningResult: s.lastVendorScreeningResult ?? null,
    lastVendorScreenedAt: s.lastVendorScreenedAt ?? null,
    portfolioReviewStatus: s.portfolioReviewStatus ?? "pending",
    portfolioReviewNotes: s.portfolioReviewNotes ?? null,
  };
}

function toCsv(raw: unknown) {
  const c = raw as Record<string, unknown>;
  return {
    id: String(c._id),
    startupId: String(c.startupId),
    filename: c.filename,
    content: c.content,
    uploadedAt: c.uploadedAt,
    parseStatus: c.parseStatus ?? "pending",
    parseErrors: c.parseErrors ?? [],
    recordCount: c.recordCount ?? 0,
    csvKind: c.csvKind ?? null,
    parseSource: c.parseSource ?? null,
    confidence: c.confidence ?? null,
    columnMapping: c.columnMapping ?? null,
    normalizedContent: c.normalizedContent ?? null,
    ingestWarnings: c.ingestWarnings ?? [],
    rosterPurpose: c.rosterPurpose ?? "cap_table",
  };
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

function screeningUpdateForPurpose(
  purpose: RosterPurpose,
  result: ScreeningResult,
  csvId: unknown,
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

function toReview(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return {
    id: String(raw._id),
    startupId: String(raw.startupId),
    entityName: raw.entityName,
    status: raw.status,
    notes: raw.notes ?? null,
    reviewedBy: raw.reviewedBy,
    reviewedByEmail: raw.reviewedByEmail,
    reviewedAt: raw.reviewedAt,
  };
}

function toScreeningSummary(raw: unknown): ScreeningSummary {
  const s = raw as Record<string, unknown>;
  const result = s.lastScreeningResult as
    | {
        totalEntities?: number;
        flaggedCount?: number;
        reviewCount?: number;
        entities?: Array<{ name: string; riskLevel: string }>;
      }
    | null
    | undefined;

  let highestRiskEntity: string | null = null;
  let highestRiskLevel: ScreeningSummary["highestRiskLevel"] = null;

  if (result?.entities?.length) {
    const flagged = result.entities.find((e) => e.riskLevel === "flagged");
    const review = result.entities.find((e) => e.riskLevel === "review");
    const top = flagged ?? review ?? null;
    if (top) {
      highestRiskEntity = top.name;
      highestRiskLevel = top.riskLevel as ScreeningSummary["highestRiskLevel"];
    }
  }

  return {
    startupId: String(s._id),
    startupName: s.name as string,
    lastScreenedAt: s.lastScreenedAt
      ? new Date(s.lastScreenedAt as string).toISOString()
      : null,
    totalEntities: result?.totalEntities ?? 0,
    flaggedCount: result?.flaggedCount ?? 0,
    reviewCount: result?.reviewCount ?? 0,
    highestRiskEntity,
    highestRiskLevel,
  };
}
