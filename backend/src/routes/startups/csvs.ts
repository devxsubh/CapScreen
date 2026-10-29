import { Router } from "express";
import {
  deriveParseStatus,
  ingestCsv,
} from "../../lib/screening/csvIngest";
import { buildScreeningPreview } from "../../lib/screening/screeningPreview";
import { detectRosterPurpose } from "../../lib/screening/rosterPurpose";
import { extractCsvTable } from "../../lib/screening/parseCapTable";
import { rejectSampleWrite } from "./middleware";
import { AuditLog, CapTableCsv, Startup } from "../../models";
import { authIdentityOr500 } from "../../middleware/userIdentity";
import type { RosterPurpose } from "../../types/screening";
import { purposeStorageKey, toCsv } from "./serializers";

export const startupsCsvAnalyzeRouter = Router();
export const startupsCsvRouter = Router();

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

startupsCsvAnalyzeRouter.post("/analyze-csv", async (req, res) => {
  const { filename, content } = req.body as {
    filename?: string;
    content?: string;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  const preview = await buildScreeningPreview(content, filename?.trim());
  res.json(preview);
});

startupsCsvRouter.get("/:id/csvs", async (req, res) => {
  const list = await CapTableCsv.find({ startupId: req.params.id })
    .sort({ uploadedAt: -1 })
    .lean();
  const result = list.map(toCsv);
  res.json(result);
});

startupsCsvRouter.post("/:id/csvs/analyze", async (req, res) => {
  const { filename, content } = req.body as {
    filename?: string;
    content?: string;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  const preview = await buildScreeningPreview(content, filename?.trim());
  res.json(preview);
});

startupsCsvRouter.post("/:id/csvs", async (req, res) => {
  if (
    rejectSampleWrite(
      res,
      res.locals.accessibleStartup as Record<string, unknown> | undefined,
    )
  ) {
    return;
  }
  const { filename, content, confirmMapping } = req.body as {
    filename?: string;
    content?: string;
    confirmMapping?: boolean;
  };
  if (!filename?.trim() || !content?.trim()) {
    res.status(400).json({ detail: "filename and content are required" });
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

  const uploadIdentity = authIdentityOr500(res);
  if (!uploadIdentity) return;

  await AuditLog.create({
    startupId: req.params.id,
    eventType: "csv_uploaded",
    performedBy: uploadIdentity.userId,
    performedByEmail: uploadIdentity.userEmail,
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

startupsCsvRouter.patch("/:id/csvs/:csvId", async (req, res) => {
  const { content, confirmMapping } = req.body as {
    content?: string;
    confirmMapping?: boolean;
  };
  if (!content?.trim()) {
    res.status(400).json({ detail: "content is required" });
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

  const updateIdentity = authIdentityOr500(res);
  if (!updateIdentity) return;

  await AuditLog.create({
    startupId: req.params.id,
    eventType: "csv_updated",
    performedBy: updateIdentity.userId,
    performedByEmail: updateIdentity.userEmail,
    details: {
      csvId: req.params.csvId,
      recordCount,
      parseStatus,
      csvKind: ingest.csvKind,
    },
  });

  res.json(toCsv(csv));
});

startupsCsvRouter.delete("/:id/csvs/:csvId", async (req, res) => {
  const deleted = await CapTableCsv.findOneAndUpdate(
    { _id: req.params.csvId, startupId: req.params.id },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
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
