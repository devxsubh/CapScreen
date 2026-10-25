"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/apiAuth";
import { getStartupGeneratedDocument } from "@/lib/startupsApi";
import { ChatMarkdown } from "./ChatMarkdown";
import { apiBase } from "@/lib/apiBase";

interface Props {
    documentId: string;
    startupId?: string | null;
    initialScrollTop?: number | null;
    onScrollChange?: (scrollTop: number) => void;
}

async function fetchDocumentContent(
    documentId: string,
    startupId?: string | null,
): Promise<string> {
    if (startupId) {
        const doc = await getStartupGeneratedDocument(startupId, documentId);
        return doc.content;
    }

    const base = apiBase();
    const resp = await fetch(`${base}/api/documents/${documentId}/view`, {
        headers: await getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { content?: string };
    return typeof data.content === "string" ? data.content : "";
}

export function StartupDocumentView({
    documentId,
    startupId,
    initialScrollTop,
    onScrollChange,
}: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setContent(null);

        (async () => {
            try {
                const text = await fetchDocumentContent(documentId, startupId);
                if (!cancelled) setContent(text);
            } catch {
                if (!cancelled) {
                    setError("Failed to load document.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [documentId, startupId]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || initialScrollTop == null) return;
        el.scrollTop = initialScrollTop;
    }, [initialScrollTop, content]);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    if (error || content == null) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
                {error ?? "Document unavailable."}
            </div>
        );
    }

    return (
        <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 bg-white px-5 py-5 sm:px-8 sm:py-6"
            onScroll={(e) => onScrollChange?.(e.currentTarget.scrollTop)}
        >
            <ChatMarkdown text={content} className="min-w-0" />
        </div>
    );
}
