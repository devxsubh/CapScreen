"use client";

import { useState } from "react";
import { Check, Download, ExternalLink, Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi, OLLAMA_DOWNLOAD_URL, type CatalogModel, type LocalState } from "@/lib/aiControlCenterApi";
import { openExternal, type ModelDownloader } from "./useModelDownload";

const EMBED_MODEL = "nomic-embed-text";
const DISK_HEADROOM_GB = 2;

const FIT_NOTE: Record<CatalogModel["fit"], string> = {
    great: "Runs well",
    ok: "Fits",
    tight: "Tight — slow",
    "too-large": "Too large",
};

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children?: React.ReactNode }) {
    return (
        <li className="flex gap-3">
            <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    done ? "bg-emerald-600 text-white" : active ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                }`}
            >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <div className="min-w-0 flex-1 pb-5">
                <h4 className={`text-sm font-medium ${active || done ? "text-gray-900" : "text-gray-400"}`}>{title}</h4>
                {active && <div className="mt-2">{children}</div>}
            </div>
        </li>
    );
}

export function LocalSetup({
    local,
    download,
    onLocalChanged,
    onDone,
    onUseCloud,
}: {
    local: LocalState | null;
    download: ModelDownloader;
    onLocalChanged: () => void;
    onDone: (message: string) => void;
    onUseCloud: () => void;
}) {
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [withSearch, setWithSearch] = useState(true);
    const [finishing, setFinishing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!local) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking this computer…
            </p>
        );
    }

    const { ollama, hardware: hw } = local;
    const candidates = local.catalog.filter((m) => m.kind === "chat" && m.tools && m.fit !== "too-large");
    const fallback =
        candidates.find((m) => m.installed && m.id === local.recommended) ??
        candidates.find((m) => m.installed && m.fit !== "tight") ??
        candidates.find((m) => m.id === local.recommended) ??
        candidates[0];
    const model = candidates.find((m) => m.id === picked) ?? fallback;
    const embed = local.catalog.find((m) => m.id === EMBED_MODEL);
    const needEmbedDownload = withSearch && !!embed && !embed.installed;

    const neededGB = (model && !model.installed ? model.sizeGB : 0) + (needEmbedDownload ? embed!.sizeGB : 0);
    const diskShort = hw.freeDiskGB !== null && neededGB > 0 && hw.freeDiskGB < neededGB + DISK_HEADROOM_GB;
    const busy = finishing || !!download.current;

    const start = async () => {
        setStarting(true);
        setStartError(null);
        try {
            await aiApi.startOllama();
        } catch (e) {
            setStartError((e as Error).message);
        } finally {
            setStarting(false);
            onLocalChanged();
        }
    };

    const finish = async () => {
        if (!model) return;
        setFinishing(true);
        setError(null);
        download.clearError();
        try {
            if (!model.installed && !(await download.start(model.id))) return;
            // Document search is optional: a failed embed download doesn't block chat.
            const searchOk = !needEmbedDownload || (await download.start(EMBED_MODEL));
            const r = await aiApi.quickSetupLocal(model.id);
            onDone(
                `On-device AI is ready: ${r.chat} handles the assistant and background tasks${
                    r.embed ? `, ${r.embed} handles document search` : ""
                }. Local-only mode is on.${searchOk ? "" : " Document search couldn't be downloaded — try it again from Advanced settings."}`,
            );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setFinishing(false);
        }
    };

    if (!candidates.length) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                This computer has {hw.totalMemGB} GB of memory, which isn&apos;t enough to run a model that can use CapScreen&apos;s
                screening tools. Use a cloud provider instead.
                <div className="mt-3">
                    <Button size="sm" onClick={onUseCloud} className="bg-black text-white hover:bg-gray-900">
                        Use a cloud provider
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <ol>
            <Step n={1} title={ollama.running ? `Ollama is running (version ${ollama.version})` : "Get Ollama running"} done={ollama.running} active={!ollama.running}>
                <p className="text-sm text-gray-600">
                    Ollama is a free app that runs AI models on your computer. CapScreen uses it so nothing leaves this machine.
                </p>
                {ollama.installed && ollama.canStart ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Button onClick={start} disabled={starting} className="bg-black text-white hover:bg-gray-900">
                            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            {starting ? "Starting Ollama…" : "Start Ollama"}
                        </Button>
                        <span className="text-xs text-gray-500">Ollama is installed but not running.</span>
                    </div>
                ) : (
                    <div className="mt-3 space-y-2">
                        <Button onClick={() => openExternal(OLLAMA_DOWNLOAD_URL)} className="bg-black text-white hover:bg-gray-900">
                            <ExternalLink className="h-4 w-4" /> Download Ollama
                        </Button>
                        <p className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Install it and open it — this page notices automatically.
                        </p>
                    </div>
                )}
                {startError && <p className="mt-2 text-xs text-red-600">{startError}</p>}
            </Step>

            <Step n={2} title="Choose a model" done={false} active={ollama.running}>
                <p className="text-sm text-gray-600">
                    Picked for your {hw.cpu} with {hw.totalMemGB} GB {hw.unifiedMemory ? "unified memory" : "RAM"}. Bigger models give
                    better answers but respond slower.
                </p>
                <ul className="mt-3 grid gap-2" role="radiogroup" aria-label="Chat model">
                    {candidates.map((m) => {
                        const selected = m.id === model?.id;
                        return (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={busy}
                                    onClick={() => setPicked(m.id)}
                                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                        selected ? "border-black bg-gray-50" : "border-gray-200 hover:border-gray-300"
                                    }`}
                                >
                                    <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${selected ? "border-[5px] border-black" : "border-gray-300"}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                            {m.label}
                                            {m.id === local.recommended && (
                                                <span className="rounded-full bg-black px-1.5 py-0.5 text-[10px] font-medium text-white">Recommended</span>
                                            )}
                                            {m.installed && <span className="text-[11px] font-normal text-emerald-700">Downloaded</span>}
                                        </span>
                                        <span className="block text-xs text-gray-500">{m.note}</span>
                                    </span>
                                    <span className="shrink-0 text-right text-xs text-gray-500">
                                        {!m.installed && <span className="block">{m.sizeGB} GB</span>}
                                        <span className={m.fit === "tight" ? "text-amber-700" : ""}>{FIT_NOTE[m.fit]}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {model?.fit === "tight" && (
                    <p className="mt-2 text-xs text-amber-700">
                        {model.label} is a tight fit for {hw.totalMemGB} GB: answers will be slow and other apps may lag while it runs.
                    </p>
                )}

                {embed && (
                    <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                        <input type="checkbox" className="mt-1" checked={withSearch} disabled={busy} onChange={(e) => setWithSearch(e.target.checked)} />
                        <span>
                            Also set up document search{" "}
                            <span className="text-gray-500">
                                ({embed.label}, {embed.installed ? "already downloaded" : `${embed.sizeGB} GB`}). Lets the assistant find
                                passages in uploaded documents by meaning.
                            </span>
                        </span>
                    </label>
                )}

                {download.current && (
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>
                                {download.current.status} {download.current.model}
                                {download.current.progress ? ` · ${download.current.progress}` : ""}
                            </span>
                            <button type="button" onClick={download.cancel} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900">
                                <X className="h-3 w-3" /> Cancel
                            </button>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full bg-black transition-[width] duration-300" style={{ width: `${download.current.percent ?? 2}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">Keep this page open until the download finishes.</p>
                    </div>
                )}

                {diskShort && (
                    <p className="mt-3 text-xs text-red-600">
                        Not enough disk space: this needs about {Math.ceil(neededGB + DISK_HEADROOM_GB)} GB free and you have {hw.freeDiskGB} GB.
                        Free up space or pick a smaller model.
                    </p>
                )}
                {download.error && <p className="mt-3 text-xs text-red-600">Couldn&apos;t download {download.error.model}: {download.error.message}</p>}
                {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

                <div className="mt-4">
                    <Button onClick={finish} disabled={busy || diskShort || !model} className="bg-black text-white hover:bg-gray-900">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : neededGB > 0 ? <Download className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {neededGB > 0 ? `Download ${neededGB.toFixed(1)} GB and finish` : "Finish setup"}
                    </Button>
                </div>
            </Step>
        </ol>
    );
}
