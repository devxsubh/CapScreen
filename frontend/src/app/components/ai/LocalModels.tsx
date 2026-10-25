"use client";

import { useRef, useState } from "react";
import { Cpu, Download, ExternalLink, HardDrive, Loader2, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi, type CatalogModel, type Fit, type LocalState } from "@/lib/aiControlCenterApi";
import { desktop } from "@/lib/desktop";

const FIT_STYLE: Record<Fit, { label: string; className: string }> = {
    great: { label: "Runs well", className: "bg-emerald-50 text-emerald-700" },
    ok: { label: "Fits", className: "bg-sky-50 text-sky-700" },
    tight: { label: "Tight — slow", className: "bg-amber-50 text-amber-700" },
    "too-large": { label: "Too large", className: "bg-gray-100 text-gray-500" },
};

type PullState = { model: string; percent: number | null; status: string; abort: AbortController };

function openExternal(url: string) {
    const bridge = desktop();
    if (bridge) void bridge.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

export function LocalModels({
    local,
    onChange,
}: {
    local: LocalState | null;
    onChange: () => void;
}) {
    const [pull, setPull] = useState<PullState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupBusy, setSetupBusy] = useState(false);
    const [setupMsg, setSetupMsg] = useState<string | null>(null);
    const pullRef = useRef<PullState | null>(null);

    if (!local) {
        return (
            <section>
                <h2 className="text-2xl font-medium font-serif">Local models</h2>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking this computer…
                </div>
            </section>
        );
    }

    const { hardware: hw, ollama } = local;

    const startPull = async (model: string) => {
        setError(null);
        const state: PullState = { model, percent: null, status: "Starting…", abort: new AbortController() };
        pullRef.current = state;
        setPull(state);
        try {
            await aiApi.pull(
                model,
                (e) => {
                    if (e.type === "progress") {
                        const next = { ...pullRef.current!, status: e.status, percent: e.percent ?? pullRef.current!.percent };
                        pullRef.current = next;
                        setPull(next);
                    } else if (e.type === "error") {
                        setError(e.detail);
                    }
                },
                state.abort.signal,
            );
        } catch (e) {
            if (!state.abort.signal.aborted) setError((e as Error).message);
        } finally {
            pullRef.current = null;
            setPull(null);
            onChange();
        }
    };

    const remove = async (name: string) => {
        if (!confirm(`Delete ${name} from this computer?`)) return;
        try {
            await aiApi.deleteLocalModel(name);
            onChange();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const quickSetup = async () => {
        setSetupBusy(true);
        setSetupMsg(null);
        setError(null);
        try {
            const r = await aiApi.quickSetupLocal();
            setSetupMsg(
                `Done — ${r.chat} handles chat and background tasks${r.embed ? `, ${r.embed} handles document search` : ""}. Local-only mode is on.`,
            );
            onChange();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSetupBusy(false);
        }
    };

    const chatModels = local.catalog.filter((m) => m.kind === "chat");
    const embedModels = local.catalog.filter((m) => m.kind === "embedding");

    const renderModel = (m: CatalogModel) => {
        const fit = FIT_STYLE[m.fit];
        const pulling = pull?.model === m.id;
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
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${fit.className}`}>
                        {fit.label}
                    </span>
                </div>
                <p className="text-xs text-gray-600">{m.note}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-2">
                        {m.sizeGB} GB
                        {m.tools && (
                            <span className="inline-flex items-center gap-0.5">
                                <Wrench className="h-3 w-3" /> tools
                            </span>
                        )}
                    </span>
                    {m.installed ? (
                        <span className="text-emerald-700 font-medium">Installed</span>
                    ) : pulling ? (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                            onClick={() => pull?.abort.abort()}
                        >
                            <X className="h-3 w-3" /> Cancel
                        </button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!ollama.running || !!pull || m.fit === "too-large"}
                            onClick={() => startPull(m.id)}
                            className="h-7 text-xs"
                        >
                            <Download className="h-3 w-3" /> Download
                        </Button>
                    )}
                </div>
                {pulling && (
                    <div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                                className="h-full bg-black transition-[width] duration-300"
                                style={{ width: `${pull?.percent ?? 2}%` }}
                            />
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 truncate">
                            {pull?.status}
                            {pull?.percent != null ? ` · ${pull.percent}%` : ""}
                        </div>
                    </div>
                )}
            </li>
        );
    };

    return (
        <section>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-medium font-serif">Local models</h2>
                    <p className="text-sm text-gray-500">
                        Run models on this computer with Ollama — nothing is sent anywhere.
                    </p>
                </div>
                {ollama.running && (
                    <Button onClick={quickSetup} disabled={setupBusy} className="bg-black hover:bg-gray-900 text-white">
                        {setupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                        Use on-device AI
                    </Button>
                )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Runtime</div>
                    {ollama.running ? (
                        <div className="text-sm">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />
                            Ollama {ollama.version} running · {ollama.models.length} model
                            {ollama.models.length === 1 ? "" : "s"}
                        </div>
                    ) : (
                        <div className="text-sm space-y-2">
                            <div>
                                <span className="inline-block h-2 w-2 rounded-full bg-gray-300 mr-1.5" />
                                Ollama is not running
                            </div>
                            <p className="text-xs text-gray-500">
                                Install Ollama (free), open it, then come back — this page refreshes automatically.
                            </p>
                            <Button variant="outline" size="sm" onClick={() => openExternal("https://ollama.com/download")}>
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
                    {hw.totalMemGB < 12 && (
                        <p className="text-xs text-amber-700 mt-1">
                            With {hw.totalMemGB} GB, 4B-parameter models run best. Larger ones work but respond
                            slowly while CapScreen is open.
                        </p>
                    )}
                </div>
            </div>

            {setupMsg && <p className="mt-3 text-sm text-emerald-700">{setupMsg}</p>}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {ollama.models.length > 0 && (
                <div className="mt-5">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Installed</h3>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {ollama.models.map((m) => (
                            <li key={m.name} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="font-mono">{m.name}</span>
                                <span className="flex items-center gap-3 text-xs text-gray-500">
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
                        ))}
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
