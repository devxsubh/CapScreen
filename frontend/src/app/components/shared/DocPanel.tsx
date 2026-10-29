"use client";

import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { DocView } from "./DocView";
import { DocxView } from "./DocxView";
import { StartupDocumentView } from "./StartupDocumentView";
import {
    displayCitationQuote,
    expandCitationToEntries,
    formatCitationPage,
} from "./types";
import type {
    CitationQuote,
    AppCitationAnnotation,
} from "./types";
import { apiBase } from "@/lib/apiBase";

function isDocxFilename(name: string): boolean {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext === "docx" || ext === "doc";
}

/**
 * Discriminated-union describing what the panel is showing above the viewer.
 *   - "document":  no header card, no label — just the viewer.
 *   - "citation":  "Citation Quote" card with the quoted text and page ref.
 */
export type DocPanelMode =
    | { kind: "document" }
    | { kind: "citation"; citation: AppCitationAnnotation };

interface Props {
    documentId: string;
    filename: string;
    versionId: string | null;
    versionNumber: number | null;
    isStartupDocument?: boolean;
    startupId?: string | null;
    mode: DocPanelMode;
    /** Spinner on the Download button while an accept/reject is in flight. */
    isReloading?: boolean;
    warning?: string | null;
    onWarningDismiss?: () => void;
    initialScrollTop?: number | null;
    onScrollChange?: (scrollTop: number) => void;
}

/**
 * Unified side-panel body for the assistant. Renders a single document
 * with optionally a citation quote OR a tracked change highlighted above
 * the viewer. No selector UI — caller picks the one thing to show; if the
 * user wants a different citation/edit, the panel gets a new tab.
 */
export function DocPanel({
    documentId,
    filename,
    versionId,
    versionNumber,
    isStartupDocument = false,
    startupId = null,
    mode,
    isReloading = false,
    warning,
    onWarningDismiss,
    initialScrollTop,
    onScrollChange,
}: Props) {
    // Pick the viewer from the filename only, not from mode. Switching
    // headers (citation ↔ document) for the same document must not unmount
    // and remount the body — otherwise the user sees a full re-fetch.
    const useDocxView = isDocxFilename(filename);

    const quotes: CitationQuote[] | undefined = useMemo(() => {
        if (mode.kind !== "citation") return undefined;
        return expandCitationToEntries(mode.citation);
    }, [mode]);

    return (
        <div className="flex h-full flex-col px-3 pb-3">
            {mode.kind === "citation" ? (
                <CitationHeader
                    citation={mode.citation}
                    documentId={documentId}
                    versionId={versionId}
                    filename={filename}
                    isReloading={isReloading}
                />
            ) : (
                <div className="flex items-center justify-end gap-2 py-2">
                    <div className="mr-auto flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-gray-700">
                            {filename}
                        </span>
                        {versionNumber && versionNumber > 0 && (
                            <span className="shrink-0 inline-flex items-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                V{versionNumber}
                            </span>
                        )}
                    </div>
                    <DownloadButton
                        documentId={documentId}
                        versionId={versionId}
                        filename={filename}
                        isReloading={isReloading}
                        isStartupDocument={isStartupDocument}
                    />
                </div>
            )}

            {isStartupDocument ? (
                <StartupDocumentView
                    documentId={documentId}
                    startupId={startupId}
                    initialScrollTop={initialScrollTop ?? null}
                    onScrollChange={onScrollChange}
                />
            ) : useDocxView ? (
                <DocxView
                    documentId={documentId}
                    versionId={versionId ?? undefined}
                    quotes={quotes}
                    warning={warning ?? null}
                    onWarningDismiss={onWarningDismiss}
                    initialScrollTop={initialScrollTop ?? null}
                    onScrollChange={onScrollChange}
                />
            ) : (
                <DocView
                    doc={{
                        document_id: documentId,
                        version_id: versionId,
                    }}
                    quotes={quotes}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Header variants
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-medium text-gray-700">{children}</p>;
}

function CitationHeader({
    citation,
    documentId,
    versionId,
    filename,
    isReloading,
}: {
    citation: AppCitationAnnotation;
    documentId: string;
    versionId: string | null;
    filename: string;
    isReloading: boolean;
}) {
    const displayQuote = displayCitationQuote(citation);
    const pagesLabel = formatCitationPage(citation);
    return (
        <div className="pt-2 pb-3">
            <div className="flex items-center gap-2 mb-2">
                <SectionLabel>Citation</SectionLabel>
                <div className="ml-auto shrink-0">
                    <DownloadButton
                        documentId={documentId}
                        versionId={versionId}
                        filename={filename}
                        isReloading={isReloading}
                    />
                </div>
            </div>
            <div className="w-full rounded-md bg-gray-50 border border-gray-200 px-2 py-2">
                <p className="text-sm font-serif text-gray-600">
                    &ldquo;{displayQuote}&rdquo;
                    {pagesLabel && (
                        <span className="ml-1 text-gray-400">
                            ({pagesLabel})
                        </span>
                    )}
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Download button
// ---------------------------------------------------------------------------

function DownloadButton({
    documentId,
    versionId,
    filename,
    isReloading,
    isStartupDocument = false,
}: {
    documentId: string;
    versionId: string | null;
    filename: string;
    isReloading?: boolean;
    isStartupDocument?: boolean;
}) {
    const [busy, setBusy] = useState(false);

    const handleClick = async () => {
        if (busy || isReloading) return;
        setBusy(true);
        try {
            const base = apiBase();
            const path = isStartupDocument
                ? `/api/documents/${documentId}/download`
                : `/single-documents/${documentId}/docx${
                      versionId
                          ? `?version_id=${encodeURIComponent(versionId)}`
                          : ""
                  }`;
            const resp = await fetch(`${base}${path}`, {
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } finally {
            setBusy(false);
        }
    };

    const spinning = busy || isReloading;
    return (
        <button
            onClick={handleClick}
            disabled={spinning}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {spinning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <Download className="h-3.5 w-3.5" />
            )}
            Download
        </button>
    );
}
