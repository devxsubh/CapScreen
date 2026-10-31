import * as capTablesRepository from "../../modules/capTables/capTables.repository";
import * as startupsRepository from "../../modules/startups/startups.repository";
import type { ScreeningResult } from "../screening/runScreening";

export type ProjectCsvMeta = {
  id: string;
  filename: string;
  uploaded_at: string;
  csv_kind: string | null;
  parse_status: string;
  roster_purpose: string;
  record_count: number;
};

export type ProjectScreeningAsset = {
  id: string;
  label: string;
  purpose: "cap_table" | "co_investor" | "vendor";
  screened_at: string | null;
  csv_filename: string | null;
  total_entities: number;
  flagged_count: number;
  review_count: number;
};

function screeningAsset(
  projectId: string,
  purpose: ProjectScreeningAsset["purpose"],
  label: string,
  screenedAt: unknown,
  result: ScreeningResult | null | undefined,
  csvFilename: string | null,
): ProjectScreeningAsset | null {
  if (!result) return null;
  return {
    id: `screening:${purpose}:${projectId}`,
    label,
    purpose,
    screened_at: screenedAt
      ? new Date(screenedAt as string | Date).toISOString()
      : null,
    csv_filename: csvFilename,
    total_entities: result.totalEntities ?? 0,
    flagged_count: result.flaggedCount ?? 0,
    review_count: result.reviewCount ?? 0,
  };
}

export async function loadProjectAssets(
  projectId: string,
  userId: string,
): Promise<{ csvs: ProjectCsvMeta[]; screening_assets: ProjectScreeningAsset[] } | null> {
  const startup = await startupsRepository.findAccessible(projectId, userId);
  if (!startup) return null;

  const csvDocs = await capTablesRepository.listSummaries(projectId);

  const csvById = new Map(
    csvDocs.map((c) => [String((c as Record<string, unknown>)._id), c]),
  );

  const csvFilename = (csvId: unknown): string | null => {
    if (!csvId) return null;
    const doc = csvById.get(String(csvId));
    return doc ? (doc.filename as string) : null;
  };

  const csvs: ProjectCsvMeta[] = csvDocs.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row._id),
      filename: row.filename as string,
      uploaded_at: new Date(row.uploadedAt as Date).toISOString(),
      csv_kind: (row.csvKind as string | null) ?? null,
      parse_status: (row.parseStatus as string) ?? "pending",
      roster_purpose: (row.rosterPurpose as string) ?? "cap_table",
      record_count: (row.recordCount as number) ?? 0,
    };
  });

  const latestCsvByPurpose = startup.latestCsvByPurpose as
    | Record<string, unknown>
    | undefined;

  const screening_assets = [
    screeningAsset(
      projectId,
      "cap_table",
      "Cap Table Screening",
      startup.lastScreenedAt,
      startup.lastScreeningResult as ScreeningResult | null,
      csvFilename(startup.lastScreenedCsvId),
    ),
    screeningAsset(
      projectId,
      "co_investor",
      "Co-Investor Screening",
      startup.lastCoInvestorScreenedAt,
      startup.lastCoInvestorScreeningResult as ScreeningResult | null,
      csvFilename(latestCsvByPurpose?.co_investor),
    ),
    screeningAsset(
      projectId,
      "vendor",
      "Vendor Screening",
      startup.lastVendorScreenedAt,
      startup.lastVendorScreeningResult as ScreeningResult | null,
      csvFilename(latestCsvByPurpose?.vendor),
    ),
  ].filter((a): a is ProjectScreeningAsset => a !== null);

  return { csvs, screening_assets };
}

export function formatProjectAssetsForPrompt(
  projectName: string,
  assets: { csvs: ProjectCsvMeta[]; screening_assets: ProjectScreeningAsset[] },
  preselected?: { csvIds?: string[]; screeningIds?: string[] },
): string {
  const lines: string[] = [
    `Project "${projectName}" has the following available assets:`,
  ];

  if (assets.csvs.length > 0) {
    lines.push("\nCSV files:");
    for (const c of assets.csvs) {
      const pre = preselected?.csvIds?.includes(c.id) ? " [PRE-SELECTED]" : "";
      lines.push(
        `- ${c.filename} (csv_id: ${c.id}, uploaded: ${c.uploaded_at}, kind: ${c.csv_kind ?? "unknown"}, status: ${c.parse_status})${pre}`,
      );
    }
  }

  if (assets.screening_assets.length > 0) {
    lines.push("\nPrior screening results:");
    for (const s of assets.screening_assets) {
      const pre = preselected?.screeningIds?.includes(s.id)
        ? " [PRE-SELECTED]"
        : "";
      const date = s.screened_at
        ? new Date(s.screened_at).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })
        : "unknown date";
      lines.push(
        `- ${s.label} — ${date}${s.csv_filename ? ` (from ${s.csv_filename})` : ""}: ${s.flagged_count} flagged, ${s.review_count} review, ${s.total_entities} total (id: ${s.id})${pre}`,
      );
    }
  }

  if (assets.csvs.length === 0 && assets.screening_assets.length === 0) {
    lines.push("\n(No CSV files or screening results found in this project.)");
  }

  lines.push(
    "\nBefore asking the user to upload a new file, present these existing assets and ask which to use, upload a new file, or switch projects. " +
      "If assets are marked PRE-SELECTED, use them directly — do not re-ask for upload. " +
      "For CSVs, call screen_cap_table (saved CSV loads automatically in this workspace). " +
      "For prior screening results, use query_screening_data — do not re-run screening unless the user asks.",
  );

  return lines.join("\n");
}
