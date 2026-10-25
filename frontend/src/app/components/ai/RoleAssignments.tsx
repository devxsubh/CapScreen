"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, HardDrive, Loader2, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiApi, ROLE_INFO, type AiState, type LlmRole, type ProviderView } from "@/lib/aiControlCenterApi";

/** Providers a role can use: local servers, plus cloud ones that have a key. */
function usableProviders(state: AiState): ProviderView[] {
    return state.providers.filter((p) => !p.needsKey || p.key.configured || p.envKey);
}

function RoleRow({ role, state, onSaved }: { role: LlmRole; state: AiState; onSaved: () => void }) {
    const current = state.roles[role] ?? (role === "utility" ? state.roles.agent : undefined);
    const effective = state.effective.roles[role];
    const providers = usableProviders(state);

    const [provider, setProvider] = useState(current?.provider ?? "");
    const [model, setModel] = useState(current?.model ?? "");
    const [supportsTools, setSupportsTools] = useState<boolean | undefined>(current?.supportsTools);
    const [models, setModels] = useState<string[]>([]);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"save" | "test" | null>(null);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (!provider) return;
        let cancelled = false;
        aiApi
            .models(provider)
            .then((r) => {
                if (cancelled) return;
                setModels(r.models);
                setModelsError(null);
            })
            .catch((e: Error) => {
                if (cancelled) return;
                setModels([]);
                setModelsError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, [provider]);

    const filteredModels =
        role === "embedding" ? models.filter((m) => /embed/i.test(m)) : models.filter((m) => !/embed/i.test(m));

    const probe = async (p: string, m: string) => {
        if (role === "embedding" || !p || !m) return;
        try {
            const r = await aiApi.probeTools(p, m);
            setSupportsTools(r.supportsTools);
        } catch {
            setSupportsTools(undefined);
        }
    };

    const dirty =
        provider !== (current?.provider ?? "") ||
        model !== (current?.model ?? "") ||
        supportsTools !== current?.supportsTools;

    const save = async () => {
        setBusy("save");
        setResult(null);
        try {
            await aiApi.saveRoles({
                [role]: provider && model ? { provider, model, ...(role !== "embedding" ? { supportsTools } : {}) } : null,
            });
            setResult({ ok: true, text: "Saved" });
            onSaved();
        } catch (e) {
            setResult({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const test = async () => {
        if (!provider || !model) return;
        setBusy("test");
        setResult(null);
        try {
            if (role === "embedding") {
                const r = await aiApi.test(provider);
                setResult({ ok: r.ok, text: r.ok ? `Reachable · ${r.latencyMs} ms` : (r.error ?? "Failed") });
            } else {
                const r = await aiApi.test(provider, model);
                setResult({
                    ok: r.ok,
                    text: r.ok ? `Replied “${r.reply}” in ${(r.latencyMs / 1000).toFixed(1)} s` : (r.error ?? "Failed"),
                });
            }
        } catch (e) {
            setResult({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const selected = providers.find((p) => p.id === provider);
    const listId = `models-${role}`;

    return (
        <div className="py-5 border-b border-gray-100 last:border-0">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-medium text-gray-900">{ROLE_INFO[role].title}</h3>
                    <p className="text-sm text-gray-500">{ROLE_INFO[role].description}</p>
                </div>
                {effective && (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                            effective.error
                                ? "bg-red-50 text-red-700"
                                : effective.local
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                        }`}
                    >
                        {effective.local ? <HardDrive className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                        {effective.error ? "Blocked" : effective.local ? "On-device" : "Cloud"}
                    </span>
                )}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
                <select
                    value={provider}
                    onChange={(e) => {
                        setProvider(e.target.value);
                        setModel("");
                        setSupportsTools(undefined);
                    }}
                    className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                    aria-label={`${ROLE_INFO[role].title} provider`}
                >
                    <option value="">{role === "embedding" ? "Off (keyword search)" : "Choose provider…"}</option>
                    {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.label}
                            {p.local ? " · local" : ""}
                        </option>
                    ))}
                </select>
                <div>
                    <Input
                        list={listId}
                        value={model}
                        disabled={!provider}
                        placeholder={provider ? "Model name" : "Pick a provider first"}
                        onChange={(e) => setModel(e.target.value)}
                        onBlur={() => probe(provider, model)}
                        aria-label={`${ROLE_INFO[role].title} model`}
                    />
                    <datalist id={listId}>
                        {filteredModels.map((m) => (
                            <option key={m} value={m} />
                        ))}
                    </datalist>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={test} disabled={!provider || !model || busy !== null}>
                        {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        Test
                    </Button>
                    <Button
                        onClick={save}
                        disabled={!dirty || busy !== null || (!!provider && !model)}
                        className="bg-black hover:bg-gray-900 text-white"
                    >
                        {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {role !== "embedding" && provider && model && (
                    <label className="inline-flex items-center gap-1.5 text-gray-600">
                        <input
                            type="checkbox"
                            checked={supportsTools !== false}
                            onChange={(e) => setSupportsTools(e.target.checked)}
                        />
                        <Wrench className="h-3 w-3" />
                        Tool calling
                        {supportsTools === false && (
                            <span className="text-amber-700">
                                — off: the assistant can&apos;t run screenings with this model
                            </span>
                        )}
                    </label>
                )}
                {selected && !selected.local && (
                    <span className="text-amber-700">Requests to this model leave your computer.</span>
                )}
                {modelsError && <span className="text-red-600">Couldn&apos;t list models: {modelsError}</span>}
                {result && (
                    <span className={result.ok ? "text-emerald-700 inline-flex items-center gap-1" : "text-red-600"}>
                        {result.ok && <Check className="h-3 w-3" />}
                        {result.text}
                    </span>
                )}
                {effective?.error && !result && <span className="text-red-600">{effective.error}</span>}
            </div>
        </div>
    );
}

export function RoleAssignments({ state, onChange }: { state: AiState; onChange: () => void }) {
    return (
        <section>
            <h2 className="text-2xl font-medium font-serif">Model assignments</h2>
            <p className="text-sm text-gray-500 mb-1">Choose which model handles each kind of work.</p>
            <div>
                {(["agent", "utility", "embedding"] as LlmRole[]).map((role) => {
                    const b = state.roles[role];
                    // Remount when the saved binding changes so the form resets to it.
                    return (
                        <RoleRow
                            key={`${role}:${b?.provider}:${b?.model}:${b?.supportsTools}`}
                            role={role}
                            state={state}
                            onSaved={onChange}
                        />
                    );
                })}
            </div>
        </section>
    );
}
