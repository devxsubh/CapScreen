"use client";

import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, Plus, Server, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { aiApi, type AiState, type ProviderView } from "@/lib/aiControlCenterApi";
import { desktop } from "@/lib/desktop";

const KEY_LINKS: Record<string, string> = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    gemini: "https://aistudio.google.com/apikey",
    openrouter: "https://openrouter.ai/keys",
    groq: "https://console.groq.com/keys",
};

function openExternal(url: string) {
    const bridge = desktop();
    if (bridge) void bridge.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

function useStatus() {
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    return [status, setStatus] as const;
}

function CloudProviderCard({ p, onChange }: { p: ProviderView; onChange: () => void }) {
    const [key, setKey] = useState("");
    const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
    const [status, setStatus] = useStatus();

    const run = async (kind: "save" | "test" | "remove", fn: () => Promise<{ ok: boolean; text: string } | void>) => {
        setBusy(kind);
        setStatus(null);
        try {
            const r = await fn();
            if (r) setStatus(r);
            onChange();
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    return (
        <li className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <KeyRound className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-medium">{p.label}</span>
                    {p.key.configured ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Key saved {p.key.hint}
                        </span>
                    ) : p.envKey ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">From .env (dev)</span>
                    ) : null}
                </div>
                {KEY_LINKS[p.id] && (
                    <button
                        type="button"
                        onClick={() => openExternal(KEY_LINKS[p.id])}
                        className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"
                    >
                        Get a key <ExternalLink className="h-3 w-3" />
                    </button>
                )}
            </div>

            <div className="mt-3 flex gap-2">
                <div className="flex-1">
                    <PasswordInput
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={p.key.configured ? "Paste a new key to replace" : "Paste API key"}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`${p.label} API key`}
                    />
                </div>
                <Button
                    onClick={() =>
                        run("save", async () => {
                            await aiApi.saveKey(p.id, key.trim());
                            setKey("");
                            const t = await aiApi.test(p.id);
                            return t.ok
                                ? { ok: true, text: `Saved and verified · ${t.modelCount ?? 0} models available` }
                                : { ok: false, text: `Saved, but the provider rejected it: ${t.error}` };
                        })
                    }
                    disabled={!key.trim() || busy !== null}
                    className="bg-black hover:bg-gray-900 text-white"
                >
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs">
                {(p.key.configured || p.envKey) && (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                        disabled={busy !== null}
                        onClick={() =>
                            run("test", async () => {
                                const t = await aiApi.test(p.id);
                                return t.ok
                                    ? { ok: true, text: `Connected · ${t.latencyMs} ms` }
                                    : { ok: false, text: t.error ?? "Failed" };
                            })
                        }
                    >
                        {busy === "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Test connection
                    </button>
                )}
                {p.key.configured && (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600"
                        disabled={busy !== null}
                        onClick={() =>
                            run("remove", async () => {
                                await aiApi.removeKey(p.id);
                                return { ok: true, text: "Key removed from this computer" };
                            })
                        }
                    >
                        <Trash2 className="h-3 w-3" /> Remove key
                    </button>
                )}
                {status && (
                    <span className={status.ok ? "text-emerald-700 inline-flex items-center gap-1" : "text-red-600"}>
                        {status.ok && <Check className="h-3 w-3" />}
                        {status.text}
                    </span>
                )}
            </div>
        </li>
    );
}

function ServerRow({ p, onChange }: { p: ProviderView; onChange: () => void }) {
    const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "");
    const [status, setStatus] = useStatus();
    const [busy, setBusy] = useState(false);

    const test = async () => {
        setBusy(true);
        setStatus(null);
        try {
            if (baseUrl !== (p.baseUrl ?? "")) await aiApi.saveProvider(p.id, { baseUrl });
            const t = await aiApi.test(p.id);
            setStatus(t.ok ? { ok: true, text: `Connected · ${t.modelCount} models` } : { ok: false, text: t.error ?? "Failed" });
            onChange();
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <li className="py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-sm">{p.label}</span>
                <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                        p.local ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                >
                    {p.local ? "on this computer" : "remote server"}
                </span>
                {!p.preset && (
                    <button
                        type="button"
                        onClick={async () => {
                            await aiApi.removeProvider(p.id);
                            onChange();
                        }}
                        className="ml-auto text-gray-400 hover:text-red-600"
                        aria-label={`Remove ${p.label}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-xs" aria-label={`${p.label} base URL`} />
                <Button variant="outline" onClick={test} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Test
                </Button>
            </div>
            {status && <span className={`text-xs ${status.ok ? "text-emerald-700" : "text-red-600"}`}>{status.text}</span>}
        </li>
    );
}

function AddCustomProvider({ onChange }: { onChange: () => void }) {
    const [open, setOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8000/v1");
    const [apiKey, setApiKey] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!open) {
        return (
            <Button variant="outline" onClick={() => setOpen(true)} className="mt-3">
                <Plus className="h-4 w-4" /> Add OpenAI-compatible endpoint
            </Button>
        );
    }

    const id =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "custom";

    const add = async () => {
        setBusy(true);
        setError(null);
        try {
            await aiApi.saveProvider(id, { label: label.trim(), baseUrl: baseUrl.trim() });
            if (apiKey.trim()) await aiApi.saveKey(id, apiKey.trim());
            setOpen(false);
            setLabel("");
            setApiKey("");
            onChange();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 rounded-lg border border-gray-200 p-4 space-y-2">
            <p className="text-xs text-gray-500">
                Any server that speaks the OpenAI chat-completions API — vLLM, LocalAI, Jan, a company gateway, Azure
                OpenAI proxy, etc. Loopback URLs (127.0.0.1 / localhost) count as on-device.
            </p>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (e.g. Team vLLM)" />
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://host/v1" className="font-mono text-xs" />
            <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key (optional)" autoComplete="off" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
                <Button onClick={add} disabled={!label.trim() || !baseUrl.trim() || busy} className="bg-black hover:bg-gray-900 text-white">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

export function ProviderList({ state, onChange }: { state: AiState; onChange: () => void }) {
    const cloud = state.providers.filter((p) => p.needsKey && p.preset);
    const servers = state.providers.filter((p) => !p.preset || (!p.needsKey && p.id !== "ollama"));

    return (
        <>
            <section>
                <h2 className="text-2xl font-medium font-serif">Cloud providers</h2>
                <p className="text-sm text-gray-500">
                    Bring your own API key. Keys are encrypted with your operating system&apos;s keychain and never
                    leave this computer except to authenticate with that provider.
                </p>
                <ul className="mt-4 grid gap-3">
                    {cloud.map((p) => (
                        <CloudProviderCard key={p.id} p={p} onChange={onChange} />
                    ))}
                </ul>
            </section>

            <section>
                <h2 className="text-2xl font-medium font-serif">Other servers</h2>
                <p className="text-sm text-gray-500">LM Studio, llama.cpp, or your own OpenAI-compatible endpoint.</p>
                <ul className="mt-2 divide-y divide-gray-100">
                    {servers.map((p) => (
                        <ServerRow key={p.id} p={p} onChange={onChange} />
                    ))}
                </ul>
                <AddCustomProvider onChange={onChange} />
            </section>
        </>
    );
}
