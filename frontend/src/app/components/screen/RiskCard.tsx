"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EntityResult } from "@/lib/screenerTypes";
import { WatchmanMatchesList } from "@/app/components/screen/WatchmanMatchDetails";
import { OwnershipChainVisual } from "@/app/components/screen/OwnershipChainVisual";

function AnalystNotes({ text }: { text: string }) {
  return (
    <div className="text-sm text-gray-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export function RiskCard({
  entity,
  onViewDetails,
  startupName,
}: {
  entity: EntityResult;
  onViewDetails?: () => void;
  startupName?: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const isFlagged = entity.riskLevel === "flagged";
  const headerBg = isFlagged ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const badgeCls = isFlagged
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";

  return (
    <div className={`rounded-lg border overflow-hidden ${headerBg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badgeCls}`}
          >
            {entity.riskLevel}
          </span>
          <span className="font-semibold text-gray-900 truncate">{entity.name}</span>
          <span className="text-xs text-gray-500 shrink-0 capitalize">
            ({entity.type})
          </span>
          {entity.topScore !== null && (
            <span className="text-xs font-semibold text-gray-700 shrink-0 tabular-nums">
              {(entity.topScore * 100).toFixed(1)}%
            </span>
          )}
          {entity.matches.length > 0 && (
            <span className="text-xs text-gray-400 shrink-0">
              · {entity.matches.length} hit{entity.matches.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          className={`shrink-0 h-4 w-4 text-gray-400 transition-transform ml-3 ${
            expanded ? "" : "-rotate-90"
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t bg-white px-5 py-4 space-y-4">
          {entity.exposureStatement && (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Ownership exposure
              </p>
              <p className="text-sm text-gray-800 leading-relaxed">
                {entity.exposureStatement}
              </p>
            </div>
          )}

          {(entity.ownershipPath.length > 1 ||
            entity.ownershipPathSteps?.length) && (
            <OwnershipChainVisual entity={entity} startupName={startupName} />
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Watchman sanctions data
              </p>
              {onViewDetails && (
                <button
                  type="button"
                  onClick={onViewDetails}
                  className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-950 hover:underline"
                >
                  Expand
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <WatchmanMatchesList matches={entity.matches} entity={entity} />
          </div>

          {entity.explanation && (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Analyst notes (AI)
              </p>
              <AnalystNotes text={entity.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
