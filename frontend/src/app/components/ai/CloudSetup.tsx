"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { aiApi, AiApiError, CLOUD_CHOICES, type AiState } from "@/lib/aiControlCenterApi";
import { openExternal } from "./useModelDownload";

type KeyStatus =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "error"; message: string }
    | { kind: "rejected"; message: string }
    | { kind: "unverified"; message: string };

type ModelList = { state: "loading" } | { state: "ready"; models: string[]; recommended: string | null } | { state: "failed"; message: string };

export function CloudSetup({
    state,
    initialProvider,
    onKeySaved,
    onDone,
}: {
    state: AiState;
    initialProvider?: string;
    onKeySaved: () => void;
    onDone: (message: string) => void;
}) {
    const [providerId, setProviderId] = useState(
        initialProvider && CLOUD_CHOICES.some((c) => c.id === initialProvider) ? initialProvider : CLOUD_CHOICES[0].id,
    );
    const choice = CLOUD_CHOICES.find((c) => c.id === providerId)!;
    const provider = state.providers.find((p) => p.id === providerId);
    const hasKey = !!provider && (provider.key.configured || provider.envKey);

    const [replacing, setReplacing] = useState(false);
    const [key, setKey] = useState("");
    const [keyStatus, setKeyStatus] = useState<KeyStatus>({ kind: "idle" });
    const [list, setList] = useState<ModelList>({ state: "loading" });
    const [model, setModel] = useState("");
    const [consent, setConsent] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const keyReady = hasKey && !replacing;

    useEffect(() => {
        if (!keyReady) return;
        let cancelled = false;
        aiApi
            .models(providerId)
            .then((r) => {
                if (cancelled) return;
                setList({ state: "ready", models: r.chatModels, recommended: r.recommended });
                setModel(r.recommended ?? r.chatModels[0] ?? "");
            })
            .catch((e: Error) => {
                if (!cancelled) setList({ state: "failed", message: e.message });
            });
        return () => {
            cancelled = true;
        };
    }, [keyReady, providerId]);

    const pickProvider = (id: string) => {
        setProviderId(id);
        setList({ state: "loading" });
        setReplacing(false);
        setKey("");
        setKeyStatus({ kind: "idle" });
        setModel("");
        setError(null);
    };

    const saveKey = async (skipVerify = false) => {
        setKeyStatus({ kind: "checking" });
        try {
            await aiApi.saveKey(providerId, key, { skipVerify });
            setList({ state: "loading" });
            setKey("");
            setReplacing(false);
            setKeyStatus({ kind: "idle" });
            onKeySaved();
        } catch (e) {
            const err = e as AiApiError;
            if (err.reason === "rejected") setKeyStatus({ kind: "rejected", message: err.message });
            else if (err.reason === "unverified") setKeyStatus({ kind: "unverified", message: err.message });
            else setKeyStatus({ kind: "error", message: err.message });
        }
    };

    const finish = async () => {
        setFinishing(true);
        setError(null);
        try {
            const r = await aiApi.quickSetupCloud(providerId, model.trim() || undefined);
            onDone(`Cloud AI is ready: ${r.chat} (${choice.label}) handles the assistant and background tasks. Document search uses ${r.embedding}.`);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setFinishing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-sm font-medium text-gray-900">1. Choose a provider</h4>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cloud provider">
                    {CLOUD_CHOICES.map((c) => {
                        const p = state.providers.find((x) => x.id === c.id);
                        const selected = c.id === providerId;
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => pickProvider(c.id)}
                                    className={`h-full w-full rounded-lg border p-3 text-left transition-colors ${
                                        selected ? "border-black bg-gray-50" : "border-gray-200 hover:border-gray-300"
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                                        {c.label}
                                        {(p?.key.configured || p?.envKey) && <span className="text-[11px] font-normal text-emerald-700">Key saved</span>}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-gray-500">{c.blurb}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div>
                <h4 className="text-sm font-medium text-gray-900">2. Add your {choice.label} API key</h4>
                {keyReady ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                            <Check className="h-4 w-4" />
                            {provider?.key.configured ? `Key saved ${provider.key.hint ?? ""}` : "Using the key from .env (dev)"}
                        </span>
                        <button type="button" onClick={() => setReplacing(true)} className="text-xs text-gray-500 underline hover:text-gray-900">
                            Use a different key
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 space-y-2">
                        <p className="text-xs text-gray-500">
                            Your key is encrypted with this computer&apos;s keychain and is only ever sent to {choice.label}.{" "}
                            <button type="button" onClick={() => openExternal(choice.keyUrl)} className="inline-flex items-center gap-0.5 underline hover:text-gray-900">
                                Get a key <ExternalLink className="h-3 w-3" />
                            </button>
                        </p>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <PasswordInput
                                    value={key}
                                    onChange={(e) => {
                                        setKey(e.target.value);
                                        if (keyStatus.kind !== "checking") setKeyStatus({ kind: "idle" });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && key.trim()) void saveKey();
                                    }}
                                    placeholder={`Paste key (${choice.keyHint})`}
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label={`${choice.label} API key`}
                                />
                            </div>
                            <Button onClick={() => saveKey()} disabled={!key.trim() || keyStatus.kind === "checking"} className="bg-black text-white hover:bg-gray-900">
                                {keyStatus.kind === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                {keyStatus.kind === "checking" ? "Checking…" : "Check and save"}
                            </Button>
                            {replacing && (
                                <Button variant="outline" onClick={() => setReplacing(false)}>
                                    Cancel
                                </Button>
                            )}
                        </div>
                        {keyStatus.kind === "error" && <p className="text-xs text-red-600">{keyStatus.message}</p>}
                        {keyStatus.kind === "rejected" && (
                            <p className="text-xs text-red-600">
                                {keyStatus.message} The key was not saved. Make sure you copied the whole key, and that billing is set up on
                                your {choice.label} account.
                            </p>
                        )}
                        {keyStatus.kind === "unverified" && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                                Couldn&apos;t check the key: {keyStatus.message}
                                <div className="mt-2 flex gap-2">
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveKey()}>
                                        Try again
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveKey(true)}>
                                        Save without checking
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={keyReady ? "" : "pointer-events-none opacity-40"} aria-disabled={!keyReady}>
                <h4 className="text-sm font-medium text-gray-900">3. Pick a model</h4>
                {!keyReady ? (
                    <p className="mt-1 text-xs text-gray-500">Available once your key is saved.</p>
                ) : list.state === "loading" ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading the models your key can use…
                    </p>
                ) : list.state === "ready" && list.models.length > 0 ? (
                    <div className="mt-2">
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="h-9 w-full max-w-md rounded-md border border-gray-200 bg-white px-2 text-sm"
                            aria-label="Model"
                        >
                            {list.models.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                    {m === list.recommended ? " (recommended)" : ""}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">The recommended model balances quality and cost. You can change it any time.</p>
                    </div>
                ) : (
                    <div className="mt-2 max-w-md space-y-1">
                        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Leave empty for the recommended model" aria-label="Model" />
                        <p className="text-xs text-amber-700">
                            {list.state === "failed" ? `Couldn't load the model list: ${list.message}` : `${choice.label} didn't list any models.`} Type a
                            model name, or leave it empty.
                        </p>
                    </div>
                )}
            </div>

            <div className={keyReady ? "" : "pointer-events-none opacity-40"} aria-disabled={!keyReady}>
                <h4 className="text-sm font-medium text-gray-900">4. Confirm what gets shared</h4>
                <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-gray-800">
                    <input type="checkbox" className="mt-1" checked={consent} disabled={!keyReady} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                        <span className="flex items-center gap-1.5 font-medium">
                            <ShieldAlert className="h-4 w-4 text-amber-600" /> I understand what leaves this computer
                        </span>
                        <span className="mt-1 block text-xs text-gray-600">
                            When you use the AI, entity names, ownership details and document passages it works with are sent to {choice.label}.
                            Sanctions matching itself still runs on this computer.
                            {state.localOnly && " This turns off Local-only mode."}
                        </span>
                    </span>
                </label>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button onClick={finish} disabled={!keyReady || !consent || finishing || list.state === "loading"} className="bg-black text-white hover:bg-gray-900">
                {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Finish setup
            </Button>
        </div>
    );
}
