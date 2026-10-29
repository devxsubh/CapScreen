"use client";

import { useEffect, useMemo, useRef } from "react";
import { CapScreenIcon } from "@/components/chat/capscreen-icon";
import { useFetchDocxBytes } from "@/app/hooks/useFetchDocxBytes";
import {
    clearDocxQuoteHighlights,
    highlightDocxQuote,
} from "./highlightDocxQuote";
import type { CitationQuote } from "./types";

interface Props {
    documentId: string;
    versionId?: string | null;
    /**
     * Called once the document has been rendered to the DOM. Handy for
     * scrolling to a particular tracked change after a re-render.
     */
    onReady?: () => void;
    /**
     * Forces a byte re-fetch when it changes, even if documentId/versionId
     * are stable. Used after accept/reject: the backend overwrites bytes at
     * the same storage path (no new version row), so the hook has no other
     * signal that the file changed.
     */
    refetchKey?: number;
    /**
     * Citation quotes to highlight in the rendered output. The first match
     * is scrolled into view. Page numbers are ignored — DOCX has no explicit
     * pagination the renderer can match against.
     */
    quotes?: CitationQuote[];
    /**
     * Warning banner copy rendered in the top-left of the viewer. Used
     * for non-blocking errors (e.g. "Accept failed — reverted").
     */
    warning?: string | null;
    /**
     * Called when the user dismisses the warning banner.
     */
    onWarningDismiss?: () => void;
    /**
     * Scroll position to restore after the first render — used by parents
     * that track per-tab scroll and want to re-enter at the same spot.
     * Null/undefined means "no override" (preserve the pre-render scroll).
     */
    initialScrollTop?: number | null;
    /**
     * Fires on scroll (throttled by rAF) so the parent can persist the
     * current scrollTop against its tab state.
     */
    onScrollChange?: (scrollTop: number) => void;
    rounded?: boolean;
    bordered?: boolean;
}

/**
 * Renders a .docx in the browser using `docx-preview`. Tracked changes
 * (`w:ins` / `w:del`) show up automatically with coloured strike/underline
 * styling. Scroll position is preserved across re-renders so Accept/Reject
 * doesn't jump the user back to the top.
 */
export function DocxView({
    documentId,
    versionId,
    onReady,
    refetchKey,
    quotes,
    warning,
    onWarningDismiss,
    initialScrollTop,
    onScrollChange,
    rounded = true,
    bordered = true,
}: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastScrollTopRef = useRef(0);
    const renderKeyRef = useRef(0);
    // Ref-stabilize onReady so the render effect only
    // re-fires when `bytes` actually change. Without this, any parent
    // re-render (e.g. clicking a new highlight) creates a new onReady
    // identity, triggers a full re-render, and snaps scroll back to top.
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady; // eslint-disable-line react-hooks/refs
    const quotesRef = useRef(quotes);
    quotesRef.current = quotes; // eslint-disable-line react-hooks/refs
    const initialScrollTopRef = useRef(initialScrollTop ?? null);
    initialScrollTopRef.current = initialScrollTop ?? null; // eslint-disable-line react-hooks/refs
    const onScrollChangeRef = useRef(onScrollChange);
    onScrollChangeRef.current = onScrollChange; // eslint-disable-line react-hooks/refs

    // Stable key for the quote list so the re-highlight effect re-fires
    // only when the actual text/order of quotes changes.
    const quoteKey = useMemo(
        () => (quotes ?? []).map((q) => q.quote).join("||"),
        [quotes],
    );

    const { bytes, loading, error } = useFetchDocxBytes(
        documentId,
        versionId,
        refetchKey,
    );

    /**
     * Highlight every quote in `list` inside the rendered DOM and scroll
     * the first match into view. Returns true if any match was found.
     */
    const applyQuoteHighlights = (
        containerEl: HTMLElement,
        scrollEl: HTMLElement,
        list: CitationQuote[] | undefined,
    ): boolean => {
        clearDocxQuoteHighlights(containerEl);
        if (!list || list.length === 0) return false;

        let firstMatch: HTMLElement | null = null;
        for (const q of list) {
            const match = highlightDocxQuote(containerEl, q.quote);
            if (match && !firstMatch) firstMatch = match;
        }
        if (!firstMatch) return false;

        const scrollRect = scrollEl.getBoundingClientRect();
        const targetRect = firstMatch.getBoundingClientRect();
        const offset =
            targetRect.top -
            scrollRect.top +
            scrollEl.scrollTop -
            scrollEl.clientHeight / 2 +
            targetRect.height / 2;
        scrollEl.scrollTo({
            top: Math.max(0, offset),
            behavior: "instant" as ScrollBehavior,
        });
        return true;
    };

    /**
     * docx-preview renders pages at their natural Word page width (e.g.
     * ~816px for US Letter). When the side-panel is narrower than that,
     * the page overflows horizontally. Apply CSS `zoom` on each
     * section.docx so the document shrinks to fit — `zoom` (unlike
     * `transform: scale`) also shrinks the layout box, so the scroll
     * container's scrollHeight adapts. We zoom each page rather than the
     * wrapper because docx-preview injects flex styles on `.docx-wrapper`
     * that can interfere with wrapper-level zoom.
     */
    const applyDocxScale = () => {
        const containerEl = containerRef.current;
        const scrollEl = scrollRef.current;
        if (!containerEl || !scrollEl) return;
        const wrapper = containerEl.querySelector<HTMLElement>(".docx-wrapper");
        if (!wrapper) return;
        const sections = Array.from(
            wrapper.querySelectorAll<HTMLElement>("section.docx"),
        );
        if (sections.length === 0) return;
        // Reset zoom on every page before measuring so offsetWidth reports
        // each page's natural width (pages can have different widths — e.g.
        // mixed portrait/landscape sections).
        sections.forEach((s) => {
            s.style.zoom = "1";
        });
        // Use the scroll container's content box (clientWidth - padding)
        // as the available width.
        const styles = window.getComputedStyle(scrollEl);
        const padX =
            (parseFloat(styles.paddingLeft) || 0) +
            (parseFloat(styles.paddingRight) || 0);
        const available = scrollEl.clientWidth - padX;
        if (available <= 0) return;
        // Scale each page independently against its own natural width so
        // landscape/custom-size pages still fit without distorting the
        // page dividers.
        sections.forEach((s) => {
            const w = s.offsetWidth;
            if (!w) return;
            const scale = Math.min(1, available / w);
            s.style.zoom = String(scale);
        });
    };

    // Observe the scroll container (which tracks the side panel's width)
    // and re-scale whenever it resizes. Also observe the docx container so
    // we re-scale once docx-preview finishes inserting pages.
    useEffect(() => {
        const scrollEl = scrollRef.current;
        const containerEl = containerRef.current;
        if (!scrollEl || !containerEl) return;
        let raf = 0;
        const schedule = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => applyDocxScale());
        };
        const ro = new ResizeObserver(schedule);
        ro.observe(scrollEl);
        ro.observe(containerEl);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!bytes || !containerRef.current || !scrollRef.current) return;

        const scrollEl = scrollRef.current;
        const containerEl = containerRef.current;

        console.log("[DocxView] render effect fired", {
            documentId,
            versionId,
            refetchKey,
            bytesLen: bytes.byteLength,
        });

        // Remember scroll position across re-renders so Accept/Reject stays put.
        lastScrollTopRef.current = scrollEl.scrollTop;
        const thisRender = ++renderKeyRef.current;

        (async () => {
            try {
                const { renderAsync } = await import("docx-preview");
                if (cancelled) return;
                containerEl.innerHTML = "";
                await renderAsync(bytes, containerEl, undefined, {
                    inWrapper: true,
                    ignoreWidth: false,
                    ignoreHeight: false,
                    renderChanges: true,
                    experimental: true,
                });
                if (cancelled) return;
                // Scale to fit before scrolling so offsets are computed
                // against the post-zoom layout.
                applyDocxScale();
                requestAnimationFrame(() => {
                    if (
                        !scrollRef.current ||
                        thisRender !== renderKeyRef.current
                    )
                        return;
                    const pendingQuotes = quotesRef.current;
                    const pendingInitialScroll = initialScrollTopRef.current;
                    if (
                        pendingQuotes &&
                        applyQuoteHighlights(
                            containerEl,
                            scrollRef.current,
                            pendingQuotes,
                        )
                    ) {
                        // scrolled inside applyQuoteHighlights
                    } else if (typeof pendingInitialScroll === "number") {
                        scrollRef.current.scrollTop = pendingInitialScroll;
                    } else {
                        scrollRef.current.scrollTop = lastScrollTopRef.current;
                    }
                    onReadyRef.current?.();
                });
            } catch (e) {
                console.error("docx-preview render failed", e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [bytes]);

    // Re-apply quote highlights when the quote list changes without a full
    // re-render (e.g. clicking a different citation on the same doc).
    useEffect(() => {
        if (!containerRef.current || !scrollRef.current) return;
        applyQuoteHighlights(
            containerRef.current,
            scrollRef.current,
            quotesRef.current,
        );
    }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fire onScrollChange (rAF-throttled) so parents can persist scroll
    // per-tab. We still maintain lastScrollTopRef locally for same-mount
    // re-renders (Accept/Reject preserving scroll within one view).
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let scheduled = false;
        const onScroll = () => {
            lastScrollTopRef.current = el.scrollTop;
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                onScrollChangeRef.current?.(el.scrollTop);
            });
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div
            className={`relative flex flex-col flex-1 overflow-hidden ${bordered ? "border border-gray-200" : ""} ${rounded ? "rounded-xl" : ""}`}
        >
            {warning && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 shadow-sm">
                    <span>{warning}</span>
                    <button
                        type="button"
                        onClick={() => onWarningDismiss?.()}
                        className="text-amber-600 hover:text-amber-900"
                        aria-label="Dismiss warning"
                    >
                        ×
                    </button>
                </div>
            )}
            <div
                ref={scrollRef}
                className="flex-1 overflow-auto bg-gray-100 px-5 pt-5 pb-3 docx-view-scroll"
                data-document-id={documentId}
                data-version-id={versionId ?? ""}
            >
                {loading && !bytes && (
                    <div className="flex h-full items-center justify-center">
                        <CapScreenIcon spin brand size={28} />
                    </div>
                )}
                {error && (
                    <div className="flex h-full items-center justify-center">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                )}
                <div ref={containerRef} className="docx-view-container" />
            </div>
        </div>
    );
}
