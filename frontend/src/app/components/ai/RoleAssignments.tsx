"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiApi, ROLE_INFO, type AiHealth, type AiState, type LlmRole, type ProviderView } from "@/lib/aiControlCenterApi";

/** Providers without embedding models. */
const NO_EMBEDDINGS = new Set(["anthropic", "groq", "openrouter"]);

/** Providers a role can use: local servers, plus cloud ones that have a key. */
function usableProviders(state: AiState, role: LlmRole): ProviderView[] {
    return state.providers.filter(
        (p) => (!p.needsKey || p.key.configured || p.envKey) && !(role === "embedding" && (p.kind === "anthropic" || NO_EMBEDDINGS.has(p.id))),
    );
}

export function RoleRow({ role, state, health, onSaved }: { role: LlmRole; state: AiState; health: AiHealth; onSaved: () => void }) {
    const inherits = role === "utility" && !state.roles.utility && !!state.roles.agent;
    const current = state.roles[role] ?? (role === "utility" ? state.roles.agent : undefined);
    const roleHealth = health.roles[role];
    // Keep the saved provider selectable even when it's no longer usable (key removed), so the row reflects reality.
    const providers = state.providers.filter(
        (p) => usableProviders(state, role).includes(p) || p.id === current?.provider,
    );

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
        if (!provider && role === "agent" && !confirm("Remove the assistant's model? The assistant and AI explanations will stop working until you choose one.")) {
            return;
        }
        const target = providers.find((p) => p.id === provider);
        if (target && !target.local && state.localOnly) {
            if (
                !confirm(
                    `${target.label} is a cloud provider and Local-only mode is on.\n\nTurn off Local-only mode so ${ROLE_INFO[role].title.toLowerCase()} can use it? Cap-table details it works with will be sent to ${target.label}.`,
                )
            )
                return;
            await aiApi.setLocalOnly(false);
        }
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
        <div id={`role-${role}`} className="scroll-mt-24 py-5 border-b border-gray-100 last:border-0">
            <div>
                <h3 className="font-medium text-gray-900">{ROLE_INFO[role].title}</h3>
                <p className="text-sm text-gray-500">
                    {ROLE_INFO[role].description}
                    {inherits && " Uses the assistant's model unless you choose another here."}
                </p>
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
                            {p.local ? (/local/i.test(p.label) ? "" : " · on this computer") : " · cloud"}
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
                {modelsError && <span className="text-red-600">Couldn&apos;t load the model list: {modelsError} You can still type a model name.</span>}
                {role === "embedding" && dirty && !!current && (
                    <span className="text-gray-500">
                        Documents you already uploaded fall back to keyword search until you upload them again.
                    </span>
                )}
                {result && (
                    <span className={result.ok ? "text-emerald-700 inline-flex items-center gap-1" : "text-red-600"}>
                        {result.ok && <Check className="h-3 w-3" />}
                        {result.text}
                    </span>
                )}
                {!result && !dirty && (roleHealth.status === "error" || roleHealth.status === "warning") && (
                    <span className={roleHealth.status === "error" ? "text-red-600" : "text-amber-700"}>
                        {roleHealth.title}. {roleHealth.detail}
                    </span>
                )}
            </div>
        </div>
    );
}

function roleKey(state: AiState, role: LlmRole): string {
    const b = state.roles[role];
    return `${role}:${b?.provider}:${b?.model}:${b?.supportsTools}`;
}

/** Primary chat / agent model — shown first on the Control Center. */
export function ChatModelSection({ state, health, onChange }: { state: AiState; health: AiHealth; onChange: () => void }) {
    return (
        <section>
            <h2 className="text-xl font-medium">Chat model</h2>
            <p className="mb-1 text-sm text-gray-500">
                The model the compliance assistant uses. You can also switch it from the chat window.
            </p>
            <RoleRow
                key={roleKey(state, "agent")}
                role="agent"
                state={state}
                health={health}
                onSaved={onChange}
            />
        </section>
    );
}

/** Utility + embedding — quieter secondary section, collapsed by default. */
export function OtherTasksSection({
    state,
    health,
    onChange,
    forceOpen = false,
}: {
    state: AiState;
    health: AiHealth;
    onChange: () => void;
    forceOpen?: boolean;
}) {
    // Parent remounts with forceOpen when a fix action targets this section.
    const [open, setOpen] = useState(forceOpen);
    return (
        <section className="border-t border-gray-100 pt-6">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex w-full items-center justify-between text-left"
            >
                <span>
                    <span className="block text-xl font-medium">Other tasks</span>
                    <span className="block text-sm text-gray-500">
                        Background narratives and document search — usually the same as chat, or a smaller local model.
                    </span>
                </span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="mt-2">
                    {(["utility", "embedding"] as LlmRole[]).map((role) => (
                        <RoleRow
                            key={roleKey(state, role)}
                            role={role}
                            state={state}
                            health={health}
                            onSaved={onChange}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

/** @deprecated Prefer ChatModelSection + OtherTasksSection. */
export function RoleAssignments({ state, health, onChange }: { state: AiState; health: AiHealth; onChange: () => void }) {
    return (
        <>
            <ChatModelSection state={state} health={health} onChange={onChange} />
            <OtherTasksSection state={state} health={health} onChange={onChange} />
        </>
    );
}
