/** Cards for documents the assistant created or offers to download. */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { apiBase } from "@/api/apiBase";

// ---------------------------------------------------------------------------
// Event block components
// ---------------------------------------------------------------------------

export function DocCreatedBlock({
    filename,
    showConnector,
    isStreaming,
}: {
    filename: string;
    showConnector?: boolean;
    isStreaming?: boolean;
}) {
    return (
        <div className="flex items-start text-sm font-serif text-gray-500 relative">
            {showConnector && (
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
            )}
            {isStreaming ? (
                <div className="mt-2 w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
            ) : (
                <div className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
            <div className="ml-2 min-w-0 flex-1 whitespace-normal break-words">
                <span className="font-medium">
                    {isStreaming ? "Creating" : "Created"}
                </span>{" "}
                <span>{isStreaming ? `${filename}...` : filename}</span>
            </div>
        </div>
    );
}

export function isStartupDocumentDownloadUrl(url: string): boolean {
    return /^\/api\/documents\/[^/]+\/download$/.test(url);
}

export function DocDownloadBlock({
    filename,
    download_url,
    onOpen,
    isReloading = false,
    versionNumber,
}: {
    filename: string;
    download_url: string;
    onOpen?: () => void;
    isReloading?: boolean;
    versionNumber?: number | null;
}) {
    const hasVersion =
        typeof versionNumber === "number" &&
        Number.isFinite(versionNumber) &&
        versionNumber > 0;
    const extMatch = filename.match(/\.(\w+)$/);
    const ext = extMatch ? extMatch[1].toUpperCase() : "FILE";
    const rawBasename = extMatch
        ? filename.slice(0, -extMatch[0].length)
        : filename;
    // Strip any legacy "[Edited V3]" suffix that may still be baked into
    // older saved download filenames — the version is surfaced as a
    // separate tag now.
    const basename = rawBasename.replace(/\s*\[Edited V\d+\]\s*$/, "").trim();
    // Only backend-relative URLs are accepted. The download fetch carries
    // the user's bearer token, so any absolute URL from tool output is
    // refused to keep the token from leaking off-origin.
    const API_BASE =
        apiBase();
    const normalizedUrl = (() => {
        const legacy = download_url.match(
            /^\/api\/startups\/[^/]+\/documents\/([^/]+)\/download$/,
        );
        if (legacy) return `/api/documents/${legacy[1]}/download`;
        return download_url;
    })();
    const isSafeHref = normalizedUrl.startsWith("/");
    const href = isSafeHref ? `${API_BASE}${normalizedUrl}` : null;
    const [busy, setBusy] = useState(false);

    const handleDownload = async (e?: {
        stopPropagation?: () => void;
        preventDefault?: () => void;
    }) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        if (busy || isReloading || !href) return;
        setBusy(true);
        try {
            const resp = await fetch(href);
            if (!resp.ok) {
                throw new Error(
                    resp.status === 404
                        ? "Document not found. Try asking the assistant to regenerate it."
                        : `Download failed (HTTP ${resp.status})`,
                );
            }
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            console.error("[DocDownloadBlock]", err);
        } finally {
            setBusy(false);
        }
    };

    const spinning = busy || isReloading;

    const body = (
        <div className="flex items-center gap-3 px-4 py-3 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                    <p className="text-base font-serif text-gray-900 text-wrap">
                        {basename}
                    </p>
                    {hasVersion && (
                        <span className="shrink-0 inline-flex items-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            V{versionNumber}
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{ext}</p>
            </div>
        </div>
    );

    const downloadIcon = spinning ? (
        <div
            aria-disabled
            className="shrink-0 flex items-center border-l border-gray-200 px-6 bg-white text-gray-400 cursor-not-allowed"
        >
            <Loader2 size={13} className="animate-spin" />
        </div>
    ) : (
        <button
            type="button"
            onClick={handleDownload}
            className="shrink-0 flex items-center border-l border-gray-200 px-6 bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
        >
            <Download size={13} />
        </button>
    );

    // Only show the download button when there is an actual URL to fetch.
    const canDownload = !!href;

    if (onOpen) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex items-stretch flex-1 min-w-0 text-left hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    {body}
                </button>
                {canDownload && downloadIcon}
            </div>
        );
    }

    if (spinning) {
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                {body}
                {canDownload && downloadIcon}
            </div>
        );
    }

    if (!canDownload) {
        // No download URL and no open handler — render as a non-interactive card.
        return (
            <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
                {body}
            </div>
        );
    }

    return (
        <div className="flex items-stretch border border-gray-200 rounded-lg overflow-hidden w-full font-sans bg-gray-50">
            <button
                type="button"
                onClick={handleDownload}
                className="flex items-stretch flex-1 min-w-0 text-left hover:bg-gray-100 transition-colors cursor-pointer"
            >
                {body}
            </button>
            {downloadIcon}
        </div>
    );
}
