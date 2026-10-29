"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { CsvIngestAnalysis } from "@/lib/screenerTypes";

const KIND_LABELS: Record<string, string> = {
  ownership_cap_table: "Cap table",
  entity_roster: "Entity list",
  reference_metadata: "Reference metadata",
  unknown: "Unknown format",
};

const FIELD_LABELS: Record<string, string> = {
  entity: "Entity / company",
  owner: "Owner / shareholder",
  ownership_pct: "Ownership %",
  name: "Entity name",
};

const CANONICAL_LABELS: Record<string, string> = {
  entity: "entity",
  entity_type: "entity_type",
  owner: "owner",
  owner_type: "owner_type",
  ownership_pct: "ownership_pct",
  name: "name",
  type: "type",
};

interface Props {
  analysis: CsvIngestAnalysis | null;
  analyzing?: boolean;
  confirmChecked?: boolean;
  onConfirmChange?: (checked: boolean) => void;
}

export function CsvIngestReview({
  analysis,
  analyzing = false,
  confirmChecked = false,
  onConfirmChange,
}: Props) {
  if (analyzing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Analyzing CSV structure…
      </div>
    );
  }

  if (!analysis) return null;

  const blocked = !analysis.canScreen;
  const needsReview =
    analysis.canScreen && analysis.parseStatus === "needs_review";

  if (blocked) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-red-800">
              Can&apos;t screen this file yet
            </p>
            <p className="text-xs text-red-700">
              Detected: {KIND_LABELS[analysis.csvKind] ?? analysis.csvKind}
            </p>
            {analysis.userMessage && (
              <p className="text-xs text-red-700 leading-relaxed">
                {analysis.userMessage}
              </p>
            )}
            {analysis.explanation && !analysis.userMessage && (
              <p className="text-xs text-red-700 leading-relaxed">
                {analysis.explanation}
              </p>
            )}
          </div>
        </div>
        {analysis.missingRequiredFields.length > 0 && (
          <ul className="text-xs text-red-700 list-disc pl-5 space-y-0.5">
            {analysis.missingRequiredFields.map((f) => (
              <li key={f}>
                Missing: {FIELD_LABELS[f] ?? f}
              </li>
            ))}
          </ul>
        )}
        {analysis.errors.length > 0 && (
          <div className="text-xs text-red-600 space-y-0.5 pt-1 border-t border-red-100">
            {analysis.errors.slice(0, 3).map((e, i) => (
              <p key={i}>
                Row {e.row}: {e.message}
              </p>
            ))}
            {analysis.errors.length > 3 && (
              <p>…and {analysis.errors.length - 3} more row issues</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-gray-800">
            {KIND_LABELS[analysis.csvKind] ?? "CSV"} detected
            {analysis.recordCount > 0 && (
              <span className="font-normal text-gray-500">
                {" "}
                · {analysis.recordCount} row
                {analysis.recordCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
          {analysis.parseSource !== "strict" && (
            <p className="text-[11px] text-gray-500">
              Mapped via {analysis.parseSource}
              {analysis.confidence > 0 &&
                ` · ${Math.round(analysis.confidence * 100)}% confidence`}
            </p>
          )}
        </div>
      </div>

      {analysis.columnMapping &&
        Object.keys(analysis.columnMapping).length > 0 && (
          <table className="w-full text-[11px] text-left">
            <thead>
              <tr className="text-gray-400">
                <th className="pb-1 font-medium">Your column</th>
                <th className="pb-1 font-medium">Maps to</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {Object.entries(analysis.columnMapping).map(([canonical, src]) => (
                <tr key={canonical}>
                  <td className="py-0.5 pr-2 truncate">{src}</td>
                  <td className="py-0.5 text-gray-500 font-mono">
                    {CANONICAL_LABELS[canonical] ?? canonical}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {analysis.graphPreview && analysis.canScreen && (
        <div className="rounded-md border border-gray-100 bg-white px-2.5 py-2 text-[11px] text-gray-600 space-y-1">
          <p className="font-medium text-gray-700">Screening preview</p>
          <p>
            {analysis.graphPreview.entityCount} entit
            {analysis.graphPreview.entityCount === 1 ? "y" : "ies"}
            {analysis.graphPreview.startupName
              ? ` · portfolio co. ${analysis.graphPreview.startupName}`
              : ""}
            {analysis.graphPreview.ownershipDepth > 0
              ? ` · ownership depth ${analysis.graphPreview.ownershipDepth}`
              : ""}
          </p>
          {analysis.graphPreview.hasCircularOwnership && (
            <p className="text-amber-700">
              Circular ownership detected (
              {analysis.graphPreview.circularOwnershipCount} cycle
              {analysis.graphPreview.circularOwnershipCount === 1 ? "" : "s"})
            </p>
          )}
          {analysis.estimatedScreenSeconds != null &&
            analysis.estimatedScreenSeconds > 0 && (
              <p className="text-gray-500">
                Est. screening time ~{analysis.estimatedScreenSeconds}s
              </p>
            )}
        </div>
      )}

      {analysis.warnings.length > 0 && (
        <ul className="text-[11px] text-amber-700 list-disc pl-4 space-y-0.5">
          {analysis.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {needsReview && onConfirmChange && (
        <label className="flex items-start gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => onConfirmChange(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            Column mapping looks correct — proceed with screening
          </span>
        </label>
      )}
    </div>
  );
}
