"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi } from "@/lib/aiControlCenterApi";
import { listStartups, type StartupRecord } from "@/lib/startupsApi";
import { hasCompletedTour, subscribeTourCompletion } from "@/lib/onboardingTour";
import { useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
import { useOnboardingTour } from "@/app/contexts/OnboardingTourContext";

const HIDE_KEY = "capscreen.gettingStarted.hidden";
const hideListeners = new Set<() => void>();

function readHidden(): boolean {
    try {
        return localStorage.getItem(HIDE_KEY) === "true";
    } catch {
        return false;
    }
}

function subscribeHidden(onChange: () => void) {
    hideListeners.add(onChange);
    return () => {
        hideListeners.delete(onChange);
    };
}

type Step = {
    id: string;
    title: string;
    detail: string;
    done: boolean;
    action?: { label: string; onClick: () => void; disabled?: boolean };
};

/** First-run checklist on the assistant home. Each step ticks itself off from what's actually in the app. */
export function GettingStarted() {
    const router = useRouter();
    const { chats } = useChatHistoryContext();
    const { startTour } = useOnboardingTour();
    const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => true);
    const tourDone = useSyncExternalStore(subscribeTourCompletion, hasCompletedTour, () => true);
    const [aiReady, setAiReady] = useState<boolean | null>(null);
    const [startups, setStartups] = useState<StartupRecord[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        aiApi
            .health()
            .then((h) => !cancelled && setAiReady(h.overall !== "not-set-up"))
            .catch(() => !cancelled && setAiReady(false));
        listStartups()
            .then((s) => !cancelled && setStartups(s))
            .catch(() => !cancelled && setStartups([]));
        return () => {
            cancelled = true;
        };
    }, []);

    const hide = useCallback(() => {
        try {
            localStorage.setItem(HIDE_KEY, "true");
        } catch {
            // Storage unavailable: hidden until the page reloads is fine.
        }
        hideListeners.forEach((l) => l());
    }, []);

    if (hidden || aiReady === null || startups === null) return null;

    const first = startups[0];
    const unscreened = startups.find((s) => !s.lastScreenedAt) ?? first;
    const screened = startups.some((s) => !!s.lastScreenedAt);

    const steps: Step[] = [
        {
            id: "ai",
            title: "Set up AI",
            detail: "Use a cloud model with your own API key, or run one privately on this computer.",
            done: aiReady,
            action: { label: "Open AI Control", onClick: () => router.push("/settings/ai") },
        },
        {
            id: "startup",
            title: "Create your first startup",
            detail: "One workspace per deal, named after the company.",
            done: startups.length > 0,
            action: { label: "New startup", onClick: () => router.push("/startups?new=1") },
        },
        {
            id: "screen",
            title: "Upload and screen a cap table",
            detail: "Add the cap-table CSV. Every owner is checked against OFAC, EU, UK and UN lists.",
            done: screened,
            action: {
                label: "Open startup",
                onClick: () => unscreened && router.push(`/startups/${unscreened.id}`),
                disabled: !unscreened,
            },
        },
        {
            id: "ask",
            title: "Ask the assistant about it",
            detail: "Type @ and the startup's name to bring its results into the chat.",
            done: (chats?.length ?? 0) > 0,
            action: {
                label: "Try it",
                onClick: () => document.querySelector<HTMLTextAreaElement>('[data-tour="composer"] textarea')?.focus(),
            },
        },
        {
            id: "tour",
            title: "Take the one-minute tour",
            detail: "See where everything is. You can replay it from Settings → Profile.",
            done: tourDone,
            action: { label: "Start tour", onClick: () => startTour({ force: true }) },
        },
    ];

    const doneCount = steps.filter((s) => s.done).length;
    if (doneCount === steps.length) return null;
    const nextId = steps.find((s) => !s.done)?.id;

    return (
        <section
            data-tour="getting-started"
            aria-label="Getting started"
            className="mt-8 rounded-2xl bg-white p-5 text-left shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-eb-garamond text-xl font-medium text-gray-950">Getting started</h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                        {doneCount} of {steps.length} done · each step ticks itself off as you go.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={hide}
                    title="Hide the checklist"
                    aria-label="Hide the checklist"
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-gray-800"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gray-950 transition-[width] duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="mt-4 space-y-1">
                {steps.map((step, i) => {
                    const isNext = step.id === nextId;
                    return (
                        <li
                            key={step.id}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isNext ? "bg-gray-50" : ""}`}
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                                    step.done
                                        ? "bg-emerald-600 text-white"
                                        : "bg-white text-gray-600 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                                }`}
                            >
                                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={`block text-sm ${step.done ? "text-gray-400 line-through" : "font-medium text-gray-900"}`}>
                                    {step.title}
                                </span>
                                {!step.done && <span className="block text-xs text-gray-500">{step.detail}</span>}
                            </span>
                            {!step.done && step.action && (
                                <Button
                                    size="sm"
                                    variant={isNext ? "default" : "ghost"}
                                    disabled={step.action.disabled}
                                    onClick={step.action.onClick}
                                    className="shrink-0"
                                >
                                    {step.action.label}
                                    {isNext && <ArrowRight className="h-3.5 w-3.5" />}
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
