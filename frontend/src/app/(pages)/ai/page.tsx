"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    aiApi,
    OLLAMA_DOWNLOAD_URL,
    type AiHealth,
    type AiState,
    type FixAction,
    type LlmRole,
    type LocalState,
} from "@/lib/aiControlCenterApi";
import { AiStatusCard } from "@/app/components/ai/AiStatusCard";
import { SetupWizard, type SetupPath } from "@/app/components/ai/SetupWizard";
import { ChatModelSection, OtherTasksSection } from "@/app/components/ai/RoleAssignments";
import { LocalModels } from "@/app/components/ai/LocalModels";
import { ProviderList } from "@/app/components/ai/ProviderList";
import { openExternal, useModelDownload } from "@/app/components/ai/useModelDownload";

type Wizard = { open: boolean; path?: SetupPath; provider?: string };

export default function AiControlCenterPage() {
    const [state, setState] = useState<AiState | null>(null);
    const [local, setLocal] = useState<LocalState | null>(null);
    const [health, setHealth] = useState<AiHealth | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [wizard, setWizard] = useState<Wizard>({ open: false });
    const [notice, setNotice] = useState<string | null>(null);
    const [busyFix, setBusyFix] = useState<string | null>(null);
    const [fixError, setFixError] = useState<string | null>(null);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [expandProvider, setExpandProvider] = useState<string | null>(null);
    const [forceOtherTasks, setForceOtherTasks] = useState(false);
    const autoOpened = useRef(false);

    const checkHealth = useCallback(async (fresh = true) => {
        setChecking(true);
        try {
            setHealth(await aiApi.health(fresh));
        } catch {
            // The status card keeps its last result; loadError covers a dead backend.
        } finally {
            setChecking(false);
        }
    }, []);

    const refresh = useCallback(async () => {
        try {
            const [s, l] = await Promise.all([aiApi.state(), aiApi.local()]);
            setState(s);
            setLocal(l);
            setLoadError(null);
        } catch (e) {
            setLoadError((e as Error).message);
        }
        void checkHealth(true);
    }, [checkHealth]);

    const download = useModelDownload(refresh);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // First visit with nothing configured: go straight to setup.
    useEffect(() => {
        if (health?.overall === "not-set-up" && !autoOpened.current) {
            autoOpened.current = true;
            setWizard({ open: true });
        }
    }, [health?.overall]);

    // While Ollama is down, keep checking so installing or opening it "just works".
    const ollamaRunning = local?.ollama.running;
    useEffect(() => {
        if (ollamaRunning !== false) return;
        const t = setInterval(() => {
            void aiApi
                .local()
                .then((l) => {
                    setLocal(l);
                    if (l.ollama.running) void checkHealth(true);
                })
                .catch(() => {});
        }, 3000);
        return () => clearInterval(t);
    }, [ollamaRunning, checkHealth]);

    // Problems can fix themselves (network back, server started elsewhere).
    useEffect(() => {
        if (health?.overall !== "attention") return;
        const t = setInterval(() => void checkHealth(false), 20_000);
        return () => clearInterval(t);
    }, [health?.overall, checkHealth]);

    const reveal = (id: string) => {
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                const el = document.getElementById(id);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true });
            }),
        );
    };

    const setLocalOnly = async (on: boolean) => {
        setSavingPolicy(true);
        try {
            await aiApi.setLocalOnly(on);
            await refresh();
        } finally {
            setSavingPolicy(false);
        }
    };

    const toggleLocalOnly = () => {
        if (!health) return;
        const cloud = Object.values(health.roles).filter((r) => r.binding && !r.binding.local);
        if (!health.localOnly) {
            if (
                cloud.length &&
                !confirm(
                    `Turn on Local-only mode?\n\n${[...new Set(cloud.map((r) => r.binding!.label))].join(", ")} is a cloud provider, so the AI features using it will stop until you pick on-device models.`,
                )
            )
                return;
        } else if (!confirm("Turn off Local-only mode?\n\nCloud models you choose will be allowed to receive cap-table details you ask the AI about.")) {
            return;
        }
        void setLocalOnly(!health.localOnly);
    };

    const onFix = async (fix: FixAction, role: LlmRole) => {
        setFixError(null);
        switch (fix.action) {
            case "setup":
                setWizard({ open: true });
                return;
            case "get-ollama":
                openExternal(OLLAMA_DOWNLOAD_URL);
                setWizard({ open: true, path: "local" });
                return;
            case "download-model":
                if (await download.start(fix.model)) setNotice(`${fix.model} is downloaded.`);
                return;
            case "add-key":
                setExpandProvider(fix.provider);
                reveal(`provider-${fix.provider}`);
                return;
            case "edit-role":
                if (role === "utility" || role === "embedding") setForceOtherTasks(true);
                reveal(`role-${role}`);
                return;
            case "turn-off-local-only":
                if (confirm("Allow cloud AI?\n\nThis turns off Local-only mode. Cloud models you choose will receive cap-table details you ask the AI about.")) {
                    await setLocalOnly(false);
                }
                return;
            case "start-ollama":
                setBusyFix(`${role}:${fix.action}`);
                try {
                    await aiApi.startOllama();
                    setNotice("Ollama is running.");
                } catch (e) {
                    setFixError((e as Error).message);
                } finally {
                    setBusyFix(null);
                    await refresh();
                }
                return;
        }
    };

    const finishSetup = (message: string) => {
        setWizard({ open: false });
        setNotice(message);
        void refresh();
    };

    // Hide dense sections only on first-run (wizard owns the screen). After setup, keep them while the wizard is open for "Change how AI runs".
    const showDetails = Boolean(health && health.overall !== "not-set-up");

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <header className="mx-auto flex w-full max-w-3xl shrink-0 flex-col px-6 pt-10 pb-4">
                <h1 className="text-4xl font-medium font-eb-garamond">AI Control Center</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Choose where CapScreen&apos;s AI runs — on this computer, or with your own cloud API key.
                </p>
            </header>
            <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 pb-16">
                {loadError && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <span>Couldn&apos;t load AI settings: {loadError}</span>
                        <Button size="sm" variant="outline" onClick={() => void refresh()}>
                            Retry
                        </Button>
                    </div>
                )}
                {notice && (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="flex-1">{notice}</span>
                        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-700 hover:text-emerald-900">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {!state || !health ? (
                    !loadError && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Checking your AI setup…
                        </div>
                    )
                ) : (
                    <>
                        {!(wizard.open && health.overall === "not-set-up") && (
                            <AiStatusCard
                                health={health}
                                checking={checking}
                                busyFix={busyFix}
                                download={download}
                                savingPolicy={savingPolicy}
                                onFix={(f, r) => void onFix(f, r)}
                                onRecheck={() => void refresh()}
                                onChangeSetup={() => setWizard({ open: true })}
                                onToggleLocalOnly={toggleLocalOnly}
                            />
                        )}
                        {fixError && <p className="-mt-4 text-xs text-red-600">{fixError}</p>}

                        {wizard.open && (
                            <SetupWizard
                                key={`${wizard.path ?? ""}:${wizard.provider ?? ""}`}
                                state={state}
                                local={local}
                                download={download}
                                initial={wizard.path}
                                cloudProvider={wizard.provider}
                                canClose={health.overall !== "not-set-up"}
                                onClose={() => setWizard({ open: false })}
                                onDone={finishSetup}
                                onKeySaved={() => void refresh()}
                                onLocalChanged={() => void refresh()}
                            />
                        )}

                        {showDetails && (
                            <>
                                <ChatModelSection state={state} health={health} onChange={() => void refresh()} />
                                <ProviderList
                                    key={expandProvider ?? "providers"}
                                    state={state}
                                    onChange={() => void refresh()}
                                    expandProvider={expandProvider}
                                />
                                {local && (
                                    <LocalModels local={local} state={state} download={download} onChange={() => void refresh()} />
                                )}
                                <OtherTasksSection
                                    key={forceOtherTasks ? "other-open" : "other"}
                                    state={state}
                                    health={health}
                                    onChange={() => void refresh()}
                                    forceOpen={forceOtherTasks}
                                />
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
