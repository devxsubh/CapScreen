"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  deleteRagDocument,
  listRagDocuments,
  type RagDocumentRecord,
  uploadRagDocument,
} from "@/lib/startupsApi";
import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

interface Props {
  startupId: string;
}

function statusLabel(status: RagDocumentRecord["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "processing") return "Processing…";
  return "Error";
}

export function RagDocumentsStrip({ startupId }: Props) {
  const [docs, setDocs] = useState<RagDocumentRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragEnabled, setRagEnabled] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/config`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ragEnabled?: boolean }) => setRagEnabled(d.ragEnabled ?? false))
      .catch(() => setRagEnabled(false));
  }, []);

  const refresh = useCallback(() => {
    listRagDocuments(startupId)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [startupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [docs, refresh]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await uploadRagDocument(startupId, file);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    try {
      await deleteRagDocument(startupId, docId);
      refresh();
    } catch {
      setError("Could not delete document");
    }
  }

  const readyCount = docs.filter((d) => d.status === "ready").length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        title="Upload PDFs, Word docs, or agreements for document Q&A in chat"
      >
        <FileText className="h-3.5 w-3.5" />
        Docs{readyCount > 0 ? ` (${readyCount})` : ""}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-800">RAG documents</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            Ask the assistant about uploaded agreements, UBO declarations, etc.
          </p>

          {ragEnabled === false && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 mb-2">
              <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800">
                Document search is disabled — <code className="font-mono">OPENAI_API_KEY</code> is not set on the server. Documents can be uploaded but won&apos;t be searchable in chat.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-600 mb-2">{error}</p>
          )}

          <ul className="max-h-36 overflow-y-auto space-y-1 mb-2">
            {docs.length === 0 && (
              <li className="text-[11px] text-gray-400 py-2 text-center">
                No documents yet
              </li>
            )}
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-1.5 text-[11px] text-gray-700"
              >
                <span className="truncate flex-1" title={doc.filename}>
                  {doc.filename}
                </span>
                <span
                  className={
                    doc.status === "ready"
                      ? "text-green-600"
                      : doc.status === "processing"
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  {statusLabel(doc.status)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(doc.id)}
                  className="text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Upload PDF, DOCX, or TXT
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.csv,application/pdf,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
