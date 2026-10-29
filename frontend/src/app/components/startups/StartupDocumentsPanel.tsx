"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, Upload, X } from "lucide-react";
import { deleteDocument, getProject, uploadProjectDocument } from "@/app/lib/capScreenApi";
import { ProjectExplorer } from "@/app/components/projects/ProjectExplorer";
import { DocView } from "@/app/components/shared/DocView";
import { DocxView } from "@/app/components/shared/DocxView";
import { ResizeDivider } from "@/app/components/shared/ResizeDivider";
import type { AppDocument } from "@/app/components/shared/types";

type DocTab = { documentId: string; filename: string; scrollTop?: number };

const EXPLORER_MIN = 160;
const EXPLORER_DEFAULT = 240;

function isDocxTab(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ext === "docx" || ext === "doc";
}

/** The startup's documents: explorer on the left, tabbed viewer on the right. Lives in the workspace's analysis dock. */
export function StartupDocumentsPanel({ startupId, refreshKey = 0 }: { startupId: string; refreshKey?: number }) {
    const [documents, setDocuments] = useState<AppDocument[] | null>(null);
    const [projectName, setProjectName] = useState<string | undefined>();
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tabs, setTabs] = useState<DocTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [explorerWidth, setExplorerWidth] = useState(EXPLORER_DEFAULT);
    const [explorerCollapsed, setExplorerCollapsed] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reload when the startup changes or the assistant creates a document.
    useEffect(() => {
        let cancelled = false;
        getProject(startupId)
            .then((p) => {
                if (cancelled) return;
                setDocuments(p.documents ?? []);
                setProjectName(p.name);
                setLoadError(null);
            })
            .catch((e: Error) => {
                if (!cancelled) setLoadError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, [startupId, refreshKey]);

    const openTab = (doc: AppDocument) => {
        setTabs((prev) =>
            prev.some((t) => t.documentId === doc.id) ? prev : [...prev, { documentId: doc.id, filename: doc.filename }],
        );
        setActiveTabId(doc.id);
    };

    const closeTab = (docId: string) => {
        setTabs((prev) => {
            const next = prev.filter((t) => t.documentId !== docId);
            if (activeTabId === docId) {
                const idx = prev.findIndex((t) => t.documentId === docId);
                setActiveTabId((next[idx] ?? next[idx - 1])?.documentId ?? null);
            }
            return next;
        });
    };

    const uploadFiles = async (files: File[]) => {
        if (!files.length) return;
        setUploading(true);
        try {
            const uploaded = await Promise.all(files.map((f) => uploadProjectDocument(startupId, f)));
            setDocuments((prev) => [...uploaded, ...(prev ?? [])]);
        } catch (err) {
            setLoadError((err as Error).message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeleteDoc = async (docId: string) => {
        await deleteDocument(docId);
        setDocuments((prev) => (prev ?? []).filter((d) => d.id !== docId));
        closeTab(docId);
    };

    const onExplorerDividerDrag = useCallback((dx: number) => {
        setExplorerWidth((w) => Math.max(EXPLORER_MIN, w + dx));
    }, []);

    const activeTab = tabs.find((t) => t.documentId === activeTabId) ?? null;

    return (
        <div className="flex h-full min-h-0">
            {explorerCollapsed ? (
                <div className="shrink-0 border-r border-gray-200">
                    <div className="flex h-10 items-center justify-center border-b border-gray-200 px-1">
                        <button
                            type="button"
                            onClick={() => setExplorerCollapsed(false)}
                            title="Expand explorer"
                            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div
                        style={{ width: explorerWidth }}
                        className="flex shrink-0 flex-col border-r border-gray-200"
                        onDragOver={(e) => {
                            e.preventDefault();
                            // Only external file drags upload; internal moves carry this type.
                            if (!Array.from(e.dataTransfer.types).includes("application/capscreen-doc")) setDragOver(true);
                        }}
                        onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            void uploadFiles(Array.from(e.dataTransfer.files));
                        }}
                    >
                        <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 px-3">
                            <span className="text-xs text-gray-700">Explorer</span>
                            <div className="flex items-center gap-1">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.docx,.doc"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => void uploadFiles(Array.from(e.target.files ?? []))}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    title="Upload documents"
                                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                                >
                                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExplorerCollapsed(true)}
                                    title="Collapse explorer"
                                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className={`relative h-full flex-1 overflow-y-auto ${dragOver ? "bg-gray-50" : ""}`}>
                            {dragOver && (
                                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                                    <p className="text-xs font-medium text-gray-600">Drop to upload</p>
                                </div>
                            )}
                            {loadError ? (
                                <p className="px-3 py-3 text-xs text-red-600">{loadError}</p>
                            ) : documents === null ? (
                                <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents…
                                </div>
                            ) : (
                                <ProjectExplorer
                                    projectName={projectName}
                                    documents={documents}
                                    selectedDocId={activeTabId}
                                    onDocClick={openTab}
                                    onDeleteDoc={handleDeleteDoc}
                                />
                            )}
                        </div>
                    </div>
                    <ResizeDivider onDrag={onExplorerDividerDrag} />
                </>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-10 min-w-0 shrink-0 items-end overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {tabs.length === 0 ? (
                        <span className="self-center px-4 text-xs text-gray-700">Document viewer</span>
                    ) : (
                        tabs.map((tab) => {
                            const isActive = tab.documentId === activeTabId;
                            const ext = tab.filename.split(".").pop()?.toLowerCase();
                            const iconColor =
                                ext === "pdf" ? "text-red-500" : ext === "doc" || ext === "docx" ? "text-blue-500" : "text-gray-400";
                            return (
                                <div
                                    key={tab.documentId}
                                    onClick={() => setActiveTabId(tab.documentId)}
                                    className={`flex h-full max-w-[260px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-gray-200 px-3 transition-colors ${
                                        isActive ? "bg-gray-100" : "bg-white hover:bg-gray-50"
                                    }`}
                                >
                                    <FileText className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                                    <span className={`truncate text-xs ${isActive ? "font-medium text-gray-900" : "text-gray-500"}`}>
                                        {tab.filename}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closeTab(tab.documentId);
                                        }}
                                        aria-label={`Close ${tab.filename}`}
                                        className={`shrink-0 transition-colors ${isActive ? "text-gray-500 hover:text-gray-700" : "text-gray-300 hover:text-gray-600"}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {activeTab ? (
                        isDocxTab(activeTab.filename) ? (
                            <DocxView
                                key={activeTab.documentId}
                                documentId={activeTab.documentId}
                                initialScrollTop={activeTab.scrollTop ?? null}
                                onScrollChange={(top) =>
                                    setTabs((prev) =>
                                        prev.map((t) => (t.documentId === activeTab.documentId ? { ...t, scrollTop: top } : t)),
                                    )
                                }
                                rounded={false}
                                bordered={false}
                            />
                        ) : (
                            <DocView key={activeTab.documentId} doc={{ document_id: activeTab.documentId }} rounded={false} bordered={false} />
                        )
                    ) : (
                        <div className="flex h-full items-center justify-center bg-gray-100 px-8">
                            <div className="space-y-2 text-center">
                                <p className="font-serif text-xl text-gray-700">Click a document to open it here.</p>
                                <p className="font-serif text-base text-gray-500">
                                    Upload PDFs or Word files, or ask the assistant to draft an IC memo.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
