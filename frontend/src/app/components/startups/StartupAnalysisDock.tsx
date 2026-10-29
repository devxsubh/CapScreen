"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { OwnershipGraph } from "@/app/components/screen/OwnershipGraph";
import { RiskTable } from "@/app/components/screen/RiskTable";
import { RiskCard } from "@/app/components/screen/RiskCard";
import { EntityDetailModal } from "@/app/components/screen/EntityDetailModal";
import type { EntityResult } from "@/lib/screenerTypes";
import { CapTableCsvView } from "@/app/components/startups/CapTableCsvView";
import type { ScreenPurpose } from "@/lib/screenerInitialPrompt";
import type { CsvRecord } from "@/lib/startupsApi";
import type { ScreeningResult } from "@/lib/screenerTypes";
import { downloadScreeningReportCsv } from "@/lib/startupsApi";
import { StartupDocumentsPanel } from "@/app/components/startups/StartupDocumentsPanel";

type DockTab = "graph" | "entities" | "flags" | "csv" | "documents";

interface Props {
    screeningResult: ScreeningResult | null;
    startupId: string;
    screening?: boolean;
    activeCsv?: CsvRecord | null;
    viewPurpose?: ScreenPurpose;
    onViewPurposeChange?: (p: ScreenPurpose) => void;
    showCoInvestor?: boolean;
    showVendor?: boolean;
    onCsvSaveAndRescreen?: (csvId: string, content: string) => void | Promise<void>;
    /** Bump to reload the Documents tab (e.g. after the assistant creates a memo). */
    documentsRefreshKey?: number;
}

export function StartupAnalysisDock({
    screeningResult,
    startupId,
    screening = false,
    activeCsv = null,
    viewPurpose = "cap_table",
    onViewPurposeChange,
    showCoInvestor = false,
    showVendor = false,
    onCsvSaveAndRescreen,
    documentsRefreshKey = 0,
}: Props) {
    const [tab, setTab] = useState<DockTab>(
        activeCsv && !screeningResult ? "csv" : "graph",
    );
    const [selectedEntity, setSelectedEntity] = useState<EntityResult | null>(null);
    const [exportingCsv, setExportingCsv] = useState(false);

    const isRosterScreen =
        screeningResult?.screeningMode === "entity_roster";

    useEffect(() => {
        if (isRosterScreen) {
            setTab("entities");
        }
    }, [isRosterScreen, screeningResult?.csvId]);

    const nonClear =
        screeningResult?.entities.filter((e) => e.riskLevel !== "clear") ?? [];

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-white">
            <EntityDetailModal
                entity={selectedEntity}
                onClose={() => setSelectedEntity(null)}
                startupName={screeningResult?.startupName}
            />
            {/* Tab bar — folder-style tabs */}
            <div className="shrink-0 border-b border-black/[0.06] bg-white px-4 py-2">
                {(showCoInvestor || showVendor) && onViewPurposeChange && (
                    <div className="flex gap-1 pb-2">
                        {(
                            [
                                ["cap_table", "Cap table"],
                                ...(showCoInvestor
                                    ? [["co_investor", "Co-investors"] as const]
                                    : []),
                                ...(showVendor
                                    ? [["vendor", "Vendors"] as const]
                                    : []),
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() =>
                                    onViewPurposeChange(key as ScreenPurpose)
                                }
                                className={`text-[11px] px-2 py-1 rounded-md border ${
                                    viewPurpose === key
                                        ? "bg-white border-gray-300 text-gray-900"
                                        : "border-transparent text-gray-500 hover:text-gray-800"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between gap-3 min-w-0">
                    <nav
                        className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1"
                        role="tablist"
                    >
                        {activeCsv && (
                            <TabButton
                                active={tab === "csv"}
                                onClick={() => setTab("csv")}
                                label="Cap table"
                            />
                        )}
                        {!activeCsv && !screeningResult && (
                            <TabButton active={tab === "graph"} onClick={() => setTab("graph")} label="Screening" />
                        )}
                        {screeningResult && (
                            <>
                                <TabButton
                                    active={tab === "graph"}
                                    onClick={() => setTab("graph")}
                                    label="Graph"
                                />
                                <TabButton
                                    active={tab === "entities"}
                                    onClick={() => setTab("entities")}
                                    label={`Entities (${screeningResult.totalEntities})`}
                                />
                                {nonClear.length > 0 && (
                                    <TabButton
                                        active={tab === "flags"}
                                        onClick={() => setTab("flags")}
                                        label={`Flags (${nonClear.length})`}
                                        variant="warning"
                                    />
                                )}
                            </>
                        )}
                        <TabButton
                            active={tab === "documents"}
                            onClick={() => setTab("documents")}
                            label="Documents"
                        />
                    </nav>
                    {screeningResult && viewPurpose === "cap_table" && tab !== "documents" && (
                        <button
                            type="button"
                            disabled={exportingCsv}
                            onClick={() => {
                                setExportingCsv(true);
                                void downloadScreeningReportCsv(startupId)
                                    .catch(() => {})
                                    .finally(() => setExportingCsv(false));
                            }}
                            className="shrink-0 text-xs text-gray-700 hover:text-gray-950 hover:underline whitespace-nowrap disabled:opacity-50"
                        >
                            {exportingCsv ? "Exporting…" : "Export CSV"}
                        </button>
                    )}
                </div>
            </div>

            <div
                className={`flex-1 min-h-0 bg-white ${
                    tab === "documents"
                        ? "overflow-hidden"
                        : screening || (!screeningResult && !activeCsv)
                          ? "flex overflow-hidden"
                          : tab === "graph" || tab === "csv"
                            ? "overflow-hidden p-4"
                        : "overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                }`}
            >
                {tab === "documents" ? (
                    <StartupDocumentsPanel startupId={startupId} refreshKey={documentsRefreshKey} />
                ) : screening ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50 text-gray-500">
                        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
                        <p className="text-sm">
                            {screeningResult ? "Re-running sanctions screen…" : "Running sanctions screen…"}
                        </p>
                    </div>
                ) : !screeningResult && !activeCsv ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50 px-8 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white">
                            <BarChart3 className="h-5 w-5 text-gray-400" />
                        </div>
                        <p className="max-w-[220px] text-sm text-gray-600">
                            Upload a cap-table CSV to see the ownership graph and entity risk grid.
                        </p>
                    </div>
                ) : null}

                {!screening && tab === "csv" && activeCsv && (
                    <div className="h-full min-h-0">
                        <CapTableCsvView
                            csv={activeCsv}
                            saving={screening}
                            onSaveAndRescreen={(content) =>
                                onCsvSaveAndRescreen?.(activeCsv.id, content)
                            }
                        />
                    </div>
                )}

                {!screening && tab === "graph" && screeningResult && (
                    <div className="w-full h-full bg-white">
                        {isRosterScreen ||
                        screeningResult.edges.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-500">
                                <p className="font-medium text-gray-700">
                                    No ownership graph
                                </p>
                                <p className="max-w-[240px] text-xs leading-relaxed">
                                    This screening used a flat entity list —
                                    open the Entities tab for results.
                                </p>
                            </div>
                        ) : (
                            <OwnershipGraph
                                entities={screeningResult.entities}
                                edges={screeningResult.edges}
                                fill
                                onEntitySelect={setSelectedEntity}
                            />
                        )}
                    </div>
                )}

                {!screening && tab === "entities" && screeningResult && (
                    <RiskTable
                        entities={screeningResult.entities}
                        startupId={startupId}
                        onEntitySelect={setSelectedEntity}
                    />
                )}

                {!screening && tab === "flags" && screeningResult && (
                    <div className="space-y-2">
                        {nonClear.map((entity) => (
                            <RiskCard
                                key={entity.name}
                                entity={entity}
                                startupName={screeningResult.startupName}
                                onViewDetails={() => setSelectedEntity(entity)}
                            />
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    label,
    variant = "default",
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    variant?: "default" | "warning";
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={[
                "h-7 shrink-0 rounded-md px-2.5 text-[13px] transition-colors",
                active
                    ? "bg-black/[0.06] font-medium text-gray-950"
                    : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900",
                variant === "warning" && active && "bg-amber-100/70 text-amber-900",
                variant === "warning" && !active && "text-amber-700 hover:bg-amber-50 hover:text-amber-900",
            ].join(" ")}
        >
            {label}
        </button>
    );
}
