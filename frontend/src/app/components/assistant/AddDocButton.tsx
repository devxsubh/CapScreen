"use client";

import { useRef, useState } from "react";
import { PlusIcon, Upload, LayoutGridIcon, Loader2Icon } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadStandaloneDocument } from "@/app/lib/capScreenApi";
import {
    uploadRagDocument,
    type RagDocumentRecord,
} from "@/lib/startupsApi";
import type { AppDocument } from "../shared/types";

function ragDocToApp(doc: RagDocumentRecord): AppDocument {
    const ext = doc.filename.split(".").pop()?.toLowerCase() ?? "";
    const file_type =
        ext === "pdf" ? "pdf" : ext === "docx" || ext === "doc" ? "docx" : ext;
    return {
        id: doc.id,
        project_id: null,
        filename: doc.filename,
        file_type,
        storage_path: null,
        pdf_storage_path: null,
        size_bytes: doc.sizeBytes,
        page_count: null,
        structure_tree: null,
        status:
            doc.status === "ready"
                ? "ready"
                : doc.status === "processing"
                  ? "processing"
                  : "error",
        created_at: doc.uploadedAt,
    };
}

function isCsvFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
        name.endsWith(".csv") ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel"
    );
}

interface Props {
    onSelectDoc: (doc: AppDocument) => void;
    onSelectCsvFile?: (file: File) => void;
    onBrowseAll: () => void;
    selectedDocIds?: string[];
    attachmentCount?: number;
    /** When set, uploads go to startup RAG storage instead of standalone docs. */
    startupId?: string;
}

export function AddDocButton({
    onSelectDoc,
    onSelectCsvFile,
    onBrowseAll,
    selectedDocIds = [],
    attachmentCount,
    startupId,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const count = attachmentCount ?? selectedDocIds.length;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const csvFiles = files.filter(isCsvFile);
        const docFiles = files.filter((f) => !isCsvFile(f));

        csvFiles.forEach((f) => onSelectCsvFile?.(f));

        if (docFiles.length === 0) {
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        setUploading(true);
        try {
            const uploaded = await Promise.all(
                docFiles.map((f) =>
                    startupId
                        ? uploadRagDocument(startupId, f).then(ragDocToApp)
                        : uploadStandaloneDocument(f),
                ),
            );
            uploaded.forEach((doc) => onSelectDoc(doc));
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.csv,text/csv"
                multiple
                className="hidden"
                onChange={handleUpload}
            />
            <DropdownMenu onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={`flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm transition-colors cursor-pointer ${
                            count > 0
                                ? "text-blue-600 hover:bg-blue-50"
                                : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        } ${isOpen ? "bg-gray-100" : ""}`}
                        title="Add documents"
                        aria-label="Add documents"
                    >
                        <PlusIcon
                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-[135deg]" : ""}`}
                        />
                        <span className="hidden sm:inline">Documents</span>
                        {count > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium tabular-nums text-white">
                                {count}
                            </span>
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="w-44 z-50"
                    side="bottom"
                    align="start"
                >
                    <DropdownMenuItem
                        className="cursor-pointer"
                        disabled={uploading}
                        onSelect={(e) => {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }}
                    >
                        {uploading ? (
                            <Loader2Icon className="h-4 w-4 mr-2 animate-spin text-gray-400" />
                        ) : (
                            <Upload className="h-4 w-4 mr-2 text-gray-500" />
                        )}
                        <span className="text-sm">
                            {uploading ? "Uploading…" : "Upload files"}
                        </span>
                    </DropdownMenuItem>
                    {!startupId && (
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={onBrowseAll}
                        >
                            <LayoutGridIcon className="h-4 w-4 mr-2 text-gray-500" />
                            <span className="text-sm">Browse all</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
