"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Check,
    ChevronRight,
    FileSpreadsheet,
    Library,
    Upload,
    X,
} from "lucide-react";
import { VersionChip } from "@/app/components/shared/VersionChip";
import {
    analyzeCsv,
    createStartup,
    saveCsv,
    screenStartup,
} from "@/lib/startupsApi";
import type { CsvIngestAnalysis } from "@/lib/screenerTypes";
import { CsvIngestReview } from "@/app/components/startups/CsvIngestReview";
import {
    DEFAULT_SCREENING_PROMPT,
    setScreenerInitialPrompt,
} from "@/lib/screenerInitialPrompt";
import { AssistantWorkflowModal } from "@/app/components/assistant/AssistantWorkflowModal";
import type { AppWorkflow } from "@/app/components/shared/types";

type AnalysisMode = "default" | "custom" | "workflow";

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
    initialCsv?: { filename: string; content: string } | null;
}

function workflowToPrompt(wf: AppWorkflow): string {
    const body = (wf.prompt_md ?? "")
        .replace(/^#+\s+/gm, "")
        .replace(/\*\*/g, "")
        .trim();
    const excerpt = body.length > 600 ? `${body.slice(0, 600)}…` : body;
    return `Follow the "${wf.title}" workflow for this cap-table screening.\n\n${excerpt}`;
}

function formatToday() {
    return new Date().toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

export function NewStartupModal({ open, onClose, onCreated, initialCsv }: Props) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [reference, setReference] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState<
        "idle" | "creating" | "uploading" | "screening"
    >("idle");
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("default");
    const [customPrompt, setCustomPrompt] = useState("");
    const [selectedWorkflow, setSelectedWorkflow] =
        useState<AppWorkflow | null>(null);
    const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
    const [csvAnalysis, setCsvAnalysis] = useState<CsvIngestAnalysis | null>(
        null,
    );
    const [analyzingCsv, setAnalyzingCsv] = useState(false);
    const [confirmMapping, setConfirmMapping] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        if (!initialCsv?.content?.trim()) return;

        const blob = new Blob([initialCsv.content], { type: "text/csv" });
        const imported = new File([blob], initialCsv.filename, {
            type: "text/csv",
        });
        setFile(imported);
        setError("");

        const baseName = initialCsv.filename.replace(/\.csv$/i, "").trim();
        if (baseName) {
            setName((prev) => prev.trim() || baseName);
        }
    }, [open, initialCsv]);

    useEffect(() => {
        if (!open) return;
        if (!file) {
            setCsvAnalysis(null);
            setConfirmMapping(false);
            return;
        }

        let cancelled = false;
        setAnalyzingCsv(true);
        setCsvAnalysis(null);
        setConfirmMapping(false);

        void file
            .text()
            .then((content) => {
                if (cancelled) return;
                return analyzeCsv(file.name, content).then((result) => {
                    if (!cancelled) {
                        setCsvAnalysis(result);
                        setConfirmMapping(result.parseStatus === "valid");
                    }
                });
            })
            .catch(() => {
                if (!cancelled) setCsvAnalysis(null);
            })
            .finally(() => {
                if (!cancelled) setAnalyzingCsv(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, file]);

    if (!open) return null;

    function reset() {
        setName("");
        setReference("");
        setFile(null);
        setDragOver(false);
        setError("");
        setStep("idle");
        setAnalysisMode("default");
        setCustomPrompt("");
        setSelectedWorkflow(null);
        setCsvAnalysis(null);
        setAnalyzingCsv(false);
        setConfirmMapping(false);
    }

    function selectAnalysisMode(mode: AnalysisMode) {
        setAnalysisMode(mode);
        if (mode === "workflow" && !selectedWorkflow && !loading) {
            setWorkflowModalOpen(true);
        }
    }

    function handleClose() {
        if (loading) return;
        reset();
        onClose();
    }

    function acceptFile(f: File | undefined) {
        if (!f) return;
        if (!f.name.toLowerCase().endsWith(".csv")) {
            setError("Cap table must be a .csv file.");
            return;
        }
        setFile(f);
        setError("");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        acceptFile(e.target.files?.[0]);
        e.target.value = "";
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        if (loading) return;
        acceptFile(e.dataTransfer.files[0]);
    }

    function resolveInitialPrompt(): string {
        if (analysisMode === "custom" && customPrompt.trim()) {
            return customPrompt.trim();
        }
        if (analysisMode === "workflow" && selectedWorkflow) {
            return workflowToPrompt(selectedWorkflow);
        }
        return DEFAULT_SCREENING_PROMPT;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Startup name is required.");
            return;
        }
        if (!file) {
            setError("Upload a cap-table CSV to continue.");
            return;
        }
        if (analysisMode === "custom" && !customPrompt.trim()) {
            setError("Enter a custom prompt or switch to Default / Workflow.");
            return;
        }
        if (analysisMode === "workflow" && !selectedWorkflow) {
            setError("Select a workflow or switch to Default / Custom prompt.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            setStep("creating");
            const label = reference.trim();
            const startup = await createStartup(
                label ? `${trimmed} (${label})` : trimmed,
            );

            setStep("uploading");
            const content = await file.text();
            const csv = await saveCsv(
                startup.id,
                file.name,
                content,
                confirmMapping || csvAnalysis?.parseStatus === "valid",
            );

            if (csv.parseStatus === "invalid") {
                throw new Error(
                    csvAnalysis?.userMessage ||
                        csv.parseErrors
                            .map((err) => `Row ${err.row}: ${err.message}`)
                            .join("; ") ||
                        "CSV has parse errors — fix and re-upload.",
                );
            }
            if (csv.parseStatus === "needs_review") {
                throw new Error(
                    "Confirm the detected column mapping before screening.",
                );
            }

            setStep("screening");
            await screenStartup(startup.id, { csvId: csv.id });

            setScreenerInitialPrompt(startup.id, resolveInitialPrompt());

            reset();
            onClose();
            onCreated?.();
            router.push(`/startups/${startup.id}?summarize=1`);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to create startup",
            );
            setStep("idle");
        } finally {
            setLoading(false);
        }
    }

    const stepLabel =
        step === "creating"
            ? "Creating startup…"
            : step === "uploading"
              ? "Uploading cap table…"
              : step === "screening"
                ? "Running sanctions screen…"
                : null;

    return (
        <>
            <div
                className="fixed inset-0 z-101 flex items-center justify-center bg-black/20 backdrop-blur-xs p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget && !loading) handleClose();
                }}
            >
                <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col h-[min(600px,90vh)]">
                    <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span>Startups</span>
                            <span>›</span>
                            <span>New startup</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={loading}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <form
                        onSubmit={(e) => void handleSubmit(e)}
                        className="flex flex-col flex-1 min-h-0"
                    >
                        <div className="px-6 pt-3 flex-1 flex flex-col min-h-0 overflow-y-auto">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Startup name"
                                disabled={loading}
                                className="w-full text-2xl font-serif text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent disabled:opacity-60"
                                autoFocus
                            />

                            <input
                                type="text"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder="Add a deal reference..."
                                disabled={loading}
                                className="mt-1.5 w-full text-sm text-gray-500 placeholder-gray-300 focus:outline-none bg-transparent disabled:opacity-60"
                            />

                            <div className="mt-4 space-y-2 shrink-0">
                                <p className="text-xs font-medium text-gray-700">
                                    Analysis
                                </p>
                                <div className="rounded-sm border border-gray-100 overflow-hidden">
                                    <div className="flex items-center gap-5 px-2 py-2 border-b border-gray-100">
                                        {(
                                            [
                                                ["default", "Default"],
                                                ["custom", "Custom"],
                                                ["workflow", "Workflow"],
                                            ] as const
                                        ).map(([mode, label]) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                disabled={loading}
                                                onClick={() =>
                                                    selectAnalysisMode(mode)
                                                }
                                                className={`text-xs transition-colors disabled:opacity-60 ${
                                                    analysisMode === mode
                                                        ? "font-medium text-gray-800"
                                                        : "text-gray-500 hover:text-gray-700"
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {analysisMode === "custom" && (
                                        <div className="px-2 py-2 border-b border-gray-50">
                                            <textarea
                                                value={customPrompt}
                                                onChange={(e) =>
                                                    setCustomPrompt(
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={loading}
                                                rows={2}
                                                placeholder="Instructions for the first summary…"
                                                className="w-full text-sm text-gray-800 placeholder-gray-400 bg-transparent resize-none focus:outline-none disabled:opacity-60"
                                            />
                                        </div>
                                    )}

                                    {analysisMode === "workflow" && (
                                        <div className="flex items-center gap-2 px-2 py-2 text-xs">
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() =>
                                                    setWorkflowModalOpen(true)
                                                }
                                                className="flex flex-1 items-center gap-2 min-w-0 text-left hover:text-gray-900 transition-colors disabled:opacity-60"
                                            >
                                                <Library className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                                <span className="flex-1 truncate text-gray-700">
                                                    {selectedWorkflow?.title ??
                                                        "Choose workflow"}
                                                </span>
                                                <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                                            </button>
                                            {!loading && selectedWorkflow && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedWorkflow(
                                                            null,
                                                        )
                                                    }
                                                    className="text-gray-400 hover:text-gray-600 shrink-0"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 flex-1 flex flex-col min-h-[200px] space-y-2 pb-5">
                                <p className="text-xs font-medium text-gray-700 shrink-0">
                                    Cap table
                                </p>

                                <div className="flex-1 flex flex-col rounded-sm border border-gray-100 overflow-hidden min-h-0">
                                    <div className="flex items-center justify-between px-2 py-2 shrink-0 border-b border-gray-50">
                                        <p className="text-xs font-medium text-gray-400">
                                            {file ? "1 file" : "CSV upload"}
                                        </p>
                                        {file && !loading && (
                                            <button
                                                type="button"
                                                onClick={() => setFile(null)}
                                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>

                                    {file ? (
                                        <div className="flex items-center gap-2 px-2 py-2.5 text-xs text-left bg-gray-50">
                                            <span className="shrink-0 h-3.5 w-3.5 rounded border bg-gray-900 border-gray-900 flex items-center justify-center">
                                                <Check className="h-2.5 w-2.5 text-white" />
                                            </span>
                                            <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                            <span className="flex-1 min-w-0 truncate text-gray-900">
                                                {file.name}
                                            </span>
                                            <span className="shrink-0 text-gray-300 hidden sm:inline">
                                                {formatFileSize(file.size)}
                                            </span>
                                            <VersionChip n={1} />
                                            <span className="shrink-0 text-gray-300">
                                                {formatToday()}
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={loading}
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (!loading) setDragOver(true);
                                            }}
                                            onDragLeave={() =>
                                                setDragOver(false)
                                            }
                                            onDrop={handleDrop}
                                            className={`flex-1 flex flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors disabled:opacity-60 ${
                                                dragOver
                                                    ? "bg-gray-50"
                                                    : "hover:bg-gray-50/80"
                                            }`}
                                        >
                                            <Upload className="h-5 w-5 text-gray-300" />
                                            <span className="text-sm text-gray-500">
                                                Drop a cap-table CSV here, or{" "}
                                                <span className="text-gray-700 underline underline-offset-2">
                                                    browse
                                                </span>
                                            </span>
                                            <span className="text-[11px] text-gray-400 leading-relaxed">
                                                Cap tables, entity lists, or
                                                other CSVs — we auto-detect the
                                                format
                                            </span>
                                        </button>
                                    )}
                                </div>

                                {(file || analyzingCsv) && (
                                    <CsvIngestReview
                                        analysis={csvAnalysis}
                                        analyzing={analyzingCsv}
                                        confirmChecked={confirmMapping}
                                        onConfirmChange={setConfirmMapping}
                                    />
                                )}
                            </div>

                            {error && (
                                <p className="mt-auto -mt-2 mb-3 text-sm text-red-500 shrink-0">
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    disabled={loading}
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-60"
                                >
                                    <Upload className="h-3.5 w-3.5" />
                                    Upload CSV
                                    {file ? " (1)" : ""}
                                </button>
                                {stepLabel && (
                                    <span className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 shrink-0" />
                                        {stepLabel}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={loading}
                                    className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={
                                        !name.trim() ||
                                        !file ||
                                        loading ||
                                        analyzingCsv ||
                                        (csvAnalysis !== null &&
                                            !csvAnalysis.canScreen) ||
                                        (csvAnalysis?.parseStatus ===
                                            "needs_review" &&
                                            !confirmMapping)
                                    }
                                    className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
                                >
                                    {loading ? "Creating…" : "Create startup"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <AssistantWorkflowModal
                open={workflowModalOpen}
                onClose={() => setWorkflowModalOpen(false)}
                onSelect={(wf) => {
                    setSelectedWorkflow(wf);
                    setAnalysisMode("workflow");
                }}
                filterWorkflows={(w) => w.type === "assistant"}
            />
        </>
    );
}
