import { driver, type Driver, type DriveStep } from "driver.js";

/** Bump the version when the tour changes so everyone sees the new one once. */
export const TOUR_STORAGE_KEY = "capscreen_onboarding_tour_v2";
const TOUR_EVENT = "capscreen-tour-change";

export function hasCompletedTour(): boolean {
    if (typeof window === "undefined") return true;
    try {
        return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
    } catch {
        return true;
    }
}

function setTourCompleted(done: boolean): void {
    if (typeof window === "undefined") return;
    try {
        if (done) localStorage.setItem(TOUR_STORAGE_KEY, "true");
        else localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {
        // Storage unavailable: the tour may show again next launch.
    }
    window.dispatchEvent(new Event(TOUR_EVENT));
}

export function markTourCompleted(): void {
    setTourCompleted(true);
}

/** For useSyncExternalStore: re-read hasCompletedTour() when the tour finishes or is reset. */
export function subscribeTourCompletion(onChange: () => void): () => void {
    window.addEventListener(TOUR_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(TOUR_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}

/** Sidebar step: points at the element when it's on screen, otherwise shows centred. */
function step(tour: string, title: string, description: string, side: "right" | "top" | "bottom" | "left" = "right"): DriveStep {
    return { element: `[data-tour="${tour}"]`, popover: { title, description, side, align: "start" } };
}

/** The tour runs on the assistant home, where the sidebar and the chat box are both visible. */
const STEPS: DriveStep[] = [
    {
        popover: {
            title: "Welcome to CapScreen",
            description:
                "CapScreen screens startup cap tables for sanctions risk: every owner is checked against OFAC, EU, UK and UN lists, ownership is traced through holding companies, and an assistant explains what it found. Everything stays on this computer. This tour takes about a minute.",
            side: "over",
            align: "center",
        },
    },
    step(
        "composer",
        "Ask the assistant",
        "Type a question here. Attach a cap-table CSV and the assistant runs a sanctions screen; type @ and a startup's name to bring its saved results into the conversation.",
        "top",
    ),
    step(
        "composer-sources",
        "Files & Sources",
        "Add PDFs, Word files or a cap-table CSV, reopen documents you've uploaded, and see which sanctions lists are switched on.",
        "top",
    ),
    step(
        "composer-tools",
        "Tools",
        "Point the assistant at a job: run a sanctions screen, review matches, trace ownership to the ultimate owners, research the web, or draft an IC memo.",
        "top",
    ),
    step(
        "composer-model",
        "Model",
        "Choose which AI answers. Connect your own API key for Claude, Gemini or OpenAI, or run a model privately on this computer.",
        "top",
    ),
    step(
        "getting-started",
        "Getting started",
        "Your first steps, in order. Each one ticks itself off as you go, and the list disappears when you're done.",
        "top",
    ),
    step("nav-assistant", "New chat", "Start a fresh conversation at any time. Shortcut: Shift + Cmd + O (Ctrl on Windows)."),
    step("nav-search", "Search", "Find an earlier chat by title or startup. Shortcut: Cmd + K (Ctrl on Windows)."),
    step(
        "nav-startups",
        "Startups",
        "Start here. Each startup is one deal's workspace: its cap-table files, screening results, ownership graph, documents, and a chat that already knows the deal.",
    ),
    step(
        "nav-tabular",
        "Tabular reviews",
        "Pull the same fields out of many documents into one grid, and sign off row by row.",
    ),
    step(
        "nav-workflows",
        "Workflows",
        "Saved instructions such as the Cap Table Sanctions Screen. Pick one from Workflows in the chat to run it on a startup.",
    ),
    step(
        "ai-status",
        "AI status",
        "The model the assistant is using and whether it's working (green is good). Click to set up or change AI.",
    ),
    step(
        "nav-settings",
        "Settings",
        "Match thresholds, sanctions lists, connectors, backups, and this tour if you want to see it again.",
    ),
    {
        popover: {
            title: "You're ready",
            description:
                "Create your first startup and upload its cap table — the checklist on this page walks you through it. CapScreen narrows what needs a closer look; a person always makes the final call.",
            side: "over",
            align: "center",
        },
    },
];

export function createTourDriver(opts: { onComplete?: () => void }): Driver {
    return driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "#0a0a0a",
        overlayOpacity: 0.5,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: "capscreen-tour-popover",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Get started",
        progressText: "{{current}} of {{total}}",
        // Skip steps whose element isn't on screen (e.g. AI status before AI is set up).
        steps: STEPS.filter((s) => !s.element || typeof document === "undefined" || document.querySelector(s.element as string)),
        onDestroyed: () => {
            opts.onComplete?.();
        },
    });
}
