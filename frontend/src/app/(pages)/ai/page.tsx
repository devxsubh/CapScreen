"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { aiApi, type AiState, type LocalState } from "@/lib/aiControlCenterApi";
import { PrivacyCard } from "@/app/components/ai/PrivacyCard";
import { RoleAssignments } from "@/app/components/ai/RoleAssignments";
import { LocalModels } from "@/app/components/ai/LocalModels";
import { ProviderList } from "@/app/components/ai/ProviderList";

export default function AiControlCenterPage() {
    const [state, setState] = useState<AiState | null>(null);
    const [local, setLocal] = useState<LocalState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [s, l] = await Promise.all([aiApi.state(), aiApi.local()]);
            setState(s);
            setLocal(l);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // While Ollama is missing, keep checking so installing it "just works".
    useEffect(() => {
        if (!local || local.ollama.running) return;
        const t = setInterval(() => void aiApi.local().then(setLocal).catch(() => {}), 5000);
        return () => clearInterval(t);
    }, [local]);

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <header className="mx-auto flex w-full max-w-3xl shrink-0 flex-col px-6 pt-10 pb-4">
                <h1 className="text-4xl font-medium font-eb-garamond">AI Control Center</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Choose where CapScreen&apos;s AI runs — on this computer, or with your own cloud keys.
                </p>
            </header>
            <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16 space-y-10">
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}
                {!state ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : (
                    <>
                        <PrivacyCard state={state} onChange={refresh} />
                        <RoleAssignments state={state} onChange={refresh} />
                        <LocalModels local={local} onChange={refresh} />
                        <ProviderList state={state} onChange={refresh} />
                    </>
                )}
            </main>
        </div>
    );
}
