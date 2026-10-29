"use client";

import { useEffect, useRef, useState } from "react";
import { FolderSync, Loader2 } from "lucide-react";
import { useDesktop } from "@/lib/desktop";
import { desktopDataApi, type WatchFolder } from "@/lib/desktopDataApi";

/**
 * Link a data-room folder to this startup: new CSVs become cap-table uploads,
 * PDFs/DOCX go into document search. Desktop only.
 */
export function WatchFolderButton({ startupId }: { startupId: string }) {
    const [watch, setWatch] = useState<WatchFolder>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const bridge = useDesktop();

    useEffect(() => {
        if (!bridge) return;
        void desktopDataApi.watchFolder(startupId).then((r) => setWatch(r.watch)).catch(() => {});
    }, [startupId, bridge]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    if (!bridge) return null;

    const choose = async () => {
        setError(null);
        const folder = await bridge.pickFolder({ title: "Choose a data-room folder to watch" });
        if (!folder) return;
        setBusy(true);
        try {
            setWatch((await desktopDataApi.setWatchFolder(startupId, folder)).watch);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        setBusy(true);
        try {
            setWatch((await desktopDataApi.setWatchFolder(startupId, null)).watch);
            setOpen(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => (watch ? setOpen((o) => !o) : void choose())}
                disabled={busy}
                title={watch ? `Watching ${watch.path}` : "Watch a folder for new files"}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    watch ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
            >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSync className="h-3.5 w-3.5" />}
                {watch ? "Watching folder" : "Watch folder"}
            </button>
            {open && watch && (
                <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-xs space-y-2">
                    <div className="font-mono break-all text-gray-700">{watch.path}</div>
                    <div className="text-gray-500">
                        {watch.ingestedCount} file{watch.ingestedCount === 1 ? "" : "s"} imported
                        {watch.lastScanAt && ` · checked ${new Date(watch.lastScanAt).toLocaleTimeString()}`}
                    </div>
                    <p className="text-gray-500">
                        New <b>.csv</b> files are added as cap tables; <b>.pdf / .docx / .txt</b> go into document search.
                    </p>
                    {watch.lastError && <p className="text-amber-700">{watch.lastError}</p>}
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => void bridge.revealInFolder(watch.path)} className="rounded-lg bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] px-2 py-1 hover:bg-gray-50">
                            Open folder
                        </button>
                        <button type="button" onClick={() => void choose()} className="rounded-lg bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] px-2 py-1 hover:bg-gray-50">
                            Change…
                        </button>
                        <button type="button" onClick={() => void stop()} className="ml-auto rounded-md px-2 py-1 text-red-600 hover:bg-red-50">
                            Stop watching
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="absolute right-0 top-full mt-1 text-xs text-red-600 whitespace-nowrap">{error}</p>}
        </div>
    );
}
