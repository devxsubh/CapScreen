/** One message in the tabular review chat: status, tool steps, cited markdown. */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CapScreenIcon } from "@/components/chat/CapScreenIcon";
import type { TRCitationAnnotation } from "@/api/tabularReviews";
import type { AssistantEvent } from "@/types/app";
import { PreResponseWrapper } from "@/components/chat/PreResponseWrapper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TRMessage {
    role: "user" | "assistant";
    content: string;
    events?: AssistantEvent[];
    annotations?: TRCitationAnnotation[];
    isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Reasoning block
// ---------------------------------------------------------------------------

const THINKING_PHRASES = [
    "Thinking...",
    "Pondering...",
    "Analyzing...",
    "Reasoning...",
];

// ---------------------------------------------------------------------------
// DocRead block
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Citation preprocessing (matches AssistantMessage.tsx pattern)
// ---------------------------------------------------------------------------

function preprocessTRCitations(
    text: string,
    annotations: TRCitationAnnotation[],
    citationsList: TRCitationAnnotation[],
): string {
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
// ResponseStatus
// ---------------------------------------------------------------------------

function TRResponseStatus({ isActive }: { isActive: boolean }) {
    const [showDone, setShowDone] = useState(false);
    const [doneVisible, setDoneVisible] = useState(false);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        if (wasActiveRef.current && !isActive) {
            setShowDone(true);
            setDoneVisible(true);
            const t = setTimeout(() => setDoneVisible(false), 1500);
            wasActiveRef.current = isActive;
            return () => clearTimeout(t);
        }
        if (!wasActiveRef.current && isActive) {
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
                brand={!(showDone && doneVisible)}
                size={22}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// TRAssistantMessage
// ---------------------------------------------------------------------------

type TREventGroup =
    | { kind: "pre"; events: AssistantEvent[]; indices: number[] }
    | {
          kind: "content";
          event: Extract<AssistantEvent, { type: "content" }>;
          index: number;
      };

function TRAssistantMessage({
    msg,
    onCitationClick,
}: {
    msg: TRMessage;
    onCitationClick: (colIdx: number, rowIdx: number) => void;
}) {
    const annotations = msg.annotations ?? [];
    const citationsList: TRCitationAnnotation[] = [];

    // Pre-process all content events
    const processedTexts: string[] = (msg.events ?? []).map((e) =>
        e.type === "content"
            ? preprocessTRCitations(e.text, annotations, citationsList)
            : "",
    );

    const events = msg.events ?? [];

    // Group consecutive non-content events together so they share a single
    // PreResponseWrapper. Content events render between wrappers.
    const groups: TREventGroup[] = [];
    {
        let current: Extract<TREventGroup, { kind: "pre" }> | null = null;
        events.forEach((e, i) => {
            if (e.type === "content") {
                if (current) {
                    groups.push(current);
                    current = null;
                }
                groups.push({ kind: "content", event: e, index: i });
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
            if (g.kind === "content") return true;
        }
        return false;
    };

    const renderPreEvent = (event: AssistantEvent, key: number) => {
        if (event.type === "thinking") {
            return (
                <div
                    key={key}
                    className="flex items-center text-sm text-gray-400 ml-1"
                >
                    <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
                    <span className="ml-2">Thinking...</span>
                </div>
            );
        }
        return null;
    };

    const renderContent = (text: string, key: number) => (
        <div
            key={key}
            className="prose prose-sm max-w-none text-sm leading-relaxed"
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ node, ...props }) => (
                        <p className="mb-2 leading-6" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                        <ul
                            className="list-disc list-outside mb-2 pl-4"
                            {...props}
                        />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol
                            className="list-decimal list-outside mb-2 pl-4"
                            {...props}
                        />
                    ),
                    li: ({ node, ...props }) => (
                        <li className="mb-0.5 leading-6" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                        <strong className="font-semibold" {...props} />
                    ),
                    code: ({ children }) => {
                        const codeText = String(children);
                        const citMatch = codeText.match(/^§(\d+)§$/);
                        if (citMatch) {
                            const idx = parseInt(citMatch[1]);
                            const cit = citationsList[idx];
                            if (cit) {
                                return (
                                    <button
                                        onClick={() =>
                                            onCitationClick(
                                                cit.col_index,
                                                cit.row_index,
                                            )
                                        }
                                        title={`${cit.col_name} · ${cit.doc_name.replace(/\.[^.]+$/, "")}`}
                                        className="mx-0.5 inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-medium bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors align-super font-serif"
                                    >
                                        {idx + 1}
                                    </button>
                                );
                            }
                        }
                        return (
                            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );

    return (
        <div className="text-gray-900 font-serif">
            <TRResponseStatus isActive={!!msg.isStreaming} />
            {groups.length > 0 && (
                <div className="flex flex-col gap-2.5">
                    {groups.map((g, gIdx) => {
                        if (g.kind === "content") {
                            return renderContent(
                                processedTexts[g.index],
                                g.index,
                            );
                        }
                        const subsequentContent = hasContentAfter(gIdx);
                        // "Working" while at least one event in *this*
                        // wrapper is actively streaming.
                        const wrapperIsStreaming = g.events.some(
                            (event) =>
                                "isStreaming" in event && !!event.isStreaming,
                        );
                        return (
                            <PreResponseWrapper
                                key={`p-${g.indices[0]}`}
                                stepCount={g.events.length}
                                shouldMinimize={subsequentContent}
                                isStreaming={wrapperIsStreaming}
                                compact
                            >
                                {g.events.map((event, i) =>
                                    renderPreEvent(event, g.indices[i]),
                                )}
                            </PreResponseWrapper>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({
    msg,
    onCitationClick,
}: {
    msg: TRMessage;
    onCitationClick: (colIdx: number, rowIdx: number) => void;
}) {
    if (msg.role === "user") {
        return (
            <div className="flex justify-end">
                <div className="max-w-[90%] rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap">
                    {msg.content}
                </div>
            </div>
        );
    }
    return <TRAssistantMessage msg={msg} onCitationClick={onCitationClick} />;
}
