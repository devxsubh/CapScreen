"use client";

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Copy, Check, Download, Loader2, ShieldAlert } from "lucide-react";
import { CapScreenIcon } from "@/components/chat/capscreen-icon";
import { displayCitationQuote, formatCitationPage } from "../shared/types";
import type {
    AssistantEvent,
    AppCitationAnnotation,
} from "../shared/types";
import { AgentPlan } from "./AgentPlan";
import { ApprovalCard } from "./ApprovalCard";
import { PreResponseWrapper } from "../shared/PreResponseWrapper";
import type { ScreeningResult } from "@/lib/screenerTypes";
import { parseMessageOptions } from "@/lib/parseMessageOptions";
import { MessageOptionChips } from "@/app/components/shared/MessageOptionChips";
import { apiBase } from "@/lib/apiBase";

function toolCallLabel(name: string): string {
    if (name === "generate_docx") return "Creating document...";
    if (name === "edit_document") return "Editing document...";
    if (name === "read_document") return "Reading document...";
    if (name === "fetch_documents") return "Reading documents...";
    if (name === "find_in_document") return "Searching document...";
    if (name === "replicate_document") return "Copying document...";
    if (name === "read_workflow") return "Loading workflow...";
    if (name === "list_workflows") return "Loading workflows...";
    if (name === "web_search") return "Searching the web…";
    if (name === "list_documents") return "Loading documents...";
    if (name === "screen_cap_table") return "Screening cap table…";
    if (name === "query_screening_data") return "Querying screening data…";
    if (name === "ic_memo") return "Generating IC memo…";
    if (name === "update_plan") return "Planning…";
    if (name === "delegate_task") return "Sub-agent researching…";
    return name ? `Running ${name}...` : "Working...";
}

function toolCallDoneLabel(name: string): string {
    if (name === "generate_docx") return "Created document";
    if (name === "edit_document") return "Edited document";
    if (name === "read_document") return "Read document";
    if (name === "fetch_documents") return "Read documents";
    if (name === "find_in_document") return "Searched document";
    if (name === "replicate_document") return "Copied document";
    if (name === "read_workflow") return "Loaded workflow";
    if (name === "list_workflows") return "Loaded workflows";
    if (name === "web_search") return "Searched the web";
    if (name === "list_documents") return "Loaded documents";
    if (name === "screen_cap_table") return "Screened cap table";
    if (name === "query_screening_data") return "Queried screening data";
    if (name === "ic_memo") return "Generated IC memo";
    if (name === "update_plan") return "Updated plan";
    if (name === "delegate_task") return "Sub-agent finished";
    return name ? `Ran ${name}` : "Completed";
}

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
// Event block components
// ---------------------------------------------------------------------------

function DocCreatedBlock({
    filename,
    showConnector,
    isStreaming,
}: {
    filename: string;
    showConnector?: boolean;
    isStreaming?: boolean;
}) {
    return (
        <div className="flex items-start text-sm font-serif text-gray-500 relative">
            {showConnector && (
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
            )}
            {isStreaming ? (
                <div className="mt-2 w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
            ) : (
                <div className="mt-2 w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            )}
            <div className="ml-2 min-w-0 flex-1 whitespace-normal break-words">
                <span className="font-medium">
                    {isStreaming ? "Creating" : "Created"}
                </span>{" "}
                <span>{isStreaming ? `${filename}...` : filename}</span>
            </div>
        </div>
    );
}

function isStartupDocumentDownloadUrl(url: string): boolean {
    return /^\/api\/documents\/[^/]+\/download$/.test(url);
}

function DocDownloadBlock({
    filename,
    download_url,
    onOpen,
    isReloading = false,
    versionNumber,
}: {
    filename: string;
    download_url: string;
    onOpen?: () => void;
    isReloading?: boolean;
    versionNumber?: number | null;
}) {
    const hasVersion =
        typeof versionNumber === "number" &&
        Number.isFinite(versionNumber) &&
        versionNumber > 0;
    const extMatch = filename.match(/\.(\w+)$/);
    const ext = extMatch ? extMatch[1].toUpperCase() : "FILE";
    const rawBasename = extMatch
        ? filename.slice(0, -extMatch[0].length)
        : filename;
    // Strip any legacy "[Edited V3]" suffix that may still be baked into
    // older saved download filenames — the version is surfaced as a
    // separate tag now.
    const basename = rawBasename.replace(/\s*\[Edited V\d+\]\s*$/, "").trim();
    // Only backend-relative URLs are accepted. The download fetch carries
    // the user's bearer token, so any absolute URL from tool output is
    // refused to keep the token from leaking off-origin.
    const API_BASE =
        apiBase();
    const normalizedUrl = (() => {
        const legacy = download_url.match(
            /^\/api\/startups\/[^/]+\/documents\/([^/]+)\/download$/,
        );
        if (legacy) return `/api/documents/${legacy[1]}/download`;
        return download_url;
    })();
    const isSafeHref = normalizedUrl.startsWith("/");
    const href = isSafeHref ? `${API_BASE}${normalizedUrl}` : null;
    const [busy, setBusy] = useState(false);

    const handleDownload = async (e?: {
        stopPropagation?: () => void;
        preventDefault?: () => void;
    }) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        if (busy || isReloading || !href) return;
        setBusy(true);
        try {
            const resp = await fetch(href);
            if (!resp.ok) {
                throw new Error(
                    resp.status === 404
                        ? "Document not found. Try asking the assistant to regenerate it."
                        : `Download failed (HTTP ${resp.status})`,
                );
            }
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            console.error("[DocDownloadBlock]", err);
        } finally {
            setBusy(false);
        }
    };

    const spinning = busy || isReloading;

    const body = (
        <div className="flex items-center gap-3 px-4 py-3 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                    <p className="text-base font-serif text-gray-900 text-wrap">
                        {basename}
                    </p>
                    {hasVersion && (
                        <span className="shrink-0 inline-flex items-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            V{versionNumber}
                        </span>
                    )}
                </div>
                <p className="text-xs text-blue-500 mt-0.5">{ext}</p>
            </div>
        </div>
    );

    const downloadIcon = spinning ? (
        <div
            aria-disabled
            className="shrink-0 flex items-center border-l border-gray-200 px-6 bg-white text-gray-400 cursor-not-allowed"
        >
            <Loader2 size={13} className="animate-spin" />
        </div>
    ) : (
        <button
            type="button"
            onClick={handleDownload}
            className="shrink-0 flex items-center border-l border-gray-200 px-6 bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
        >
            <Download size={13} />
        </button>
    );

    // Only show the download button when there is an actual URL to fetch.
    const canDownload = !!href;

    if (onOpen) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex items-stretch flex-1 min-w-0 text-left hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    {body}
                </button>
                {canDownload && downloadIcon}
            </div>
        );
    }

    if (spinning) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                {body}
                {canDownload && downloadIcon}
            </div>
        );
    }

    if (!canDownload) {
        // No download URL and no open handler — render as a non-interactive card.
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                {body}
            </div>
        );
    }

    return (
        <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
            <button
                type="button"
                onClick={handleDownload}
                className="flex items-stretch flex-1 min-w-0 text-left hover:bg-gray-100 transition-colors cursor-pointer"
            >
                {body}
            </button>
            {downloadIcon}
        </div>
    );
}

function ScreeningResultsBlock({
    startupName,
    totalEntities,
    flaggedCount,
    reviewCount,
    screeningConfidence,
    isStreaming,
    onOpen,
}: {
    startupName?: string | null;
    totalEntities: number;
    flaggedCount: number;
    reviewCount: number;
    screeningConfidence?: number | null;
    isStreaming?: boolean;
    onOpen?: () => void;
}) {
    const title = startupName?.trim()
        ? `Screening — ${startupName.trim()}`
        : "Screening Results";
    const summary = isStreaming
        ? "Running Watchman screen…"
        : `${totalEntities} entities · ${flaggedCount} flagged · ${reviewCount} review${
              screeningConfidence != null
                  ? ` · ${screeningConfidence}% confidence`
                  : ""
          }`;

    const body = (
        <div className="flex items-center gap-3 px-4 py-3 min-w-0 flex-1">
            <ShieldAlert
                className={`h-4 w-4 shrink-0 ${isStreaming ? "text-gray-400" : "text-amber-600"}`}
            />
            <div className="min-w-0 flex-1">
                <p className="text-base font-serif text-gray-900 text-wrap">
                    {title}
                </p>
                <p className="text-xs text-blue-500 mt-0.5">{summary}</p>
            </div>
        </div>
    );

    if (isStreaming) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                {body}
                <div className="shrink-0 flex items-center border-l border-gray-200 px-6 bg-white text-gray-400">
                    <Loader2 size={13} className="animate-spin" />
                </div>
            </div>
        );
    }

    if (onOpen) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex items-stretch flex-1 min-w-0 text-left hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    {body}
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
            {body}
        </div>
    );
}

function WorkflowAppliedBlock({
    title,
    showConnector,
    onClick,
}: {
    title: string;
    showConnector?: boolean;
    onClick?: () => void;
}) {
    return (
        <div className="flex items-start text-sm font-serif text-gray-500 relative">
            {showConnector && (
                <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
            )}
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <div className="ml-2 min-w-0 flex-1 whitespace-normal break-words">
                <span className="font-medium">Applied Workflow</span>{" "}
                {onClick ? (
                    <button
                        onClick={onClick}
                        className="text-left hover:text-gray-700 transition-colors cursor-pointer"
                    >
                        {title}
                    </button>
                ) : (
                    <span>{title}</span>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Citation preprocessing
// ---------------------------------------------------------------------------

function preprocessCitations(
    text: string,
    annotations: AppCitationAnnotation[],
    citationsList: AppCitationAnnotation[],
): string {
    // Replace [N] or [N, M, ...] inline markers with internal §idx§ tokens backed by annotations
    return text.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (full, refsStr) => {
        const refs = (refsStr as string)
            .split(",")
            .map((s: string) => parseInt(s.trim(), 10));
        const tokens = refs.flatMap((ref: number) => {
            const ann = annotations.find((a) => a.ref === ref);
            if (!ann) return [];
            const idx = citationsList.length;
            citationsList.push(ann);
            return [`\`§${idx}§\`\u200B`];
        });
        return tokens.length > 0 ? tokens.join("") : full;
    });
}

// ---------------------------------------------------------------------------
// Markdown renderer (shared config)
// ---------------------------------------------------------------------------

function MarkdownContent({
    text,
    citationsList,
    onCitationClick,
    divRef,
}: {
    text: string;
    citationsList: AppCitationAnnotation[];
    onCitationClick?: (c: AppCitationAnnotation) => void;
    divRef?: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <div
            ref={divRef}
            className="text-gray-900 mb-4 text-base prose prose-sm max-w-none font-serif"
        >
            <ReactMarkdown
                remarkPlugins={[
                    [remarkMath, { singleDollarTextMath: false }],
                    remarkGfm,
                ]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4">
                            <table
                                className="min-w-full divide-y divide-gray-300 border border-gray-200 rounded-lg overflow-hidden"
                                {...props}
                            />
                        </div>
                    ),
                    thead: ({ node, ...props }) => (
                        <thead className="bg-gray-50" {...props} />
                    ),
                    tbody: ({ node, ...props }) => (
                        <tbody
                            className="divide-y divide-gray-200 bg-white"
                            {...props}
                        />
                    ),
                    tr: ({ node, ...props }) => <tr {...props} />,
                    th: ({ node, ...props }) => (
                        <th
                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                            {...props}
                        />
                    ),
                    td: ({ node, ...props }) => (
                        <td
                            className="whitespace-normal px-3 py-4 text-sm text-gray-900"
                            {...props}
                        />
                    ),
                    h1: ({ node, ...props }) => (
                        <h1
                            className="mt-6 mb-4 text-3xl font-serif font-semibold"
                            {...props}
                        />
                    ),
                    h2: ({ node, ...props }) => (
                        <h2
                            className="mt-5 mb-3 text-2xl font-serif font-semibold"
                            {...props}
                        />
                    ),
                    h3: ({ node, ...props }) => (
                        <h3
                            className="text-xl font-semibold mt-4 mb-2"
                            {...props}
                        />
                    ),
                    h4: ({ node, ...props }) => (
                        <h4
                            className="text-lg font-semibold mt-4 mb-2"
                            {...props}
                        />
                    ),
                    p: ({ node, ...props }) => {
                        const parent = (node as { parent?: { type?: string } })?.parent;
                        if (parent?.type === "listItem") {
                            return (
                                <p
                                    className="inline leading-7 m-0"
                                    {...props}
                                />
                            );
                        }
                        return <p className="mb-4 leading-7" {...props} />;
                    },
                    ul: ({ node, ...props }) => (
                        <ul
                            className="list-disc list-outside mb-4 pl-6"
                            {...props}
                        />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol
                            className="list-decimal list-outside mb-4 pl-6"
                            {...props}
                        />
                    ),
                    li: ({ node, ...props }) => (
                        <li className="mb-2 leading-7" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                        <strong className="font-semibold" {...props} />
                    ),
                    em: ({ node, ...props }) => (
                        <em className="italic" {...props} />
                    ),
                    code: ({ node, children, ...props }) => {
                        const text = String(children);
                        const citMatch = text.match(/^§(\d+)§$/);
                        if (citMatch) {
                            const idx = parseInt(citMatch[1]);
                            const annotation = citationsList[idx];
                            if (annotation) {
                                const tooltipText = `${formatCitationPage(annotation)}: "${displayCitationQuote(annotation)}"`;
                                return (
                                    <button
                                        onClick={() => {
                                            console.log(
                                                "[AssistantMessage] citation clicked",
                                                annotation,
                                            );
                                            onCitationClick?.(annotation);
                                        }}
                                        className="mx-0.5 inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-medium transition-colors align-super bg-gray-100 text-gray-900 hover:bg-gray-200"
                                        title={tooltipText}
                                    >
                                        {idx + 1}
                                    </button>
                                );
                            }
                        }
                        return (
                            <code
                                className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-serif"
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                    blockquote: ({ node, ...props }) => (
                        <blockquote
                            className="border-l-4 border-gray-300 pl-4 italic my-4"
                            {...props}
                        />
                    ),
                    a: ({ node, href, children, ...props }) => (
                        <a
                            href={href}
                            className="text-blue-600 hover:text-blue-700 underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                        >
                            {children}
                        </a>
                    ),
                    hr: ({ node, ...props }) => (
                        <hr className="my-6 border-gray-200" {...props} />
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
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
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
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
                                <Check className="h-3.5 w-3.5 text-green-600" />
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
