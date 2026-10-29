"use client";

import { useRef, useState } from "react";
import { Upload, LayoutGridIcon, Loader2Icon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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

interface DocActionsProps {
    onSelectDoc: (doc: AppDocument) => void;
    onSelectCsvFile?: (file: File) => void;
    onBrowseAll: () => void;
    startupId?: string;
}

/** File upload for the chat composer: hidden input, menu items, and a way to open the picker. */
export function useAddDocActions({
    onSelectDoc,
    onSelectCsvFile,
    onBrowseAll,
    startupId,
}: DocActionsProps) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const fileInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.csv,text/csv"
            multiple
            className="hidden"
            onChange={handleUpload}
        />
    );

    const menuItems = (
        <>
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
                <span className="text-sm">{uploading ? "Uploading…" : "Upload files"}</span>
            </DropdownMenuItem>
            {!startupId && (
                <DropdownMenuItem className="cursor-pointer" onClick={onBrowseAll}>
                    <LayoutGridIcon className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="text-sm">Browse all</span>
                </DropdownMenuItem>
            )}
        </>
    );

    return { uploading, fileInput, menuItems, openFilePicker: () => fileInputRef.current?.click() };
}
