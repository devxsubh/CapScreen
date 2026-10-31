"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ExternalLink, Loader2, Plug, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    aiApi,
    AiApiError,
    KEY_LINKS,
    OLLAMA_DOWNLOAD_URL,
    type AiState,
    type LocalState,
    type ProviderView,
    type RoleSummary,
} from "@/lib/aiControlCenterApi";
import { openExternal } from "./useModelDownload";
import { ModelLogo, ProviderLogo } from "./ProviderLogo";
import { modelDisplayName, modelHint, providerDisplayName } from "@/lib/modelDisplay";

/** `connected` is null while a server is still being checked. */
type Module = ProviderView & { cloud: boolean; connected: boolean | null };

type ProviderModels = { loading: boolean; models: string[]; recommended: string | null; error: string | null };

async function checkServer(p: ProviderView, local: LocalState | null): Promise<boolean> {
    if (p.id === "ollama" && local) return local.ollama.running;
    if (p.id === "lmstudio" && local) return local.lmstudio.running;
    const t = await aiApi.test(p.id).catch(() => null);
    return !!t?.ok;
}

function isUsable(p: ProviderView): boolean {
    return !p.needsKey || p.key.configured || p.envKey;
}

function usePickerState() {
    const [state, setState] = useState<AiState | null>(null);
    const [modules, setModules] = useState<Module[] | null>(null);
    const [local, setLocal] = useState<LocalState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modelLists, setModelLists] = useState<Record<string, ProviderModels>>({});

    const load = useCallback(async () => {
        setError(null);
        try {
            const [s, l] = await Promise.all([aiApi.state(), aiApi.local().catch(() => null)]);
            setState(s);
            setLocal(l);
            const list = s.providers.map((p): Module => {
                const cloud = p.needsKey && p.preset;
                return { ...p, cloud, connected: cloud ? p.key.configured || p.envKey : null };
            });
            setModules(list);
            for (const m of list.filter((x) => x.connected === null)) {
                void checkServer(m, l).then((ok) =>
                    setModules((prev) => prev?.map((x) => (x.id === m.id ? { ...x, connected: ok } : x)) ?? prev),
                );
            }
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    const loadModels = useCallback((providerId: string) => {
        setModelLists((prev) => {
            if (prev[providerId]?.loading || (prev[providerId]?.models.length && !prev[providerId]?.error)) {
                return prev;
            }
            return {
                ...prev,
                [providerId]: {
                    loading: true,
                    models: prev[providerId]?.models ?? [],
                    recommended: prev[providerId]?.recommended ?? null,
                    error: null,
                },
            };
        });
        void aiApi
            .models(providerId)
            .then((r) => {
                const chat = (r.chatModels?.length ? r.chatModels : r.models).filter((m) => !/embed/i.test(m));
                setModelLists((prev) => ({
                    ...prev,
                    [providerId]: { loading: false, models: chat, recommended: r.recommended, error: null },
                }));
            })
            .catch((e: Error) => {
                setModelLists((prev) => ({
                    ...prev,
                    [providerId]: {
                        loading: false,
                        models: prev[providerId]?.models ?? [],
                        recommended: prev[providerId]?.recommended ?? null,
                        error: e.message,
                    },
                }));
            });
    }, []);

    return { state, modules, local, error, modelLists, load, loadModels, setState };
}

function ConnectDialog({
    m,
    local,
    localOnly,
    onClose,
    onConnected,
}: {
    m: Module;
    local: LocalState | null;
    localOnly: boolean;
    onClose: () => void;
    onConnected: () => void;
}) {
    const [key, setKey] = useState("");
    const [baseUrl, setBaseUrl] = useState(m.baseUrl ?? "");
    const [busy, setBusy] = useState<"connect" | "start" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [unverified, setUnverified] = useState(false);
    const [done, setDone] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const run = async (kind: "connect" | "start", fn: () => Promise<string>) => {
        setBusy(kind);
        setError(null);
        try {
            setDone(await fn());
            onConnected();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const saveKey = (skipVerify: boolean) =>
        run("connect", async () => {
            setUnverified(false);
            try {
                const r = await aiApi.saveKey(m.id, key, { skipVerify });
                setKey("");
                return r.verified
                    ? `${m.label} is connected${r.modelCount ? ` · ${r.modelCount} models available` : ""}.`
                    : `Key saved without checking. Pick a model below or in the AI Control Center.`;
            } catch (e) {
                const err = e as AiApiError;
                if (err.reason === "unverified") setUnverified(true);
                throw err.reason === "rejected" ? new Error(`${err.message} The key was not saved.`) : err;
            }
        });

    const testServer = () =>
        run("connect", async () => {
            if (baseUrl.trim() !== (m.baseUrl ?? "")) await aiApi.saveProvider(m.id, { baseUrl: baseUrl.trim() });
            const t = await aiApi.test(m.id);
            if (!t.ok) throw new Error(t.error ?? `${m.label} isn't answering at that address.`);
            return `${m.label} is connected · ${t.modelCount ?? 0} models available.`;
        });

    const ollamaDown = m.id === "ollama" && local && !local.ollama.running;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-xs"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div role="dialog" aria-modal="true" aria-label={`Connect ${m.label}`} className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
                    <div className="flex items-center gap-2.5">
                        <ProviderLogo id={m.id} local={!m.cloud} size={18} tile />
                        <span className="text-sm font-medium">
                            {m.connected ? providerDisplayName(m.label) : `Connect ${providerDisplayName(m.label)}`}
                        </span>
                        {m.connected && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                Connected{m.key.hint ? ` · ${m.key.hint}` : ""}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3 px-4 py-4">
                    {done ? (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>{done} Choose a model from the chat menu to use it.</span>
                        </div>
                    ) : m.cloud ? (
                        <>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{m.connected ? "Paste a new key to replace the saved one." : "Paste your API key."}</span>
                                {KEY_LINKS[m.id] && (
                                    <button
                                        type="button"
                                        onClick={() => openExternal(KEY_LINKS[m.id])}
                                        className="inline-flex items-center gap-1 hover:text-gray-900"
                                    >
                                        Get a key <ExternalLink className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            <PasswordInput
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder="API key"
                                autoComplete="off"
                                spellCheck={false}
                                autoFocus
                                aria-label={`${m.label} API key`}
                                onKeyDown={(e) => e.key === "Enter" && key.trim() && !busy && saveKey(false)}
                            />
                            <p className="text-xs text-gray-500">
                                Encrypted with your operating system&apos;s keychain. It only leaves this computer to
                                authenticate with {m.label}.
                            </p>
                            {localOnly && (
                                <p className="text-xs text-amber-700">
                                    Local-only mode is on, so cloud models stay blocked until you turn it off in the AI
                                    Control Center.
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <label className="block text-xs text-gray-500" htmlFor={`connect-${m.id}-url`}>
                                Server address
                            </label>
                            <Input
                                id={`connect-${m.id}-url`}
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                className="font-mono text-xs"
                                autoFocus
                            />
                            {ollamaDown &&
                                (local.ollama.canStart ? (
                                    <Button
                                        variant="outline"
                                        disabled={busy !== null}
                                        onClick={() =>
                                            run("start", async () => {
                                                await aiApi.startOllama();
                                                return "Ollama is running.";
                                            })
                                        }
                                    >
                                        {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        Start Ollama
                                    </Button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openExternal(OLLAMA_DOWNLOAD_URL)}
                                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                                    >
                                        Ollama isn&apos;t installed. Download it <ExternalLink className="h-3 w-3" />
                                    </button>
                                ))}
                        </>
                    )}
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
                    {done ? (
                        <Button onClick={onClose} className="bg-gray-950 text-white hover:bg-gray-800">
                            Done
                        </Button>
                    ) : (
                        <>
                            {unverified && key.trim() && (
                                <Button variant="outline" disabled={busy !== null} onClick={() => void saveKey(true)}>
                                    Save without checking
                                </Button>
                            )}
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void (m.cloud ? saveKey(false) : testServer())}
                                disabled={busy !== null || (m.cloud ? !key.trim() : !baseUrl.trim())}
                                className="bg-gray-950 text-white hover:bg-gray-800"
                            >
                                {busy === "connect" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : m.cloud ? (
                                    m.connected ? "Replace key" : "Check and connect"
                                ) : (
                                    "Connect"
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

function ConnectProviderList({
    modules,
    onSelect,
}: {
    modules: Module[];
    onSelect: (m: Module) => void;
}) {
    const groups = [
        { title: "Cloud", items: modules.filter((m) => m.cloud) },
        { title: "On this computer", items: modules.filter((m) => !m.cloud) },
    ].filter((g) => g.items.length > 0);
    return (
        <>
            <div className="px-3 pb-1 pt-2.5">
                <p className="text-sm font-medium text-gray-900">Connect a provider</p>
                <p className="mt-0.5 text-xs text-gray-500">Use your own API key, or a model running on this computer.</p>
            </div>
            {groups.map((g) => (
                <div key={g.title}>
                    <p className="px-3 pb-1 pt-2.5 text-[11px] uppercase tracking-wide text-gray-400">{g.title}</p>
                    {g.items.map((m) => (
                        <DropdownMenuItem key={m.id} onSelect={() => onSelect(m)} className="cursor-pointer gap-3 rounded-lg px-3 py-2">
                            <ProviderLogo id={m.id} local={!m.cloud} size={16} tile />
                            <span className="flex-1 truncate text-sm">{providerDisplayName(m.label)}</span>
                            {m.connected === null ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                            ) : m.connected ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Connected</span>
                            ) : (
                                <span className="text-[11px] text-gray-400">{m.cloud ? "Add key" : "Connect"}</span>
                            )}
                        </DropdownMenuItem>
                    ))}
                </div>
            ))}
        </>
    );
}

type ModelPickerProps = {
    /** Controlled open state (e.g. opened from the compact tools menu). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Hide the visible trigger; menu still opens via `open` / `onOpenChange`. */
    hideTrigger?: boolean;
};

/** Chat toolbar control: pick the global agent model, or connect a provider. */
export function ModelPicker({ open: openProp, onOpenChange, hideTrigger = false }: ModelPickerProps = {}) {
    const { state, modules, local, error, modelLists, load, loadModels, setState } = usePickerState();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const menuOpen = openProp ?? uncontrolledOpen;
    const setMenuOpen = onOpenChange ?? setUncontrolledOpen;
    const [selected, setSelected] = useState<Module | null>(null);
    const [connectMode, setConnectMode] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const agent: RoleSummary | undefined = state?.effective.roles.agent;
    const localOnly = state?.localOnly ?? false;

    const usable =
        modules?.filter((m) => {
            if (!isUsable(m)) return false;
            // Local servers need to answer; cloud with a key is usable (local-only handled at select).
            if (!m.cloud && m.connected === false) return false;
            return true;
        }) ?? [];
    const usableIds = usable.map((m) => m.id).join(",");

    const onOpen = (open: boolean) => {
        setMenuOpen(open);
        if (!open) {
            setConnectMode(false);
            setSaveError(null);
            return;
        }
        void load();
    };

    useEffect(() => {
        if (!usableIds) return;
        for (const id of usableIds.split(",")) {
            if (!modelLists[id]) loadModels(id);
        }
    }, [usableIds, modelLists, loadModels]);

    // Refresh current agent label on mount so the trigger isn't empty until open.
    useEffect(() => {
        void load();
    }, [load]);

    const selectModel = async (provider: ProviderView, model: string) => {
        const key = `${provider.id}:${model}`;
        if (agent?.provider === provider.id && agent?.model === model) return;
        if (!provider.local && localOnly) {
            if (
                !confirm(
                    `${provider.label} is a cloud provider and Local-only mode is on.\n\nTurn off Local-only mode so the assistant can use it? Cap-table details it works with will be sent to ${provider.label}.`,
                )
            )
                return;
            await aiApi.setLocalOnly(false);
        }
        setSaving(key);
        setSaveError(null);
        try {
            let supportsTools: boolean | undefined;
            try {
                const probe = await aiApi.probeTools(provider.id, model);
                supportsTools = probe.supportsTools;
            } catch {
                supportsTools = undefined;
            }
            const r = await aiApi.saveRoles({
                agent: { provider: provider.id, model, ...(supportsTools !== undefined ? { supportsTools } : {}) },
            });
            setState((prev) =>
                prev
                    ? {
                          ...prev,
                          roles: { ...prev.roles, agent: { provider: provider.id, model, supportsTools } },
                          effective: r.effective,
                          localOnly: r.effective.localOnly,
                      }
                    : prev,
            );
            setMenuOpen(false);
            setConnectMode(false);
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(null);
        }
    };

    const triggerLabel = agent ? modelDisplayName(agent.model) : "Choose model";

    return (
        <>
            <DropdownMenu open={menuOpen} onOpenChange={onOpen}>
                <DropdownMenuTrigger asChild>
                    {hideTrigger ? (
                        <button
                            type="button"
                            aria-hidden
                            tabIndex={-1}
                            className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
                        />
                    ) : (
                        <button
                            type="button"
                            aria-label={agent ? `Chat model: ${triggerLabel}` : "Choose chat model"}
                            title={agent ? `${agent.model} · ${agent.label}` : "Choose which model the assistant uses"}
                            className="flex h-8 max-w-[13rem] items-center gap-1.5 rounded-lg px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-200/70 hover:text-gray-900 data-[state=open]:bg-gray-200/70"
                        >
                            {agent ? (
                                <ProviderLogo id={agent.provider} local={agent.local} size={14} />
                            ) : (
                                <Plug className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="hidden truncate sm:inline">{triggerLabel}</span>
                            <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                        </button>
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="max-h-[min(30rem,75vh)] w-[22rem] overflow-y-auto rounded-xl bg-white p-1.5"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {error ? (
                        <p className="px-3 py-2 text-xs text-red-600">Couldn&apos;t load models: {error}</p>
                    ) : !modules || !state ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                        </div>
                    ) : connectMode ? (
                        <ConnectProviderList modules={modules} onSelect={(m) => setSelected(m)} />
                    ) : usable.length === 0 ? (
                        <div className="px-3 py-3">
                            <p className="text-sm font-medium text-gray-900">No AI connected yet</p>
                            <p className="mt-1 text-xs text-gray-500">
                                Add an API key for Claude, Gemini or OpenAI, or connect a model running on this computer.
                            </p>
                            <Button
                                size="sm"
                                className="mt-3 w-full bg-gray-950 text-white hover:bg-gray-800"
                                onClick={() => setConnectMode(true)}
                            >
                                <Plug className="h-3.5 w-3.5" /> Connect a provider
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="px-3 pb-1 pt-2.5">
                                <p className="text-sm font-medium text-gray-900">Model</p>
                                <p className="mt-0.5 text-xs text-gray-500">The assistant uses this everywhere in CapScreen.</p>
                            </div>
                            {usable.map((m) => {
                                const list = modelLists[m.id];
                                const blocked = !m.local && localOnly;
                                return (
                                    <div key={m.id} className="mt-1.5 border-t border-gray-100 pt-1.5">
                                        <div className="flex items-center gap-2 px-3 py-1.5">
                                            <ProviderLogo id={m.id} local={m.local} size={14} />
                                            <span className="text-xs font-medium text-gray-700">{providerDisplayName(m.label)}</span>
                                            <span
                                                className={`rounded-full px-1.5 py-px text-[10px] ${
                                                    "bg-gray-100 text-gray-600"
                                                }`}
                                            >
                                                {m.local ? "This computer" : "Cloud"}
                                            </span>
                                            {blocked && <span className="text-[10px] text-amber-700">Local-only is on</span>}
                                        </div>
                                        {!list || list.loading ? (
                                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading models…
                                            </div>
                                        ) : list.error ? (
                                            <p className="px-3 py-2 text-xs text-red-600">{list.error}</p>
                                        ) : list.models.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-gray-500">No chat models found.</p>
                                        ) : (
                                            list.models.map((model) => {
                                                const active = agent?.provider === m.id && agent?.model === model;
                                                const busy = saving === `${m.id}:${model}`;
                                                const hint = modelHint(model);
                                                return (
                                                    <DropdownMenuItem
                                                        key={model}
                                                        title={model}
                                                        disabled={busy || saving !== null}
                                                        onSelect={(e) => {
                                                            e.preventDefault();
                                                            void selectModel(m, model);
                                                        }}
                                                        className={`cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${active ? "bg-gray-50" : ""}`}
                                                    >
                                                        <ModelLogo model={model} provider={m.id} local={m.local} size={16} />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="truncate text-sm text-gray-900">{modelDisplayName(model)}</span>
                                                                {list.recommended === model && (
                                                                    <span className="shrink-0 rounded-full bg-gray-900 px-1.5 py-px text-[10px] text-white">
                                                                        Recommended
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {hint && <span className="block truncate text-xs text-gray-500">{hint}</span>}
                                                        </span>
                                                        {busy ? (
                                                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                                                        ) : active ? (
                                                            <Check className="h-4 w-4 shrink-0 text-gray-900" />
                                                        ) : null}
                                                    </DropdownMenuItem>
                                                );
                                            })
                                        )}
                                    </div>
                                );
                            })}
                            {saveError && <p className="px-3 py-1.5 text-xs text-red-600">{saveError}</p>}
                            {localOnly && usable.some((m) => !m.local) && (
                                <p className="px-3 py-1.5 text-[11px] text-amber-700">
                                    Local-only mode is on. Choosing a cloud model will ask to turn it off.
                                </p>
                            )}
                        </>
                    )}
                    {!connectMode && modules && usable.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setConnectMode(true)} className="cursor-pointer gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700">
                                <Plug className="h-4 w-4 text-gray-500" /> Connect another provider
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700">
                                <Link href="/settings/ai">
                                    <Settings2 className="h-4 w-4 text-gray-500" /> AI Control Center
                                </Link>
                            </DropdownMenuItem>
                        </>
                    )}
                    {connectMode && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setConnectMode(false);
                                }}
                                className="cursor-pointer gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700"
                            >
                                <ChevronLeft className="h-4 w-4 text-gray-500" /> Back to models
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {selected && (
                <ConnectDialog
                    key={selected.id}
                    m={selected}
                    local={local}
                    localOnly={localOnly}
                    onClose={() => setSelected(null)}
                    onConnected={() => {
                        void load();
                        setConnectMode(false);
                    }}
                />
            )}
        </>
    );
}

