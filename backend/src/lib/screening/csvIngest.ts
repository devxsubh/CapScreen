import { inferCsvSchema } from "./inferCsvSchema";
import {
  buildNormalizedCsv,
  extractCsvTable,
  guessHeuristicColumnMapping,
  guessShareholderScheduleMapping,
  rosterMappingFromCapTableColumns,
  parseCapTableDetailed,
  parseRosterWithMapping,
  parseWithMapping,
} from "./parseCapTable";
import type {
  ColumnMapping,
  CsvIngestResult,
  ParseSource,
} from "../../types/screening";

const CONFIDENCE_REVIEW_THRESHOLD = 0.75;

const FIELD_LABELS: Record<string, string> = {
  entity: "Entity / company",
  owner: "Owner / shareholder",
  ownership_pct: "Ownership %",
  name: "Entity name",
};

const FIELD_SUGGESTIONS: Record<string, string> = {
  entity: '"entity", "company", or "investee"',
  owner: '"owner", "shareholder", or "investor"',
  ownership_pct: '"ownership_pct", "% Stake", or "ownership"',
  name: '"name", "entity", or "company"',
};

function emptyResult(overrides: Partial<CsvIngestResult>): CsvIngestResult {
  return {
    csvKind: "unknown",
    parseSource: "strict",
    confidence: 0,
    columnMapping: null,
    records: [],
    rosterEntities: [],
    normalizedContent: null,
    warnings: [],
    errors: [],
    missingRequiredFields: [],
    canScreen: false,
    userMessage: "",
    ...overrides,
  };
}

function capTableRequiredFields(mapping: ColumnMapping | null): string[] {
  const missing: string[] = [];
  if (!mapping?.entity) missing.push("entity");
  if (!mapping?.owner) missing.push("owner");
  if (!mapping?.ownership_pct) missing.push("ownership_pct");
  return missing;
}

function rosterRequiredFields(mapping: ColumnMapping | null): string[] {
  if (!mapping?.name) return ["name"];
  return [];
}

export function validateIngestResult(
  result: Omit<
    CsvIngestResult,
    "missingRequiredFields" | "canScreen" | "userMessage"
  >,
): Pick<CsvIngestResult, "missingRequiredFields" | "canScreen" | "userMessage"> {
  if (result.csvKind === "reference_metadata") {
    return {
      missingRequiredFields: [],
      canScreen: false,
      userMessage:
        result.explanation ??
        "This file looks like reference or dataset metadata, not a cap table or entity list. Upload a CSV with company/owner rows or a single-column list of entity names to screen.",
    };
  }

  if (result.csvKind === "unknown") {
    return {
      missingRequiredFields: [],
      canScreen: false,
      userMessage:
        result.explanation ??
        "We could not determine how to read this CSV. Try our sample cap-table format or a single-column entity list.",
    };
  }

  if (result.csvKind === "ownership_cap_table") {
    const missing = capTableRequiredFields(result.columnMapping);
    if (missing.length > 0) {
      const bullets = missing
        .map(
          (f) =>
            `${FIELD_LABELS[f] ?? f} (e.g. ${FIELD_SUGGESTIONS[f] ?? f})`,
        )
        .join("; ");
      return {
        missingRequiredFields: missing,
        canScreen: false,
        userMessage: `This file looks like a cap table but is missing required columns: ${bullets}.`,
      };
    }
    if (result.records.length === 0) {
      return {
        missingRequiredFields: [],
        canScreen: false,
        userMessage:
          "No valid ownership rows found. Each row needs an entity, owner, and ownership %.",
      };
    }
    const blockingErrors = result.errors.filter((e) => e.row > 1);
    if (blockingErrors.length > 0 && result.records.length === 0) {
      return {
        missingRequiredFields: [],
        canScreen: false,
        userMessage: `Row errors prevented screening: ${blockingErrors
          .slice(0, 3)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join("; ")}`,
      };
    }
    return {
      missingRequiredFields: [],
      canScreen: true,
      userMessage: "",
    };
  }

  if (result.csvKind === "entity_roster") {
    const missing = rosterRequiredFields(result.columnMapping);
    if (missing.length > 0) {
      return {
        missingRequiredFields: missing,
        canScreen: false,
        userMessage: `This file looks like an entity list but is missing a name column (e.g. ${FIELD_SUGGESTIONS.name}).`,
      };
    }
    if (result.rosterEntities.length === 0) {
      return {
        missingRequiredFields: [],
        canScreen: false,
        userMessage: "No valid entity names found in this file.",
      };
    }
    return {
      missingRequiredFields: [],
      canScreen: true,
      userMessage: "",
    };
  }

  return {
    missingRequiredFields: [],
    canScreen: false,
    userMessage: "This file cannot be screened.",
  };
}

export function deriveParseStatus(
  result: CsvIngestResult,
  confirmMapping?: boolean,
): "valid" | "invalid" | "needs_review" {
  if (!result.canScreen) return "invalid";
  if (result.confidence < CONFIDENCE_REVIEW_THRESHOLD && !confirmMapping) {
    return "needs_review";
  }
  if (
    result.warnings.length > 0 ||
    result.errors.some((e) => e.row > 1) ||
    result.confidence < CONFIDENCE_REVIEW_THRESHOLD
  ) {
    return confirmMapping ? "valid" : "needs_review";
  }
  return "valid";
}

function detectReferenceHeuristic(
  table: NonNullable<ReturnType<typeof extractCsvTable>>,
  filename?: string,
): boolean {
  const fn = (filename ?? "").toLowerCase();
  if (fn.includes("opensanctions") && fn.includes("source")) return true;

  const joined = table.headers.join(" ").toLowerCase();
  const urlHeavy =
    table.rows.slice(0, 5).some((row) =>
      row.some((c) => /^https?:\/\//i.test(c)),
    );
  const metaHeaders =
    /url|source|dataset|publisher|coverage|data_file|index_url/.test(joined);
  const noOwnership =
    !guessHeuristicColumnMapping(table) ||
    (!table.normalizedHeaders.some((h) =>
      /owner|shareholder|investor|ownership|stake|percent/.test(h),
    ) &&
      !table.normalizedHeaders.includes("entity"));

  return urlHeavy && metaHeaders && noOwnership;
}

function buildFromCapTable(
  csv: string,
  mapping: ColumnMapping,
  parseSource: ParseSource,
  confidence: number,
  warnings: string[],
): Omit<CsvIngestResult, "missingRequiredFields" | "canScreen" | "userMessage"> {
  if (!mapping.entity_type) {
    warnings.push("entity_type not mapped — defaulting to company");
  }
  if (!mapping.owner_type) {
    warnings.push("owner_type not mapped — defaulting to company");
  }

  const { records, errors } = parseWithMapping(csv, mapping);
  return {
    csvKind: "ownership_cap_table",
    parseSource,
    confidence,
    columnMapping: mapping,
    records,
    rosterEntities: [],
    normalizedContent: records.length > 0 ? buildNormalizedCsv(records) : null,
    warnings,
    errors,
  };
}

function buildFromRoster(
  csv: string,
  mapping: ColumnMapping,
  parseSource: ParseSource,
  confidence: number,
  warnings: string[],
): Omit<CsvIngestResult, "missingRequiredFields" | "canScreen" | "userMessage"> {
  if (!mapping.type) {
    warnings.push("type not mapped — defaulting entities to company");
  }
  const { entities, errors } = parseRosterWithMapping(csv, mapping);
  return {
    csvKind: "entity_roster",
    parseSource,
    confidence,
    columnMapping: mapping,
    records: [],
    rosterEntities: entities,
    normalizedContent: null,
    warnings,
    errors,
  };
}

export async function ingestCsv(
  content: string,
  filename?: string,
): Promise<CsvIngestResult> {
  const table = extractCsvTable(content);
  if (!table || table.rows.length === 0) {
    return emptyResult({
      errors: [
        {
          row: 1,
          message: "CSV must include a header row and at least one data row",
        },
      ],
      userMessage:
        "CSV must include a header row and at least one data row.",
    });
  }

  if (detectReferenceHeuristic(table, filename)) {
    const base = emptyResult({
      csvKind: "reference_metadata",
      parseSource: "heuristic",
      confidence: 0.9,
      explanation:
        "This file looks like a data-source catalog (URLs and dataset metadata), not a cap table or entity list. Upload a CSV with company/owner rows or a single-column list of entity names to screen.",
    });
    const v = validateIngestResult(base);
    return { ...base, ...v };
  }

  // Strict path
  const strict = parseCapTableDetailed(content);
  const strictOk = strict.errors.length === 0 && strict.records.length > 0;

  if (strictOk) {
    const base = buildFromCapTable(
      content,
      {
        entity: "entity",
        entity_type: "entity_type",
        owner: "owner",
        owner_type: "owner_type",
        ownership_pct: "ownership_pct",
      },
      "strict",
      1,
      [],
    );
    const v = validateIngestResult(base);
    return { ...base, ...v };
  }

  // Shareholder schedule (e.g. Shareholder_Name + Ownership_Percentage, no entity)
  const scheduleMapping = guessShareholderScheduleMapping(table);
  if (scheduleMapping) {
    const base = buildFromRoster(
      content,
      scheduleMapping,
      "heuristic",
      0.88,
      [
        "Shareholder schedule detected (no portfolio company column) — screening each shareholder",
      ],
    );
    const v = validateIngestResult(base);
    return { ...base, ...v };
  }

  // Heuristic path
  const heuristicMapping = guessHeuristicColumnMapping(table);
  if (heuristicMapping) {
    const hasCap =
      heuristicMapping.entity &&
      heuristicMapping.owner &&
      heuristicMapping.ownership_pct;
    const hasRoster = heuristicMapping.name && !hasCap;

    if (hasCap) {
      const base = buildFromCapTable(
        content,
        heuristicMapping,
        "heuristic",
        0.85,
        [],
      );
      const v = validateIngestResult(base);
      return { ...base, ...v };
    }
    if (hasRoster) {
      const base = buildFromRoster(
        content,
        heuristicMapping,
        "heuristic",
        0.85,
        [],
      );
      const v = validateIngestResult(base);
      return { ...base, ...v };
    }
  }

  // AI path
  const inferred = await inferCsvSchema({
    filename,
    headers: table.headers,
    sampleRows: table.rows,
  });

  if (inferred) {
    if (inferred.csvKind === "reference_metadata" || inferred.csvKind === "unknown") {
      const base = emptyResult({
        csvKind: inferred.csvKind,
        parseSource: "ai",
        confidence: inferred.confidence,
        columnMapping: inferred.columnMapping,
        warnings: inferred.warnings,
        explanation: inferred.explanation,
      });
      const v = validateIngestResult(base);
      return { ...base, ...v };
    }

    if (inferred.csvKind === "ownership_cap_table") {
      const rosterFromAi = rosterMappingFromCapTableColumns(
        inferred.columnMapping,
      );
      const rosterFromTable = guessShareholderScheduleMapping(table);
      const rosterMapping = rosterFromAi ?? rosterFromTable;

      if (rosterMapping) {
        const rosterBase = buildFromRoster(
          content,
          rosterMapping,
          "ai",
          inferred.confidence,
          [
            "Shareholder schedule (no portfolio company column) — screening each shareholder",
            ...inferred.warnings,
          ],
        );
        const rosterV = validateIngestResult(rosterBase);
        if (rosterV.canScreen) {
          return { ...rosterBase, ...rosterV };
        }
      }

      const base = buildFromCapTable(
        content,
        inferred.columnMapping,
        "ai",
        inferred.confidence,
        [...inferred.warnings],
      );
      const v = validateIngestResult(base);
      return { ...base, ...v };
    }

    if (inferred.csvKind === "entity_roster") {
      const base = buildFromRoster(
        content,
        inferred.columnMapping,
        "ai",
        inferred.confidence,
        [...inferred.warnings],
      );
      const v = validateIngestResult(base);
      return { ...base, ...v };
    }
  }

  // Fallback when AI unavailable or inconclusive
  const missing = capTableRequiredFields(heuristicMapping);
  const base = emptyResult({
    csvKind: "unknown",
    parseSource: heuristicMapping ? "heuristic" : "strict",
    confidence: 0,
    columnMapping: heuristicMapping,
    errors: strict.errors.slice(0, 10),
    warnings: [],
    explanation:
      process.env.ANTHROPIC_API_KEY?.trim()
        ? "We could not map this CSV to a cap table or entity list."
        : "Column headers do not match the expected format and AI mapping is unavailable (ANTHROPIC_API_KEY not set).",
  });
  if (missing.length > 0) {
    base.missingRequiredFields = missing;
  }
  const v = validateIngestResult(base);
  return { ...base, ...v };
}

export function toIngestApiResponse(result: CsvIngestResult) {
  return {
    csvKind: result.csvKind,
    parseSource: result.parseSource,
    confidence: result.confidence,
    columnMapping: result.columnMapping,
    recordCount:
      result.csvKind === "entity_roster"
        ? result.rosterEntities.length
        : result.records.length,
    normalizedContent: result.normalizedContent,
    warnings: result.warnings,
    errors: result.errors,
    missingRequiredFields: result.missingRequiredFields,
    canScreen: result.canScreen,
    userMessage: result.userMessage,
    explanation: result.explanation,
    parseStatus: deriveParseStatus(result),
  };
}
