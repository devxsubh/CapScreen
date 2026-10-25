import { completeText } from "../llm/complete";
import type { ColumnMapping, CsvKind } from "../../types/screening";
import {
  UNTRUSTED_DATA_PROMPT_GUARD,
  wrapCsvData,
} from "../shared/promptDelimiters";
import { isExternalLlmBlocked } from "../shared/dataResidency";
import { hasLlmRole } from "../llm/providers";

export interface InferredCsvSchema {
  csvKind: CsvKind;
  confidence: number;
  columnMapping: ColumnMapping;
  warnings: string[];
  explanation?: string;
}

const SYSTEM = `You classify uploaded CSV files for a VC sanctions cap-table screener.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "csvKind": "ownership_cap_table" | "entity_roster" | "reference_metadata" | "unknown",
  "confidence": 0.0-1.0,
  "columnMapping": {
    "entity": "exact header or omit",
    "entity_type": "exact header or omit",
    "owner": "exact header or omit",
    "owner_type": "exact header or omit",
    "ownership_pct": "exact header or omit",
    "name": "exact header or omit",
    "type": "exact header or omit"
  },
  "warnings": ["string"],
  "explanation": "plain English for user when not screenable"
}

Rules:
- ownership_cap_table: rows link an owner to an entity with ownership %. Requires entity AND owner columns. Map columnMapping to EXACT header strings from the input.
- entity_roster: one name per row to screen (sanctions lists, investor lists, shareholder schedules). Use name (+ optional type). If the file has Shareholder_Name + Ownership_Percentage but NO investee company column, use entity_roster.
- reference_metadata: OpenSanctions sources catalogs, URL lists, dataset metadata — NOT screenable.
- unknown: cannot determine structure.
- NEVER invent column names that are not in the header row.
- NEVER invent ownership percentages. If no % column exists, omit ownership_pct and add a warning.
- If the file has URLs, dataset ids, or source publisher metadata without owner/entity relationships, use reference_metadata.

${UNTRUSTED_DATA_PROMPT_GUARD}`;

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeMapping(
  raw: unknown,
  headers: string[],
): ColumnMapping {
  const out: ColumnMapping = {};
  if (!raw || typeof raw !== "object") return out;
  const m = raw as Record<string, unknown>;
  const headerSet = new Set(headers);

  for (const key of [
    "entity",
    "entity_type",
    "owner",
    "owner_type",
    "ownership_pct",
    "name",
    "type",
  ] as const) {
    const v = m[key];
    if (typeof v === "string" && v.trim() && headerSet.has(v.trim())) {
      out[key] = v.trim();
    }
  }
  return out;
}

export async function inferCsvSchema(params: {
  filename?: string;
  headers: string[];
  sampleRows: string[][];
}): Promise<InferredCsvSchema | null> {
  if (isExternalLlmBlocked() || !hasLlmRole("utility")) return null;

  const sample = params.sampleRows
    .slice(0, 8)
    .map((row) => row.map((c) => (c.length > 80 ? `${c.slice(0, 80)}…` : c)))
    .map((row) => row.join(" | "))
    .join("\n");

  const user = [
    params.filename ? `Filename: ${params.filename}` : "",
    `Headers: ${params.headers.join(" | ")}`,
    "Sample rows:",
    wrapCsvData(sample || "(no data rows)"),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await completeText({
      systemPrompt: SYSTEM,
      user,
      maxTokens: 1024,
    });

    const parsed = extractJson(text);
    if (!parsed) return null;

    const csvKind = parsed.csvKind as CsvKind;
    const validKinds: CsvKind[] = [
      "ownership_cap_table",
      "entity_roster",
      "reference_metadata",
      "unknown",
    ];
    if (!validKinds.includes(csvKind)) return null;

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;

    return {
      csvKind,
      confidence,
      columnMapping: sanitizeMapping(parsed.columnMapping, params.headers),
      warnings: Array.isArray(parsed.warnings)
        ? (parsed.warnings as unknown[]).filter((w) => typeof w === "string")
        : [],
      explanation:
        typeof parsed.explanation === "string"
          ? parsed.explanation
          : undefined,
    };
  } catch {
    return null;
  }
}
