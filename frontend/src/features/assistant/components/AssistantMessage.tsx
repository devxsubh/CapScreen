"use client";

import { useRef, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { CapScreenIcon } from "@/components/chat/CapScreenIcon";
import type { AssistantEvent, AppCitationAnnotation } from "@/types/app";
import { AgentPlan } from "./AgentPlan";
import { ApprovalCard } from "./ApprovalCard";
import { PreResponseWrapper } from "@/components/chat/PreResponseWrapper";
import type { ScreeningResult } from "@/types/screening";
import { parseMessageOptions } from "@/lib/parseMessageOptions";
import { MessageOptionChips } from "@/components/chat/MessageOptionChips";
import { toolCallLabel, toolCallDoneLabel } from "../lib/toolCallLabels";
import { preprocessCitations, MarkdownContent } from "./AssistantMarkdown";
import { DocCreatedBlock, isStartupDocumentDownloadUrl, DocDownloadBlock } from "./DocumentBlocks";
import { ScreeningResultsBlock, WorkflowAppliedBlock } from "./ToolResultBlocks";

// ---------------------------------------------------------------------------
// ResponseStatus
// ---------------------------------------------------------------------------

type StatusState = "active" | "error" | null;

function ResponseStatus({ status }: { status: StatusState }) {
    const [showDone, setShowDone] = useState(false);
    const [doneVisible, setDoneVisible] = useState(false);
    const wasActiveRef = useRef(false);

    const isActive = status === "active";
    const isError = status === "error";

    useEffect(() => {
        if (wasActiveRef.current && !isActive) {
            setShowDone(true);
            setDoneVisible(true);
            const t = setTimeout(() => setDoneVisible(false), 1500);
            return () => clearTimeout(t);
        } else if (!wasActiveRef.current && isActive) {
            setShowDone(false);
            setDoneVisible(false);
        }
        wasActiveRef.current = isActive;
    }, [isActive]);

    return (
        <div className="w-full h-9 flex items-center mb-2">
            <CapScreenIcon
                spin={isActive}
                done={showDone && doneVisible}
                error={isError}
                brand={!isError && !(showDone && doneVisible)}
                size={22}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
    content: string;
    events?: AssistantEvent[];
    isStreaming?: boolean;
    isError?: boolean;
    /** Human-readable error text rendered alongside the red assistant icon. */
    errorMessage?: string;
    annotations?: AppCitationAnnotation[];
    onCitationClick?: (citation: AppCitationAnnotation) => void;
    minHeight?: string;
    onWorkflowClick?: (workflowId: string) => void;
    /** Answers an approval card (Allow / Deny) for a paused assistant run. */
    onApprovalAnswer?: (runId: string, approved: boolean) => void;
    /**
     * Opens the editor panel for a document without auto-highlighting any
     * specific edit. Used by the download card click — opening a doc to
     * read/download shouldn't jump the viewer to the first edit.
     */
    onOpenDocument?: (args: {
        documentId: string;
        filename: string;
        versionId: string | null;
        versionNumber: number | null;
        isStartupDocument?: boolean;
        startupId?: string | null;
    }) => void;
    /** Opens the screening results tab in the side panel (graph + risk table). */
    onOpenScreening?: (result?: ScreeningResult | null) => void;
    /** When true, numbered lists in the last content block render as clickable MCQ options. */
    showOptionChips?: boolean;
    onOptionSelect?: (value: string) => void;
}

export function AssistantMessage({
    content,
    events,
    isStreaming = false,
    isError = false,
    errorMessage,
    annotations = [],
    onCitationClick,
    minHeight = "0px",
    onWorkflowClick,
    onApprovalAnswer,
    onOpenDocument,
    onOpenScreening,
    showOptionChips = false,
    onOptionSelect,
}: Props) {
    const contentDivRef = useRef<HTMLDivElement | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const status: StatusState = isError
        ? "error"
        : isStreaming
          ? "active"
          : null;

    // Pre-process citations for all content events. Each [N] marker resolves
    // to exactly one annotation (models are instructed to use shared refs
    // only for cross-page continuations via the [[PAGE_BREAK]] sentinel).
    const citationsList: AppCitationAnnotation[] = [];
    const processedTexts: string[] = [];
    let messageOptions = null as ReturnType<typeof parseMessageOptions> | null;

    const lastContentIdxForOptions = events
        ? events.reduce(
              (last, e, idx) => (e.type === "content" ? idx : last),
              -1,
          )
        : -1;

    if (events) {
        for (let idx = 0; idx < events.length; idx++) {
            const event = events[idx];
            if (event.type !== "content") {
                processedTexts.push("");
                continue;
            }

            let text = event.text;
            if (
                idx === lastContentIdxForOptions &&
                showOptionChips &&
                !isStreaming &&
                !isError
            ) {
                messageOptions = parseMessageOptions(text);
                if (messageOptions) text = messageOptions.displayText;
            }

            processedTexts.push(
                preprocessCitations(text, annotations, citationsList),
            );
        }
    }
    const handleCopy = async () => {
        try {
            let html = "";
            let plainText = "";
            if (contentDivRef.current) {
                const clone = contentDivRef.current.cloneNode(
                    true,
                ) as HTMLElement;
                html = clone.innerHTML;
                plainText = clone.textContent || "";
            }
            const item = new ClipboardItem({
                "text/html": new Blob([html], { type: "text/html" }),
                "text/plain": new Blob([plainText], { type: "text/plain" }),
            });
            await navigator.clipboard.write([item]);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch {
            // ignore
        }
    };

    const lastContentIdx = events
        ? events.reduce(
              (last, e, idx) => (e.type === "content" ? idx : last),
              -1,
          )
        : -1;

    const fallbackContent =
        lastContentIdx < 0 && content?.trim() ? content.trim() : "";
    const fallbackProcessed = fallbackContent
        ? preprocessCitations(fallbackContent, annotations, citationsList)
        : "";

    // Walk events in chronological order and group consecutive non-content
    // events into their own PreResponseWrapper. Content events render
    // between wrappers, so reasoning/tool chatter that arrives after the
    // model has already streamed some prose gets its own wrapper.
    // Plans and approval cards are standalone groups so they never get
    // folded away inside a collapsed wrapper.
    type EventGroup =
        | { kind: "pre"; events: AssistantEvent[]; indices: number[] }
        | { kind: "standalone"; event: AssistantEvent; index: number }
        | {
              kind: "content";
              event: Extract<AssistantEvent, { type: "content" }>;
              index: number;
          };

    const groups: EventGroup[] = [];
    if (events) {
        let current: Extract<EventGroup, { kind: "pre" }> | null = null;
        events.forEach((e, i) => {
            if (e.type === "content") {
                if (current) {
                    groups.push(current);
                    current = null;
                }
                groups.push({ kind: "content", event: e, index: i });
            } else if (e.type === "plan" || e.type === "approval_request") {
                if (current) {
                    groups.push(current);
                    current = null;
                }
                groups.push({ kind: "standalone", event: e, index: i });
            } else {
                if (!current)
                    current = { kind: "pre", events: [], indices: [] };
                current.events.push(e);
                current.indices.push(i);
            }
        });
        if (current) groups.push(current);
    }

    const hasContentAfter = (groupIdx: number): boolean => {
        for (let i = groupIdx + 1; i < groups.length; i++) {
            const g = groups[i];
            if (g.kind === "content" && g.event.text.length > 0) return true;
        }
        return false;
    };

    const renderEvent = (
        event: AssistantEvent,
        i: number,
        allEvents: AssistantEvent[],
        globalIdx: number,
    ) => {
        const nextEvent = allEvents[i + 1];
        const showConnector =
            nextEvent !== undefined && nextEvent.type !== "content";

        if (event.type === "content") {
            const isLastContent = globalIdx === lastContentIdx;
            const processed = processedTexts[globalIdx];
            return (
                <div key={globalIdx}>
                    <MarkdownContent
                        text={processed}
                        citationsList={citationsList}
                        onCitationClick={onCitationClick}
                        divRef={isLastContent ? contentDivRef : undefined}
                    />
                </div>
            );
        }
        if (event.type === "tool_call_start") {
            const toolStreaming = !!event.isStreaming && isStreaming;
            return (
                <div
                    key={globalIdx}
                    className="flex items-center text-sm font-serif text-gray-500 relative"
                >
                    {showConnector && (
                        <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
                    )}
                    {toolStreaming ? (
                        <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    <span className="font-medium ml-2">
                        {toolStreaming
                            ? toolCallLabel(event.name)
                            : toolCallDoneLabel(event.name)}
                    </span>
                </div>
            );
        }
        if (event.type === "thinking") {
            return (
                <div
                    key={globalIdx}
                    className="flex items-center text-sm font-serif text-gray-500 relative"
                >
                    {showConnector && (
                        <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
                    )}
                    <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
                    <span className="ml-2">Thinking...</span>
                </div>
            );
        }
        if (event.type === "screening_complete") {
            if (!event.isStreaming) return null;
            return (
                <div
                    key={globalIdx}
                    className="flex items-center text-sm font-serif text-gray-500 relative"
                >
                    {showConnector && (
                        <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
                    )}
                    <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
                    <span className="font-medium ml-2">
                        Screening cap table…
                    </span>
                </div>
            );
        }
        if (event.type === "doc_created") {
            return (
                <DocCreatedBlock
                    key={globalIdx}
                    filename={event.filename}
                    isStreaming={event.isStreaming}
                    showConnector={showConnector}
                />
            );
        }
        if (event.type === "plan") {
            return <AgentPlan key={globalIdx} steps={event.steps} />;
        }
        if (event.type === "approval_request") {
            return (
                <ApprovalCard
                    key={globalIdx}
                    request={event}
                    onAnswer={onApprovalAnswer}
                />
            );
        }
        if (event.type === "workflow_applied") {
            return (
                <WorkflowAppliedBlock
                    key={globalIdx}
                    title={event.title}
                    showConnector={showConnector}
                    onClick={
                        onWorkflowClick
                            ? () => onWorkflowClick(event.workflow_id)
                            : undefined
                    }
                />
            );
        }
        return null;
    };

    return (
        <div style={{ minHeight }}>
            <ResponseStatus status={status} />
            <div className="w-full font-inter relative mt-2">
                {events && events.length > 0 ? (
                    <div className="flex flex-col gap-4">
                        {groups.map((g, gIdx) => {
                            if (g.kind === "content") {
                                const isLastContent =
                                    g.index === lastContentIdx;
                                return (
                                    <div key={`c-${g.index}`}>
                                        <MarkdownContent
                                            text={processedTexts[g.index]}
                                            citationsList={citationsList}
                                            onCitationClick={onCitationClick}
                                            divRef={
                                                isLastContent
                                                    ? contentDivRef
                                                    : undefined
                                            }
                                        />
                                        {isLastContent &&
                                            messageOptions &&
                                            onOptionSelect && (
                                                <MessageOptionChips
                                                    options={
                                                        messageOptions.options
                                                    }
                                                    onSelect={onOptionSelect}
                                                    disabled={isStreaming}
                                                />
                                            )}
                                    </div>
                                );
                            }
                            if (g.kind === "standalone") {
                                return renderEvent(g.event, 0, [g.event], g.index);
                            }
                            const subsequentContent = hasContentAfter(gIdx);
                            const wrapperIsStreaming = g.events.some(
                                (event) =>
                                    "isStreaming" in event &&
                                    !!event.isStreaming,
                            );
                            return (
                                <PreResponseWrapper
                                    key={`p-${g.indices[0]}`}
                                    stepCount={g.events.length}
                                    shouldMinimize={subsequentContent}
                                    isStreaming={wrapperIsStreaming}
                                >
                                    {g.events.map((event, i) =>
                                        renderEvent(
                                            event,
                                            i,
                                            g.events,
                                            g.indices[i],
                                        ),
                                    )}
                                </PreResponseWrapper>
                            );
                        })}
                    </div>
                ) : fallbackProcessed ? (
                    <MarkdownContent
                        text={fallbackProcessed}
                        citationsList={citationsList}
                        onCitationClick={onCitationClick}
                        divRef={contentDivRef}
                    />
                ) : null}

                {isError && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-serif text-red-700">
                        <span className="leading-snug">
                            {errorMessage ?? "Sorry, something went wrong."}
                        </span>
                    </div>
                )}

                {/* Screening results card — opens graph + risk table in side panel */}
                {events &&
                    !isStreaming &&
                    events.some(
                        (e) =>
                            e.type === "screening_complete" && !e.isStreaming,
                    ) && (
                        <div className="flex flex-col gap-2 mt-2 mb-3">
                            {(
                                events.filter(
                                    (e) =>
                                        e.type === "screening_complete" &&
                                        !e.isStreaming,
                                ) as Extract<
                                    AssistantEvent,
                                    { type: "screening_complete" }
                                >[]
                            ).map((e, i) => (
                                <ScreeningResultsBlock
                                    key={i}
                                    startupName={e.startupName}
                                    totalEntities={e.totalEntities}
                                    flaggedCount={e.flaggedCount}
                                    reviewCount={e.reviewCount}
                                    screeningConfidence={
                                        e.screeningConfidence
                                    }
                                    onOpen={
                                        onOpenScreening
                                            ? () =>
                                                  onOpenScreening(
                                                      e.result ?? null,
                                                  )
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    )}

                {/* Download cards for created docs — generated docs now
                    persist as first-class documents, so clicking opens
                    them in the DocPanel (like edited docs). */}
                {events &&
                    !isStreaming &&
                    events.some(
                        (e) => e.type === "doc_created" && !e.isStreaming,
                    ) && (
                        <div className="flex flex-col gap-2 mt-2 mb-3">
                            {(
                                events.filter(
                                    (e) =>
                                        e.type === "doc_created" &&
                                        !e.isStreaming,
                                ) as Extract<
                                    AssistantEvent,
                                    { type: "doc_created" }
                                >[]
                            ).map((e, i) => {
                                const documentId = e.document_id;
                                const versionId = e.version_id ?? null;
                                const versionNumber = e.version_number ?? null;
                                // Startup docs download via relative API URL.
                                const canOpen =
                                    !!onOpenDocument &&
                                    !!documentId &&
                                    !!e.download_url;
                                const isStartupDocument =
                                    isStartupDocumentDownloadUrl(e.download_url);
                                return (
                                    <DocDownloadBlock
                                        key={i}
                                        filename={e.filename}
                                        download_url={e.download_url}
                                        versionNumber={versionNumber}
                                        onOpen={
                                            canOpen
                                                ? () =>
                                                      onOpenDocument!({
                                                          documentId:
                                                              documentId!,
                                                          filename: e.filename,
                                                          versionId,
                                                          versionNumber,
                                                          isStartupDocument,
                                                          startupId:
                                                              e.startup_id ??
                                                              null,
                                                      })
                                                : undefined
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}

                {/* Copy button */}
                <div className="flex items-center gap-2 pt-2 font-sans justify-start">
                    {!isStreaming && (
                        <button
                            className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                            onClick={handleCopy}
                        >
                            {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                        </button>
                    )}
                </div>

                <div className="pb-4 md:pb-8" />
            </div>
        </div>
    );
}
