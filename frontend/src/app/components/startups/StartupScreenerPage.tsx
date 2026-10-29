"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ChevronRight,
    Check,
    ChevronDown,
    File,
    Pencil,
    Plus,
    RefreshCw,
    X,
} from "lucide-react";
import { useScreenerChat } from "@/app/hooks/useScreenerChat";
import { StartupChatPanel } from "@/app/components/startups/StartupChatPanel";
import { StartupAnalysisDock } from "@/app/components/startups/StartupAnalysisDock";
import { ScreeningFollowUpActions } from "@/app/components/startups/ScreeningFollowUpActions";
import { ScreeningDeltaBanner } from "@/app/components/startups/ScreeningDeltaBanner";
import { WatchFolderButton } from "./WatchFolderButton";
import { StartupAuditMenu } from "@/app/components/startups/StartupAuditMenu";
import {
    getStartup,
    listCsvs,
    saveCsv,
    updateCsv,
    deleteCsv,
    renameStartup,
    screenStartup,
    type StartupRecord,
    type CsvRecord,
} from "@/lib/startupsApi";
import { createAuditLog } from "@/app/lib/auditLogApi";
import { useSidebar } from "@/app/contexts/SidebarContext";
import { useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
import {
    consumeScreenerInitialPrompt,
    CAP_TABLE_SCREEN_WORKFLOW_PROMPT,
    type ScreenPurpose,
} from "@/lib/screenerInitialPrompt";
import { ResizeDivider } from "@/app/components/shared/ResizeDivider";
import { useIsMobile } from "@/app/hooks/useIsMobile";

const CHAT_PANEL_MIN = 320;
const ANALYSIS_PANEL_MIN = 400;
const CHAT_PANEL_DEFAULT = 480;

function csvPurposeKey(csv: CsvRecord): ScreenPurpose {
    if (csv.rosterPurpose === "co_investor") return "co_investor";
    if (csv.rosterPurpose === "vendor") return "vendor";
    return "cap_table";
}

interface Props {
    startupId: string;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
    });
}

function StatusPill({ result }: { result: StartupRecord["lastScreeningResult"] }) {
    if (!result) return null;
    if (result.flaggedCount > 0)
        return (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {result.flaggedCount} flagged
            </span>
        );
    if (result.reviewCount > 0)
        return (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {result.reviewCount} review
            </span>
        );
    return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Clear
        </span>
    );
}

export function StartupScreenerPage({ startupId }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isMobile = useIsMobile();
    const splitRef = useRef<HTMLDivElement>(null);
    const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT);
    const [mobilePane, setMobilePane] = useState<"chat" | "analysis">("chat");
    const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
    const { setSidebarOpen } = useSidebar();
    const [startup, setStartup] = useState<StartupRecord | null>(null);
    const [csvList, setCsvList] = useState<CsvRecord[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [screening, setScreening] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [csvMenuOpen, setCsvMenuOpen] = useState(false);
    const [viewPurpose, setViewPurpose] = useState<ScreenPurpose>("cap_table");
    const [deltaRefreshKey, setDeltaRefreshKey] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const resultInitialized = useRef(false);
    const autoSummarySent = useRef(false);

    const {
        messages,
        isResponseLoading,
        chatHydrated,
        handleChat,
        answerApproval,
        cancel,
        screeningResult,
        setScreeningResult,
        isScreeningActive,
    } = useScreenerChat({
        startupId,
        onDocumentCreated: () => setDocumentsRefreshKey((k) => k + 1),
    });
    const { newChatMessages, setNewChatMessages } = useChatHistoryContext();
    const workflowSent = useRef(false);

    const activeCsv = useMemo(() => {
        if (csvList.length === 0) return null;
        const csvId =
            screeningResult?.csvId ??
            startup?.lastScreenedCsvId ??
            startup?.latestCsvId;
        if (csvId) {
            const match = csvList.find((c) => c.id === csvId);
            if (match) return match;
        }
        return csvList[0];
    }, [csvList, screeningResult?.csvId, startup?.lastScreenedCsvId, startup?.latestCsvId]);

    const displayResult = useMemo(() => {
        if (viewPurpose === "co_investor") {
            return startup?.lastCoInvestorScreeningResult ?? null;
        }
        if (viewPurpose === "vendor") {
            return startup?.lastVendorScreeningResult ?? null;
        }
        return screeningResult ?? startup?.lastScreeningResult ?? null;
    }, [viewPurpose, startup, screeningResult]);

    const showCoInvestor = !!startup?.lastCoInvestorScreeningResult;
    const showVendor = !!startup?.lastVendorScreeningResult;

    const activeCsvForView = useMemo(() => {
        const key =
            viewPurpose === "co_investor"
                ? "co_investor"
                : viewPurpose === "vendor"
                  ? "vendor"
                  : "cap_table";
        const mappedId = startup?.latestCsvByPurpose?.[key];
        if (mappedId) {
            const match = csvList.find((c) => c.id === mappedId);
            if (match) return match;
        }
        if (viewPurpose === "cap_table") return activeCsv;
        return (
            csvList.find((c) => c.rosterPurpose === viewPurpose) ?? null
        );
    }, [viewPurpose, startup?.latestCsvByPurpose, csvList, activeCsv]);

    useEffect(() => {
        setSidebarOpen(false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- collapse once on enter

    useEffect(() => {
        if (screeningResult) {
            setDeltaRefreshKey((k) => k + 1);
        }
    }, [screeningResult?.csvId, screeningResult?.flaggedCount, screeningResult?.reviewCount]);

    useEffect(() => {
        setPageLoading(true);
        setPageError(null);
        getStartup(startupId)
            .then((s) => {
                setStartup(s);
                setNameInput(s.name as string);
                if (s.lastScreeningResult && !resultInitialized.current) {
                    resultInitialized.current = true;
                    setScreeningResult(s.lastScreeningResult);
                }
            })
            .catch(() => {
                setPageError("Failed to load startup.");
            })
            .finally(() => setPageLoading(false));
        listCsvs(startupId)
            .then(setCsvList)
            .catch(() => {
                setUploadError("Could not load cap-table files.");
            });
    }, [startupId, setScreeningResult]);

    useEffect(() => {
        if (
            autoSummarySent.current ||
            searchParams.get("summarize") !== "1" ||
            !chatHydrated ||
            !screeningResult ||
            messages.length > 0 ||
            isResponseLoading
        ) {
            return;
        }
        autoSummarySent.current = true;
        router.replace(`/startups/${startupId}`, { scroll: false });
        const initialPrompt =
            consumeScreenerInitialPrompt(startupId) ??
            CAP_TABLE_SCREEN_WORKFLOW_PROMPT;
        void handleChat({
            role: "user",
            content: initialPrompt,
        });
    }, [
        startupId,
        searchParams,
        chatHydrated,
        screeningResult,
        messages.length,
        isResponseLoading,
        handleChat,
        router,
    ]);

    // A workflow started from the Workflows page for this startup: send it through this chat.
    useEffect(() => {
        const pending = newChatMessages?.[0];
        if (
            workflowSent.current ||
            searchParams.get("workflow") !== "1" ||
            !chatHydrated ||
            isResponseLoading ||
            !pending ||
            pending.role !== "user"
        ) {
            return;
        }
        workflowSent.current = true;
        setNewChatMessages(null);
        router.replace(`/startups/${startupId}`, { scroll: false });
        void handleChat(
            {
                role: "user",
                content: pending.content,
                files: pending.files?.map((f) => ({ filename: f.filename })),
                workflow: pending.workflow,
                focus: pending.focus,
            },
            pending.csvContent,
        );
    }, [
        startupId,
        searchParams,
        chatHydrated,
        isResponseLoading,
        newChatMessages,
        setNewChatMessages,
        handleChat,
        router,
    ]);

    useEffect(() => {
        if (editingName) {
            setTimeout(() => nameInputRef.current?.focus(), 0);
        }
    }, [editingName]);

    const handleRenameSave = useCallback(async () => {
        const trimmed = nameInput.trim();
        if (!trimmed || trimmed === (startup?.name as string)) {
            setEditingName(false);
            return;
        }
        setSavingName(true);
        try {
            const updated = await renameStartup(startupId, trimmed);
            setStartup((prev) => (prev ? { ...prev, name: updated.name } : prev));
        } catch {
            setNameInput((startup?.name as string) ?? "");
        } finally {
            setSavingName(false);
            setEditingName(false);
        }
    }, [nameInput, startup, startupId]);

    const runScreen = useCallback(
        async (csv: CsvRecord) => {
            if (csv.parseStatus === "invalid") {
                const detail = csv.parseErrors
                    .map((e) => `Row ${e.row}: ${e.message}`)
                    .join("; ");
                setUploadError(detail || "CSV has parse errors");
                return;
            }
            if (csv.parseStatus === "needs_review") {
                setUploadError(
                    "CSV needs review — confirm column mapping in the cap table tab before screening.",
                );
                return;
            }
            setScreening(true);
            setUploadError(null);
            setCsvMenuOpen(false);
            try {
                const purpose = csvPurposeKey(csv);
                const { screeningResult: result, startup: updated } =
                    await screenStartup(startupId, {
                        csvId: csv.id,
                        purpose,
                    });
                setStartup(updated);
                if (purpose === "cap_table") {
                    setScreeningResult(result);
                    setDeltaRefreshKey((k) => k + 1);
                    createAuditLog({
                        startupId,
                        eventType: "screening_completed",
                        details: {
                            totalEntities: result.totalEntities,
                            flaggedCount: result.flaggedCount,
                            reviewCount: result.reviewCount,
                            clearCount: result.clearCount,
                        },
                    }).catch(() => {});
                    void handleChat({
                        role: "user",
                        content: CAP_TABLE_SCREEN_WORKFLOW_PROMPT,
                    });
                } else {
                    setViewPurpose(purpose);
                }
            } catch (err) {
                setUploadError(
                    err instanceof Error ? err.message : "Screening failed",
                );
            } finally {
                setScreening(false);
            }
        },
        [startupId, setScreeningResult, handleChat],
    );

    const handleCsvSaveAndRescreen = useCallback(
        async (csvId: string, content: string) => {
            setScreening(true);
            setUploadError(null);
            try {
                const updatedCsv = await updateCsv(startupId, csvId, content);
                setCsvList((prev) =>
                    prev.map((c) => (c.id === csvId ? updatedCsv : c)),
                );
                if (
                    updatedCsv.parseStatus === "invalid" ||
                    updatedCsv.parseStatus === "needs_review"
                ) {
                    const detail = updatedCsv.parseErrors
                        .map((e) => `Row ${e.row}: ${e.message}`)
                        .join("; ");
                    setUploadError(
                        updatedCsv.parseStatus === "needs_review"
                            ? "Confirm column mapping before re-screening."
                            : detail || "CSV has parse errors",
                    );
                    return;
                }
                const csv = csvList.find((c) => c.id === csvId);
                const purpose = csv ? csvPurposeKey(csv) : "cap_table";
                const { screeningResult: result, startup: updated } =
                    await screenStartup(startupId, { csvId, purpose });
                setStartup(updated);
                if (purpose === "cap_table") {
                    setScreeningResult(result);
                }
                createAuditLog({
                    startupId,
                    eventType: "screening_completed",
                    details: {
                        totalEntities: result.totalEntities,
                        flaggedCount: result.flaggedCount,
                        reviewCount: result.reviewCount,
                        clearCount: result.clearCount,
                    },
                }).catch(() => {});
            } catch (err) {
                setUploadError(
                    err instanceof Error ? err.message : "Failed to save and re-screen",
                );
            } finally {
                setScreening(false);
            }
        },
        [startupId, setScreeningResult],
    );

    const handleFileUpload = useCallback(
        async (file: File) => {
            setUploading(true);
            setUploadError(null);
            setCsvMenuOpen(false);
            try {
                const content = await file.text();
                const stored = await saveCsv(startupId, file.name, content);
                setCsvList((prev) => [stored, ...prev]);
                if (stored.parseStatus === "invalid") {
                    setUploadError(
                        stored.parseErrors
                            .map((e) => `Row ${e.row}: ${e.message}`)
                            .join("; ") || "CSV cannot be screened",
                    );
                    return;
                }
                if (stored.parseStatus === "needs_review") {
                    setUploadError(
                        "CSV uploaded but needs column mapping review before screening.",
                    );
                    return;
                }
                await runScreen(stored);
            } catch (err) {
                setUploadError(
                    err instanceof Error ? err.message : "CSV upload failed",
                );
            } finally {
                setUploading(false);
            }
        },
        [startupId, runScreen],
    );

    const handleDeleteCsv = useCallback(
        async (e: React.MouseEvent, csv: CsvRecord) => {
            e.stopPropagation();
            await deleteCsv(startupId, csv.id).catch(() => {});
            setCsvList((prev) => prev.filter((c) => c.id !== csv.id));
        },
        [startupId],
    );

    const latestCsv = csvList[0];

    const onChatPanelDividerDrag = useCallback((dx: number) => {
        setChatPanelWidth((w) => {
            const containerW = splitRef.current?.clientWidth ?? 0;
            const max =
                containerW > 0 ? containerW - ANALYSIS_PANEL_MIN : Infinity;
            return Math.max(CHAT_PANEL_MIN, Math.min(max, w + dx));
        });
    }, []);

    return (
        <div className="flex flex-col h-full min-h-0 bg-white">
            {/* ── Unified header ─────────────────────────────────────── */}
            <header className="shrink-0 border-b border-black/[0.06] bg-white px-4 py-2.5 md:px-6">
                <div className="flex items-center gap-2 min-w-0">
                    <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-1 text-sm text-gray-500">
                        <button
                            type="button"
                            onClick={() => router.push("/startups")}
                            className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-black/[0.04] hover:text-gray-900"
                        >
                            Startups
                        </button>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                    </nav>

                    {editingName ? (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleRenameSave();
                            }}
                            className="flex items-center gap-1 min-w-0"
                        >
                            <input
                                ref={nameInputRef}
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                className="w-48 border-b border-gray-400 bg-transparent font-eb-garamond text-xl font-medium text-gray-950 outline-none"
                            />
                            <button type="submit" disabled={savingName} className="text-emerald-600">
                                <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingName(false);
                                    setNameInput((startup?.name as string) ?? "");
                                }}
                                className="text-gray-400"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </form>
                    ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                            {pageLoading ? (
                                <div className="h-4 w-36 rounded bg-gray-100 animate-pulse" />
                            ) : pageError ? (
                                <span className="text-sm text-red-500">{pageError}</span>
                            ) : (
                                <>
                                    <span className="truncate font-eb-garamond text-xl font-medium text-gray-950">
                                        {(startup?.name as string) ?? "Startup"}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setEditingName(true)}
                                        className="p-0.5 text-gray-300 hover:text-gray-600 shrink-0"
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                    <StatusPill result={startup?.lastScreeningResult ?? null} />
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex-1" />

                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setCsvMenuOpen((o) => !o)}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
                        >
                            <File className="h-3.5 w-3.5" />
                            {pageLoading ? (
                                <span className="hidden sm:inline h-3 w-16 rounded bg-gray-100 animate-pulse" />
                            ) : (
                                <span className="max-w-[100px] truncate hidden sm:inline">
                                    {latestCsv?.filename ?? "Cap table"}
                                </span>
                            )}
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                        </button>

                        {csvMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setCsvMenuOpen(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-gray-200 bg-white shadow-lg py-2">
                                    <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase">
                                        Cap-table files
                                    </p>
                                    {csvList.length === 0 ? (
                                        <p className="px-3 py-2 text-xs text-gray-500">
                                            No CSV uploaded
                                        </p>
                                    ) : (
                                        csvList.map((csv) => (
                                            <div
                                                key={csv.id}
                                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                                            >
                                                <File className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium truncate">
                                                        {csv.filename}
                                                    </p>
                                                    <p className="text-[10px] text-gray-400">
                                                        {formatDate(csv.uploadedAt)}
                                                        {csv.rosterPurpose &&
                                                            csv.rosterPurpose !== "cap_table" && (
                                                                <>
                                                                    {" · "}
                                                                    {csv.rosterPurpose.replace(
                                                                        "_",
                                                                        " ",
                                                                    )}
                                                                </>
                                                            )}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => void runScreen(csv)}
                                                    disabled={
                                                        screening ||
                                                        csv.parseStatus === "invalid"
                                                    }
                                                    className="text-[11px] text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-40 flex items-center gap-0.5"
                                                >
                                                    <RefreshCw className="h-2.5 w-2.5" />
                                                    Screen
                                                </button>
                                                <button
                                                    onClick={(e) =>
                                                        void handleDeleteCsv(e, csv)
                                                    }
                                                    className="text-gray-300 hover:text-red-500"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                    <div className="border-t mt-1 pt-1 px-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                            disabled={uploading}
                                            className="w-full flex items-center justify-center gap-1.5 text-xs py-2 hover:bg-gray-50 rounded-lg disabled:opacity-50"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            {uploading ? "Uploading…" : "Upload CSV"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleFileUpload(f);
                                e.target.value = "";
                            }}
                        />
                    </div>

                    <WatchFolderButton startupId={startupId} />
                    <StartupAuditMenu startupId={startupId} />
                </div>

                {uploadError && (
                    <p className="mt-1 text-xs text-red-600 pl-10">{uploadError}</p>
                )}
            </header>

            {/* ── Resizable chat · analysis split ───── */}
            <ScreeningDeltaBanner
                startupId={startupId}
                refreshKey={deltaRefreshKey}
            />
            {isMobile && (
                <div className="shrink-0 flex border-b border-gray-200 bg-gray-50 md:hidden">
                    <button
                        type="button"
                        onClick={() => setMobilePane("chat")}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            mobilePane === "chat"
                                ? "text-gray-900 border-b-2 border-gray-900 bg-white"
                                : "text-gray-500"
                        }`}
                    >
                        Chat
                    </button>
                    <button
                        type="button"
                        onClick={() => setMobilePane("analysis")}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            mobilePane === "analysis"
                                ? "text-gray-900 border-b-2 border-gray-900 bg-white"
                                : "text-gray-500"
                        }`}
                    >
                        Analysis
                    </button>
                </div>
            )}
            <div ref={splitRef} className="flex-1 min-h-0 flex flex-col md:flex-row">
                <section
                    style={isMobile ? undefined : { width: chatPanelWidth }}
                    className={`shrink-0 min-h-0 flex flex-col w-full md:w-auto flex-1 md:flex-none ${
                        isMobile && mobilePane !== "chat" ? "hidden" : ""
                    }`}
                >
                    <StartupChatPanel
                        messages={messages}
                        isResponseLoading={isResponseLoading}
                        handleChat={handleChat}
                        cancel={cancel}
                        onApprovalAnswer={(runId, approved) => void answerApproval(runId, approved)}
                        startupName={startup?.name}
                        startupId={startupId}
                    />
                </section>

                <div className="hidden md:contents">
                    <ResizeDivider onDrag={onChatPanelDividerDrag} />
                </div>

                <section
                    className={`flex-1 min-w-0 min-h-0 flex flex-col ${
                        isMobile && mobilePane !== "analysis" ? "hidden" : ""
                    }`}
                >
                    <div className="flex-1 min-h-0 flex flex-col">
                        <StartupAnalysisDock
                            screeningResult={displayResult}
                            startupId={startupId}
                            screening={screening || isScreeningActive}
                            activeCsv={activeCsvForView}
                            viewPurpose={viewPurpose}
                            onViewPurposeChange={setViewPurpose}
                            showCoInvestor={showCoInvestor}
                            showVendor={showVendor}
                            onCsvSaveAndRescreen={handleCsvSaveAndRescreen}
                            documentsRefreshKey={documentsRefreshKey}
                        />
                        <ScreeningFollowUpActions
                            startupId={startupId}
                            hasScreening={!!(startup?.lastScreeningResult ?? screeningResult)}
                            isChatLoading={isResponseLoading}
                            onRequestIcMemo={(message) => void handleChat(message)}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
