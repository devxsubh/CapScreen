"use client";

import { useState } from "react";
import { Cpu, Download, ExternalLink, HardDrive, Loader2, Play, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    aiApi,
    OLLAMA_DOWNLOAD_URL,
    ROLE_INFO,
    type AiState,
    type CatalogModel,
    type Fit,
    type LlmRole,
    type LocalState,
} from "@/lib/aiControlCenterApi";
import { openExternal, type ModelDownloader } from "./useModelDownload";

const FIT_STYLE: Record<Fit, { label: string; className: string }> = {
    great: { label: "Runs well", className: "bg-emerald-50 text-emerald-700" },
    ok: { label: "Fits", className: "bg-sky-50 text-sky-700" },
    tight: { label: "Tight — slow", className: "bg-amber-50 text-amber-700" },
    "too-large": { label: "Too large", className: "bg-gray-100 text-gray-500" },
};

const DISK_HEADROOM_GB = 2;

const sameModel = (a: string, b: string) => {
    const tag = (s: string) => (s.includes(":") ? s : `${s}:latest`);
    return tag(a) === tag(b);
};

/** Tasks currently using an Ollama model. */
function tasksUsing(state: AiState, name: string): string[] {
    const roles = (["agent", "utility", "embedding"] as LlmRole[]).filter((r) => {
        const b = state.roles[r] ?? (r === "utility" ? state.roles.agent : undefined);
        return b?.provider === "ollama" && sameModel(b.model, name);
    });
    return roles.map((r) => ROLE_INFO[r].title.toLowerCase());
}

export function LocalModels({
    local,
    state,
    download,
    onChange,
}: {
    local: LocalState | null;
    state: AiState;
    download: ModelDownloader;
    onChange: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    if (!local) {
        return (
            <section>
                <h2 className="text-xl font-medium">On-device models</h2>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking this computer…
                </div>
            </section>
        );
    }

    const { hardware: hw, ollama } = local;

    const start = async () => {
        setStarting(true);
        setError(null);
        try {
            await aiApi.startOllama();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
            onChange();
        }
    };

    const remove = async (name: string) => {
        const using = tasksUsing(state, name);
        const warning = using.length ? `\n\n${using.join(" and ")} use${using.length === 1 ? "s" : ""} this model and will stop working until you pick another.` : "";
        if (!confirm(`Delete ${name} from this computer?${warning}`)) return;
        setError(null);
        try {
            await aiApi.deleteLocalModel(name);
            onChange();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const fitsOnDisk = (m: CatalogModel) => hw.freeDiskGB === null || hw.freeDiskGB >= m.sizeGB + DISK_HEADROOM_GB;

    const renderModel = (m: CatalogModel) => {
        const fit = FIT_STYLE[m.fit];
        const pulling = download.current?.model === m.id;
        const diskOk = fitsOnDisk(m);
        return (
            <li key={m.id} className="rounded-lg border border-gray-200 p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-1.5">
                            {m.label}
                            {m.id === local.recommended && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-black px-1.5 py-0.5 text-[10px] font-medium text-white">
                                    <Sparkles className="h-2.5 w-2.5" /> Recommended
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{m.id}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${fit.className}`}>{fit.label}</span>
                </div>
                <p className="text-xs text-gray-600">{m.note}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-2">
                        {m.sizeGB} GB
                        {m.tools ? (
                            <span className="inline-flex items-center gap-0.5">
                                <Wrench className="h-3 w-3" /> tools
                            </span>
                        ) : (
                            m.kind === "chat" && <span className="text-amber-700">no tools</span>
                        )}
                    </span>
                    {m.installed ? (
                        <span className="text-emerald-700 font-medium">Downloaded</span>
                    ) : pulling ? (
                        <button type="button" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900" onClick={download.cancel}>
                            <X className="h-3 w-3" /> Cancel
                        </button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!ollama.running || !!download.current || m.fit === "too-large" || !diskOk}
                            title={
                                !ollama.running
                                    ? "Start Ollama first"
                                    : m.fit === "too-large"
                                      ? "Needs more memory than this computer has"
                                      : !diskOk
                                        ? `Needs about ${Math.ceil(m.sizeGB + DISK_HEADROOM_GB)} GB of free disk space`
                                        : undefined
                            }
                            onClick={() => void download.start(m.id)}
                            className="h-7 text-xs"
                        >
                            <Download className="h-3 w-3" /> {diskOk ? "Download" : "Not enough disk"}
                        </Button>
                    )}
                </div>
                {pulling && download.current && (
                    <div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-black transition-[width] duration-300" style={{ width: `${download.current.percent ?? 2}%` }} />
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 truncate">
                            {download.current.status}
                            {download.current.progress ? ` · ${download.current.progress}` : ""}
                        </div>
                    </div>
                )}
            </li>
        );
    };

    const chatModels = local.catalog.filter((m) => m.kind === "chat");
    const embedModels = local.catalog.filter((m) => m.kind === "embedding");

    return (
        <section>
            <h2 className="text-xl font-medium">On-device models</h2>
            <p className="text-sm text-gray-500">Run models on this computer with Ollama — nothing is sent anywhere.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Ollama</div>
                    {ollama.running ? (
                        <div className="text-sm">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />
                            Running (version {ollama.version}) · {ollama.models.length} model{ollama.models.length === 1 ? "" : "s"}
                        </div>
                    ) : ollama.installed && ollama.canStart ? (
                        <div className="text-sm space-y-2">
                            <div>
                                <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1.5" />
                                Installed, but not running
                            </div>
                            <Button variant="outline" size="sm" onClick={start} disabled={starting}>
                                {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                {starting ? "Starting…" : "Start Ollama"}
                            </Button>
                        </div>
                    ) : (
                        <div className="text-sm space-y-2">
                            <div>
                                <span className="inline-block h-2 w-2 rounded-full bg-gray-300 mr-1.5" />
                                Not installed
                            </div>
                            <p className="text-xs text-gray-500">Install Ollama (free) and open it — this page notices automatically.</p>
                            <Button variant="outline" size="sm" onClick={() => openExternal(OLLAMA_DOWNLOAD_URL)}>
                                <ExternalLink className="h-3 w-3" /> Get Ollama
                            </Button>
                        </div>
                    )}
                    {local.lmstudio.running && (
                        <div className="text-sm mt-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />
                            LM Studio running · {local.lmstudio.models.length} models
                        </div>
                    )}
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">This computer</div>
                    <div className="text-sm flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-gray-500" />
                        {hw.cpu} · {hw.cores} cores
                    </div>
                    <div className="text-sm text-gray-700 mt-0.5">
                        {hw.totalMemGB} GB {hw.unifiedMemory ? "unified memory (shared with GPU)" : "RAM"}
                    </div>
                    {hw.freeDiskGB !== null && (
                        <div className="text-sm text-gray-700 mt-0.5 flex items-center gap-1.5">
                            <HardDrive className="h-3.5 w-3.5 text-gray-500" />
                            {hw.freeDiskGB} GB free disk
                        </div>
                    )}
                    {hw.totalMemGB < 12 && (
                        <p className="text-xs text-amber-700 mt-1">
                            With {hw.totalMemGB} GB, 4B-parameter models run best. Larger ones work but respond slowly while CapScreen is open.
                        </p>
                    )}
                </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {download.error && (
                <p className="mt-3 text-sm text-red-600">
                    Couldn&apos;t download {download.error.model}: {download.error.message}
                </p>
            )}

            {ollama.models.length > 0 && (
                <div className="mt-5">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Downloaded</h3>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {ollama.models.map((m) => {
                            const using = tasksUsing(state, m.name);
                            return (
                                <li key={m.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="min-w-0">
                                        <span className="font-mono">{m.name}</span>
                                        {using.length > 0 && <span className="ml-2 text-xs text-gray-500">used for {using.join(", ")}</span>}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
                                        {m.parameterSize && <span>{m.parameterSize}</span>}
                                        <span>{m.sizeGB} GB</span>
                                        <button
                                            type="button"
                                            onClick={() => remove(m.name)}
                                            className="text-gray-400 hover:text-red-600"
                                            aria-label={`Delete ${m.name}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <h3 className="text-sm font-medium text-gray-900 mt-5 mb-2">Chat models</h3>
            <ul className="grid gap-2 sm:grid-cols-2">{chatModels.map(renderModel)}</ul>
            <h3 className="text-sm font-medium text-gray-900 mt-5 mb-2">Document search models</h3>
            <ul className="grid gap-2 sm:grid-cols-2">{embedModels.map(renderModel)}</ul>
        </section>
    );
}
