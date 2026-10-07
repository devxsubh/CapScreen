import { driver, type Driver } from "driver.js";

export const TOUR_STORAGE_KEY = "capscreen_onboarding_tour_v1";

export function hasCompletedTour(): boolean {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

export function markTourCompleted(): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

export function resetTourCompletion(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOUR_STORAGE_KEY);
}

export function createTourDriver(opts: { onComplete?: () => void }): Driver {
    return driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "#0f172a",
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 10,
        popoverClass: "capscreen-tour-popover",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Get started",
        progressText: "{{current}} of {{total}}",
        steps: [
            {
                popover: {
                    title: "Welcome to CapScreen",
                    description:
                        "This workspace helps you screen cap tables for sanctions risk — with ownership graphs, structured grids, and AI-assisted review. We'll show you the key areas in under a minute.",
                    side: "over",
                    align: "center",
                },
            },
            {
                element: '[data-tour="nav-assistant"]',
                popover: {
                    title: "Assistant",
                    description:
                        "Your centralized compliance brain. Ask portfolio-wide questions and @mention startups to pull completed screenings into context.",
                    side: "right",
                    align: "start",
                },
            },
            {
                element: '[data-tour="nav-startups"]',
                popover: {
                    title: "Startups",
                    description:
                        "Each startup is a per-deal workspace. Upload a cap-table CSV, run a sanctions screen, and review the ownership graph with scoped chat beside it.",
                    side: "right",
                    align: "start",
                },
            },
            {
                element: '[data-tour="nav-tabular"]',
                popover: {
                    title: "Tabular Review",
                    description:
                        "Review every entity in a grid — sort flagged rows to the top and track human sign-off across your portfolio.",
                    side: "right",
                    align: "start",
                },
            },
            {
                element: '[data-tour="nav-workflows"]',
                popover: {
                    title: "Workflows",
                    description:
                        "Reusable saved analyses, including Cap Table Sanctions Screen and Cap Table Sanctions Review. Run them from the Assistant or on demand.",
                    side: "right",
                    align: "start",
                },
            },
            {
                element: '[data-tour="recent-projects"]',
                popover: {
                    title: "Recent Projects",
                    description:
                        "Quick access to startups you've been working on. Create a new one from the Startups tab when you're ready to screen your first cap table.",
                    side: "right",
                    align: "start",
                },
            },
            {
                popover: {
                    title: "You're all set",
                    description:
                        "Head to Startups to create your first deal workspace, or open Workflows to try the built-in sanctions screen. The tool narrows what you review — you always make the final call.",
                    side: "over",
                    align: "center",
                },
            },
        ],
        onDestroyed: () => {
            opts.onComplete?.();
        },
    });
}
