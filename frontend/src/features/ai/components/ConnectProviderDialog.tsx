/** Dialog for connecting a model provider (API key or local server) from the model picker. */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { aiApi, AiApiError, KEY_LINKS, OLLAMA_DOWNLOAD_URL, type LocalState, type ProviderView } from "@/api/aiControlCenter";
import { openExternal } from "@/features/ai/hooks/useModelDownload";
import { ProviderLogo } from "./ProviderLogo";
import { providerDisplayName } from "@/features/ai/lib/modelDisplay";

/** `connected` is null while a server is still being checked. */
export type Module = ProviderView & { cloud: boolean; connected: boolean | null };

export function ConnectProviderDialog({
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

export function ConnectProviderList({
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
