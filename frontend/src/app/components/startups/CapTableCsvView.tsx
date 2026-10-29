"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Plus, RefreshCw, Undo2 } from "lucide-react";
import type { CsvRecord } from "@/lib/startupsApi";

function parseCsvRows(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  return {
    headers: parseLine(lines[0]),
    rows: lines.slice(1).map(parseLine),
  };
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function serializeCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map((row) =>
    headers.map((_, i) => escapeCell(row[i] ?? "")).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

function formatUploaded(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  csv: CsvRecord;
  saving?: boolean;
  onSaveAndRescreen?: (content: string) => void | Promise<void>;
}

export function CapTableCsvView({
  csv,
  saving = false,
  onSaveAndRescreen,
}: Props) {
  const [headers, setHeaders] = useState<string[]>(
    () => parseCsvRows(csv.content).headers,
  );
  const [rows, setRows] = useState<string[][]>(() =>
    parseCsvRows(csv.content).rows,
  );

  useEffect(() => {
    const parsed = parseCsvRows(csv.content);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
  }, [csv.id, csv.content]);

  const editedContent = useMemo(
    () => serializeCsv(headers, rows),
    [headers, rows],
  );
  const isDirty = editedContent !== csv.content.trim();

  const updateCell = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      setRows((prev) =>
        prev.map((row, ri) =>
          ri === rowIndex
            ? row.map((cell, ci) => (ci === colIndex ? value : cell))
            : row,
        ),
      );
    },
    [],
  );

  const updateHeader = useCallback((colIndex: number, value: string) => {
    setHeaders((prev) =>
      prev.map((h, i) => (i === colIndex ? value : h)),
    );
  }, []);

  const addColumn = useCallback(() => {
    const name = `field_${headers.length + 1}`;
    setHeaders((prev) => [...prev, name]);
    setRows((prev) => prev.map((row) => [...row, ""]));
  }, [headers.length]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, Array(headers.length).fill("")]);
  }, [headers.length]);

  const discardChanges = useCallback(() => {
    const parsed = parseCsvRows(csv.content);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
  }, [csv.content]);

  const handleRescreen = () => {
    if (!isDirty || saving) return;
    void onSaveAndRescreen?.(editedContent);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="shrink-0 flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {csv.filename}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Uploaded {formatUploaded(csv.uploadedAt)} · {rows.length}{" "}
              {rows.length === 1 ? "row" : "rows"} · click a cell to edit
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
            isDirty
              ? "bg-amber-100 text-amber-800"
              : csv.parseStatus === "valid"
                ? "bg-emerald-100 text-emerald-700"
                : csv.parseStatus === "needs_review"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-red-100 text-red-700"
          }`}
        >
          {isDirty ? "unsaved" : csv.parseStatus.replace("_", " ")}
        </span>
      </div>

      {csv.csvKind && !isDirty && (
        <div className="shrink-0 px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-600">
          Format: {csv.csvKind.replace(/_/g, " ")}
          {csv.parseSource && csv.parseSource !== "strict" && (
            <span className="text-gray-400">
              {" "}
              · mapped via {csv.parseSource}
            </span>
          )}
        </div>
      )}

      {csv.ingestWarnings && csv.ingestWarnings.length > 0 && !isDirty && (
        <div className="shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
          {csv.ingestWarnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {csv.parseErrors.length > 0 && !isDirty && (
        <div className="shrink-0 px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          {csv.parseErrors.slice(0, 3).map((e, i) => (
            <p key={i}>
              Row {e.row}: {e.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800 text-white">
              <th className="w-11 px-3 py-2.5 text-left text-xs font-semibold border-r border-gray-700">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="p-0 text-left text-xs font-semibold border-r border-gray-700 whitespace-nowrap min-w-[130px]"
                >
                  <input
                    type="text"
                    value={h}
                    onChange={(e) => updateHeader(i, e.target.value)}
                    placeholder="Column name"
                    className="w-full px-3 py-2.5 text-xs font-semibold text-white bg-transparent border-0 outline-none placeholder:text-gray-400 focus:bg-gray-700/50"
                  />
                </th>
              ))}
              <th className="w-10 p-0 border-l border-gray-700">
                <button
                  type="button"
                  onClick={addColumn}
                  title="Add column"
                  className="flex h-full w-full items-center justify-center py-2.5 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`group border-b border-gray-200 ${
                  ri % 2 === 0 ? "bg-white" : "bg-gray-50/70"
                } hover:bg-gray-50`}
              >
                <td className="px-3 py-0 text-xs font-medium text-gray-400 bg-gray-50/80 border-r border-gray-200 align-middle text-center">
                  {ri + 1}
                </td>
                {headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="p-0 border-r border-gray-100 align-middle"
                  >
                    <input
                      type="text"
                      value={row[ci] ?? ""}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="w-full min-w-[130px] px-3 py-2 text-sm text-gray-900 bg-transparent border-0 outline-none group-hover:bg-gray-50/60 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-gray-400/60"
                    />
                  </td>
                ))}
                <td className="w-10 border-l border-gray-100 bg-gray-50/50" />
              </tr>
            ))}
            <tr className="border-b border-gray-200 bg-gray-50/80 hover:bg-gray-100/80">
              <td className="w-11 p-0 border-r border-gray-200">
                <button
                  type="button"
                  onClick={addRow}
                  title="Add row"
                  className="flex h-full w-full items-center justify-center py-2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </td>
              {headers.map((_, ci) => (
                <td
                  key={ci}
                  className="border-r border-gray-100 bg-gray-50/50"
                />
              ))}
              <td className="w-10 border-l border-gray-100 bg-gray-50/50" />
            </tr>
          </tbody>
        </table>
      </div>

      {isDirty && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-800">
            You have unsaved changes to this cap table.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              type="button"
              onClick={handleRescreen}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {saving ? "Running…" : "Save & run analysis again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
