/** Read-only previews of a workflow: its prompt (assistant) or its columns (tabular). */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AppWorkflow } from "@/types/app";
import { formatIcon, formatLabel } from "@/features/tabular/lib/columnFormat";

// ---------------------------------------------------------------------------
// Shared markdown renderer
// ---------------------------------------------------------------------------
function MarkdownBody({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({ children }) => (
                    <h1 className="text-base font-semibold text-gray-900 mt-4 mb-1 first:mt-0">
                        {children}
                    </h1>
                ),
                h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-gray-900 mt-3 mb-1 first:mt-0">
                        {children}
                    </h2>
                ),
                h3: ({ children }) => (
                    <h3 className="text-xs font-semibold text-gray-900 mt-2 mb-0.5 first:mt-0">
                        {children}
                    </h3>
                ),
                p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                    <ul className="list-disc pl-4 mb-2 space-y-0.5">
                        {children}
                    </ul>
                ),
                ol: ({ children }) => (
                    <ol className="list-decimal pl-4 mb-2 space-y-0.5">
                        {children}
                    </ol>
                ),
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => (
                    <strong className="font-semibold text-gray-800">
                        {children}
                    </strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

// ---------------------------------------------------------------------------
// Right panel for assistant workflows (select screen)
// ---------------------------------------------------------------------------
export function AssistantPanel({ workflow }: { workflow: AppWorkflow }) {
    return (
        <div className="flex-1 border-l border-t border-gray-200 flex flex-col overflow-hidden px-3 pb-3">
            <div className="py-3 shrink-0">
                <p className="text-xs font-medium text-gray-700">
                    Workflow Prompt
                </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm border border-gray-200 rounded-md text-gray-600 leading-relaxed font-serif bg-gray-50">
                <MarkdownBody
                    content={workflow.prompt_md ?? "_No prompt defined._"}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Right panel for tabular workflows — accordion column list (select screen)
// ---------------------------------------------------------------------------
export function TabularPanel({ workflow }: { workflow: AppWorkflow }) {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const columns = (workflow.columns_config ?? []).sort(
        (a, b) => a.index - b.index,
    );

    return (
        <div className="flex-1 border-l border-t border-gray-200 flex flex-col overflow-hidden px-3 pb-3">
            <div className="py-3 shrink-0">
                <p className="text-xs font-medium text-gray-700">Columns</p>
            </div>
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md bg-gray-50">
                {columns.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-center text-gray-400">
                        No columns defined
                    </p>
                ) : (
                    columns.map((col) => {
                        const isExpanded = expandedIndex === col.index;
                        const FormatIcon = formatIcon(col.format ?? "text");
                        return (
                            <div
                                key={col.index}
                                className="border-b border-gray-200"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedIndex(
                                            isExpanded ? null : col.index,
                                        )
                                    }
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left hover:bg-white transition-colors"
                                >
                                    <FormatIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    <span className="flex-1 truncate text-gray-800">
                                        {col.name}
                                    </span>
                                    <span className="shrink-0 text-gray-400">
                                        {formatLabel(col.format ?? "text")}
                                    </span>
                                    <ChevronDown
                                        className={`h-3 w-3 shrink-0 text-gray-300 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                                    />
                                </button>
                                {isExpanded && (
                                    <div className="px-4 py-3 bg-white border-t border-gray-200 text-sm text-gray-600 leading-relaxed font-serif space-y-3">
                                        {col.tags && col.tags.length > 0 && (
                                            <div>
                                                <p className="text-xs font-medium text-gray-400 mb-1.5 font-sans">
                                                    Tags
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {col.tags.map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-sans"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs font-medium text-gray-400 mb-1 font-sans">
                                                Prompt
                                            </p>
                                            <MarkdownBody
                                                content={
                                                    col.prompt ||
                                                    "_No prompt defined._"
                                                }
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
