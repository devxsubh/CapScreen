"use client";

import { useCallback, useRef, useState } from "react";
import { aiApi } from "@/lib/aiControlCenterApi";
import { desktop } from "@/lib/desktop";

export type Download = {
    model: string;
    percent: number | null;
    /** Plain-language phase ("Downloading", "Checking the download…"). */
    status: string;
    /** "1.2 of 2.5 GB" once Ollama reports sizes. */
    progress: string | null;
};

export type ModelDownloader = {
    current: Download | null;
    error: { model: string; message: string } | null;
    /** Resolves true when the model finished downloading. */
    start: (model: string) => Promise<boolean>;
    cancel: () => void;
    clearError: () => void;
};

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

/** Ollama's raw pull status ("pulling 6a0746a1ec1a", "verifying sha256 digest") in plain words. */
function phase(status: string): string {
    if (/^pulling manifest/i.test(status)) return "Preparing…";
    if (/^pulling /i.test(status)) return "Downloading";
    if (/^verifying/i.test(status)) return "Checking the download…";
    if (/^(writing|removing|success)/i.test(status)) return "Finishing up…";
    return status;
}

export function openExternal(url: string) {
    const bridge = desktop();
    if (bridge) void bridge.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

/** One Ollama download at a time, shared by every part of the AI Control Center. */
export function useModelDownload(onFinished: () => void): ModelDownloader {
    const [current, setCurrent] = useState<Download | null>(null);
    const [error, setError] = useState<ModelDownloader["error"]>(null);
    const abortRef = useRef<AbortController | null>(null);

    const start = useCallback(
        async (model: string) => {
            if (abortRef.current) return false;
            const abort = new AbortController();
            abortRef.current = abort;
            setError(null);
            setCurrent({ model, percent: null, status: "Starting…", progress: null });
            let done = false;
            let failure: string | null = null;
            try {
                await aiApi.pull(
                    model,
                    (e) => {
                        if (e.type === "progress") {
                            setCurrent((prev) => ({
                                model,
                                status: phase(e.status),
                                percent: e.percent ?? prev?.percent ?? null,
                                progress:
                                    e.total && e.completed != null
                                        ? `${gb(e.completed)} of ${gb(e.total)} GB`
                                        : (prev?.progress ?? null),
                            }));
                        } else if (e.type === "done") {
                            done = true;
                        } else {
                            failure = e.detail;
                        }
                    },
                    abort.signal,
                );
                if (!done && !failure && !abort.signal.aborted) {
                    failure = "The download stopped before it finished. Try again — it picks up where it left off.";
                }
            } catch (e) {
                if (!abort.signal.aborted) {
                    failure =
                        e instanceof TypeError
                            ? "Lost the connection to CapScreen's engine during the download. Try again — it picks up where it left off."
                            : (e as Error).message;
                }
            } finally {
                abortRef.current = null;
                setCurrent(null);
                if (failure) setError({ model, message: failure });
                onFinished();
            }
            return done;
        },
        [onFinished],
    );

    const cancel = useCallback(() => abortRef.current?.abort(), []);
    const clearError = useCallback(() => setError(null), []);

    return { current, error, start, cancel, clearError };
}
