"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, File, FolderOpen, Trash2 } from "lucide-react";
import type { AppDocument } from "@/app/components/shared/types";

interface Props {
    projectName?: string | null;
    documents: AppDocument[];
    selectedDocId?: string | null;
    onDocClick: (doc: AppDocument) => void;
    onDeleteDoc?: (docId: string) => Promise<void>;
}

function DocIcon({ fileType }: { fileType: string | null }) {
    if (fileType === "pdf")
        return <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    if (fileType === "docx" || fileType === "doc")
        return <File className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    return <File className="h-3.5 w-3.5 text-gray-400 shrink-0" />;
}

/** The startup's documents. Rows can be dragged into the chat to attach them. */
export function ProjectExplorer({
    projectName,
    documents,
    selectedDocId,
    onDocClick,
    onDeleteDoc,
}: Props) {
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Close context menu on outside click
    useEffect(() => {
        if (!contextMenu) return;
        function handle(e: MouseEvent) {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [contextMenu]);

    return (
        <ul className="py-1">
            {projectName && (
                <li className="flex items-center gap-2 px-2 py-1.5 select-none">
                    <FolderOpen className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500 truncate">{projectName}</span>
                </li>
            )}

            {documents.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                return (
                    <li
                        key={doc.id}
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData("application/capscreen-doc", doc.id);
                            e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onDocClick(doc)}
                        onContextMenu={(e) => {
                            if (!onDeleteDoc) return;
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, docId: doc.id });
                        }}
                        className={`flex items-center gap-2 py-1.5 pr-4 pl-6 rounded-sm cursor-pointer select-none transition-colors ${
                            isSelected ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                    >
                        <DocIcon fileType={doc.file_type} />
                        <span className="text-xs truncate">{doc.filename}</span>
                    </li>
                );
            })}

            {documents.length === 0 && (
                <li className="px-4 py-2 text-xs text-gray-400">No documents in this project.</li>
            )}

            {contextMenu && onDeleteDoc && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 w-44 rounded-lg border border-gray-100 bg-white shadow-lg overflow-hidden text-xs"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                        onClick={() => {
                            void onDeleteDoc(contextMenu.docId);
                            setContextMenu(null);
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        Delete file
                    </button>
                </div>
            )}
        </ul>
    );
}
