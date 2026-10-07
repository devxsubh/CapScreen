"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { DocPanel, type DocPanelMode } from "../shared/DocPanel";
import { ScreeningResultsContent } from "../screen/ScreeningResultsPanel";
import type { ScreeningResult } from "@/lib/screenerTypes";
import { useIsMobile } from "@/app/hooks/useIsMobile";
import type {
    AppCitationAnnotation,
    AppEditAnnotation,
} from "../shared/types";

// ---------------------------------------------------------------------------
// Tab data
// ---------------------------------------------------------------------------
//
// Each tab represents ONE of:
//   - screening results (graph + risk table),
//   - a document view (no specific annotation),
//   - a single citation quote,
//   - a single tracked change.
// There is no selector UI inside the panel — the user picks what to view
// by clicking a different tab (or opening a new one from a citation pill,
// an EditCard's View button, or the download card).

type CommonTab = {
    id: string;
    documentId: string;
    filename: string;
    versionId: string | null;
    versionNumber: number | null;
    /** Generated startup screening docs (IC memo, analysis) — not R2 uploads. */
    isStartupDocument?: boolean;
    startupId?: string | null;
    warning?: string | null;
    initialScrollTop?: number | null;
};

export type DocumentTab = CommonTab & { kind: "document" };

export type CitationTab = CommonTab & {
    kind: "citation";
    citation: AppCitationAnnotation;
};

export type EditTab = CommonTab & {
    kind: "edit";
    edit: AppEditAnnotation;
};

export type ScreeningTab = {
    kind: "screening";
    id: string;
    filename: string;
    data: ScreeningResult;
};

export type AssistantSidePanelTab =
    | DocumentTab
    | CitationTab
    | EditTab
    | ScreeningTab;

function tabTitle(tab: AssistantSidePanelTab): string {
    return tab.filename;
}

interface Props {
    tabs: AssistantSidePanelTab[];
    activeTabId: string | null;
    onActivateTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onCloseAll: () => void;
    /** Cap panel width so the chat column keeps a readable minimum. */
    maxWidth?: number;
    /**
     * Parent-driven reloading flag per document. Download buttons in
     * DocPanel show a spinner iff this returns true for the tab's
     * documentId. Used to signal "accept/reject in flight".
     */
    isEditorReloading?: (documentId: string) => boolean;
    /**
     * True while an accept/reject for this exact edit is in flight.
     * Disables the panel's Accept/Reject buttons for only the edit
     * currently being resolved — sibling edits stay clickable.
     */
    isEditReloading?: (editId: string) => boolean;
    onEditResolveStart?: (args: {
        editId: string;
        documentId: string;
        verb: "accept" | "reject";
    }) => void;
    onEditResolved?: (args: {
        editId: string;
        documentId: string;
        status: "accepted" | "rejected";
        versionId: string | null;
        downloadUrl: string | null;
    }) => void;
    onEditError?: (args: {
        editId: string;
        documentId: string;
        versionId: string | null;
        message: string;
    }) => void;
    onWarningDismiss?: (tabId: string) => void;
    onScrollChange?: (tabId: string, scrollTop: number) => void;
    /** Shown on the screening tab when assistant handoff is available. */
    screeningHandoffFilename?: string | null;
    onScreeningContinueInStartup?: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH_OFFSET = 56; // sidebar width
const MIN_CHAT_RESERVE = 380;

export function AssistantSidePanel({
    tabs,
    activeTabId,
    onActivateTab,
    onCloseTab,
    onCloseAll,
    maxWidth,
    isEditorReloading,
    isEditReloading,
    onEditResolveStart,
    onEditResolved,
    onEditError,
    onWarningDismiss,
    onScrollChange,
    screeningHandoffFilename,
    onScreeningContinueInStartup,
}: Props) {
    const isMobile = useIsMobile();
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState(() => {
        if (typeof window === "undefined") return 600;
        const available = window.innerWidth - MAX_WIDTH_OFFSET - MIN_CHAT_RESERVE;
        return Math.min(Math.max(MIN_WIDTH, Math.round(available * 0.55)), available);
    });

    const effectiveMaxWidth =
        maxWidth ??
        (typeof window !== "undefined"
            ? window.innerWidth - MAX_WIDTH_OFFSET - MIN_CHAT_RESERVE
            : 800);

    useEffect(() => {
        if (isMobile) return;
        setPanelWidth((w) => Math.min(w, effectiveMaxWidth));
    }, [effectiveMaxWidth, isMobile]);

    const dragStartX = useRef<number>(0);
    const dragStartWidth = useRef<number>(0);

    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (isMobile) return;
            e.preventDefault();
            dragStartX.current = e.clientX;
            dragStartWidth.current =
                panelRef.current?.offsetWidth ?? panelWidth;

            const onMouseMove = (ev: MouseEvent) => {
                const delta = dragStartX.current - ev.clientX;
                setPanelWidth(
                    Math.min(
                        effectiveMaxWidth,
                        Math.max(MIN_WIDTH, dragStartWidth.current + delta),
                    ),
                );
            };
            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [panelWidth, effectiveMaxWidth, isMobile],
    );

    const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
    if (!active) return null;

    const resolvedWidth = isMobile
        ? "100%"
        : Math.min(panelWidth, effectiveMaxWidth);

    return (
        <div
            ref={panelRef}
            className="flex h-full w-full shrink-0 flex-col bg-white relative border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]"
            style={{ width: resolvedWidth, maxWidth: isMobile ? "100%" : resolvedWidth }}
        >
            {/* Drag handle — desktop only */}
            {!isMobile && (
                <div
                    onMouseDown={onMouseDown}
                    className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/80 active:bg-blue-500 transition-colors z-10 group"
                    style={{ marginLeft: -3 }}
                    title="Drag to resize"
                >
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 group-hover:bg-blue-400" />
                </div>
            )}

            {/* Tab strip (Chrome-style) */}
            <div className="flex items-end gap-1 pr-2 pt-2 bg-gray-100">
                <div className="flex-1 flex items-end gap-1 overflow-x-auto pl-2 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {tabs.map((tab) => {
                        const isActive = tab.id === active.id;
                        const showVersionBadge =
                            tab.kind !== "screening" &&
                            typeof tab.versionNumber === "number" &&
                            Number.isFinite(tab.versionNumber) &&
                            tab.versionNumber > 1;
                        return (
                            <div
                                key={tab.id}
                                onClick={() => onActivateTab(tab.id)}
                                className={`group relative flex items-center gap-1.5 pl-3 pr-1.5 h-8 min-w-0 max-w-[220px] rounded-t-lg cursor-pointer select-none transition-colors ${
                                    isActive
                                        ? "bg-white text-gray-800 before:content-[''] before:absolute before:bottom-0 before:-left-2 before:w-2 before:h-2 before:bg-[radial-gradient(circle_at_top_left,transparent_8px,white_9px)] after:content-[''] after:absolute after:bottom-0 after:-right-2 after:w-2 after:h-2 after:bg-[radial-gradient(circle_at_top_right,transparent_8px,white_9px)]"
                                        : "bg-gray-200/70 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {tab.kind === "screening" && (
                                    <ShieldAlert
                                        className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-amber-600" : "text-gray-500"}`}
                                    />
                                )}
                                <span
                                    className={`min-w-0 flex-1 truncate text-xs ${isActive ? "font-medium" : "font-normal"}`}
                                    title={tabTitle(tab)}
                                >
                                    {tabTitle(tab)}
                                </span>
                                {showVersionBadge && (
                                    <span
                                        className={`shrink-0 inline-flex items-center rounded border px-1 py-px text-[9px] font-medium ${
                                            isActive
                                                ? "border-gray-200 bg-white text-gray-600"
                                                : "border-gray-300 bg-white/70 text-gray-500"
                                        }`}
                                    >
                                        V{tab.versionNumber}
                                    </span>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCloseTab(tab.id);
                                    }}
                                    className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-300 hover:text-gray-700"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={onCloseAll}
                    className="shrink-0 mb-1 ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    title="Close panel"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Tab bodies — all mounted, inactive ones hidden. Each tab
                preserves its state (scroll, docx-preview render, etc.)
                when inactive. */}
            <div className="flex-1 min-h-0 relative">
                {tabs.map((tab) => {
                    const isActive = tab.id === active.id;

                    if (tab.kind === "screening") {
                        return (
                            <div
                                key={tab.id}
                                className={`absolute inset-0 flex flex-col min-h-0 ${isActive ? "" : "invisible pointer-events-none"}`}
                                aria-hidden={!isActive}
                            >
                                <ScreeningResultsContent
                                    data={tab.data}
                                    embedded
                                    allowEntityDetails={false}
                                    handoffFilename={screeningHandoffFilename}
                                    onContinueInStartup={
                                        onScreeningContinueInStartup
                                    }
                                />
                            </div>
                        );
                    }

                    const mode: DocPanelMode =
                        tab.kind === "citation"
                            ? {
                                  kind: "citation",
                                  citation: tab.citation,
                              }
                            : tab.kind === "edit"
                              ? {
                                    kind: "edit",
                                    edit: tab.edit,
                                    isEditReloading:
                                        isEditReloading?.(tab.edit.edit_id) ??
                                        false,
                                    onResolveStart: onEditResolveStart,
                                    onResolved: onEditResolved,
                                    onError: onEditError,
                                }
                              : { kind: "document" };
                    return (
                        <div
                            key={tab.id}
                            className={`absolute inset-0 flex flex-col ${isActive ? "" : "invisible pointer-events-none"}`}
                            aria-hidden={!isActive}
                        >
                            <DocPanel
                                documentId={tab.documentId}
                                filename={tab.filename}
                                versionId={tab.versionId}
                                versionNumber={tab.versionNumber}
                                isStartupDocument={tab.isStartupDocument}
                                startupId={tab.startupId}
                                mode={mode}
                                isReloading={
                                    isEditorReloading?.(tab.documentId) ?? false
                                }
                                warning={tab.warning ?? null}
                                onWarningDismiss={() =>
                                    onWarningDismiss?.(tab.id)
                                }
                                initialScrollTop={tab.initialScrollTop ?? null}
                                onScrollChange={(scrollTop) =>
                                    onScrollChange?.(tab.id, scrollTop)
                                }
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
