/** Cards for tool results inside an assistant reply: a screening run, an applied workflow. */

import { Loader2, ShieldAlert } from "lucide-react";

export function ScreeningResultsBlock({
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
                <p className="text-xs text-gray-500 mt-0.5">{summary}</p>
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

export function WorkflowAppliedBlock({
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
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
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
