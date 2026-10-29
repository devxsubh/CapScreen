"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { OwnershipGraph } from "@/app/components/screen/OwnershipGraph";
import { RiskTable } from "@/app/components/screen/RiskTable";
import { EntityDetailModal } from "@/app/components/screen/EntityDetailModal";
import type { EntityResult, ScreeningResult } from "@/lib/screenerTypes";
import { useIsMobile } from "@/app/hooks/useIsMobile";

export const SCREENING_TAB_ID = "__screening_results__";

export function screeningTabLabel(data: ScreeningResult): string {
  return data.startupName
    ? `Screening — ${data.startupName}`
    : "Screening Results";
}

interface ContentProps {
  data: ScreeningResult;
  startupId?: string;
  embedded?: boolean;
  /** When false (assistant chat), graph + table only — no entity detail modal. */
  allowEntityDetails?: boolean;
  handoffFilename?: string | null;
  onContinueInStartup?: () => void;
}

/** Scrollable screening body — used in the side-panel tab and standalone panel. */
export function ScreeningResultsContent({
  data,
  startupId,
  embedded = false,
  allowEntityDetails = true,
  handoffFilename,
  onContinueInStartup,
}: ContentProps) {
  const isMobile = useIsMobile();
  const graphHeight = isMobile ? 240 : 360;
  const [selectedEntity, setSelectedEntity] = useState<EntityResult | null>(
    null,
  );
  const onEntitySelect = allowEntityDetails ? setSelectedEntity : undefined;

  return (
    <>
      {allowEntityDetails && (
        <EntityDetailModal
          entity={selectedEntity}
          onClose={() => setSelectedEntity(null)}
          startupName={data.startupName}
        />
      )}

      {data.dataSourceAvailable === false && (
        <div
          className={`flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 ${embedded ? "mx-4 mt-3" : "mx-4 mt-3"}`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Sanctions data source (Watchman) was unavailable for this screen.
            Results cannot be treated as cleared — restart Watchman and re-run
            screening before making compliance decisions.
          </p>
        </div>
      )}

      {embedded && (
        <div className="px-3 sm:px-4 pt-3 pb-1 shrink-0 border-b border-gray-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            {data.totalEntities} entities · {data.flaggedCount} flagged ·{" "}
            {data.reviewCount} review
            {data.screeningConfidence != null && (
              <> · {data.screeningConfidence}% confidence</>
            )}
          </p>
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${embedded ? "min-h-0" : ""}`}
      >
        <section>
          <h3 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Ownership graph
          </h3>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ height: graphHeight }}
          >
            <OwnershipGraph
              entities={data.entities}
              edges={data.edges}
              height={graphHeight}
              onEntitySelect={onEntitySelect}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Entity risk
          </h3>
          {allowEntityDetails ? (
            <p className="text-[11px] text-gray-500 mb-2">
              Click a row or graph node for full match details and analyst notes.
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 mb-2">
              Set up a startup workspace below for entity-level review and analyst notes.
            </p>
          )}
          <RiskTable
            entities={data.entities}
            startupId={startupId}
            onEntitySelect={onEntitySelect}
          />
        </section>
      </div>

      {!startupId && handoffFilename && onContinueInStartup && (
        <div className="shrink-0 border-t border-gray-100 px-3 sm:px-4 py-3 bg-gray-50">
          <button
            type="button"
            onClick={onContinueInStartup}
            className="w-full rounded-lg bg-gray-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Set up startup &amp; continue review
          </button>
          <p className="mt-1.5 text-[11px] text-gray-500 text-center break-words">
            Saves {handoffFilename} to a new startup workspace
          </p>
        </div>
      )}
    </>
  );
}

interface ScreeningResultsPanelProps {
  data: ScreeningResult;
  onClose: () => void;
  startupId?: string;
  handoffFilename?: string | null;
  onContinueInStartup?: () => void;
}

export function ScreeningResultsPanel({
  data,
  onClose,
  startupId,
  handoffFilename,
  onContinueInStartup,
}: ScreeningResultsPanelProps) {
  return (
    <div className="flex flex-col h-full border-l bg-white w-full md:w-[min(100%,24rem)] shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Screening Results</h2>
          <p className="text-xs text-gray-500">
            {data.totalEntities} entities · {data.flaggedCount} flagged ·{" "}
            {data.reviewCount} review
            {data.screeningConfidence != null && (
              <> · {data.screeningConfidence}% confidence</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-gray-100"
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScreeningResultsContent
        data={data}
        startupId={startupId}
        handoffFilename={handoffFilename}
        onContinueInStartup={onContinueInStartup}
      />
    </div>
  );
}
