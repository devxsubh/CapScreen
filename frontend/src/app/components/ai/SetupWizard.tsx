"use client";

import { useState } from "react";
import { ArrowLeft, Cloud, HardDrive, X } from "lucide-react";
import type { AiState, LocalState } from "@/lib/aiControlCenterApi";
import { CloudSetup } from "./CloudSetup";
import { LocalSetup } from "./LocalSetup";
import type { ModelDownloader } from "./useModelDownload";

export type SetupPath = "local" | "cloud";

function PathCard({
    icon,
    title,
    points,
    caveat,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    points: string[];
    caveat: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-full flex-col rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-950 hover:bg-gray-50"
        >
            <span className="flex items-center gap-2 text-base font-medium">
                {icon}
                {title}
            </span>
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
                {points.map((p) => (
                    <li key={p} className="flex gap-2">
                        <span className="text-emerald-600">✓</span>
                        {p}
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">{caveat}</p>
        </button>
    );
}

export function SetupWizard({
    state,
    local,
    download,
    initial,
    cloudProvider,
    canClose,
    onClose,
    onDone,
    onKeySaved,
    onLocalChanged,
}: {
    state: AiState;
    local: LocalState | null;
    download: ModelDownloader;
    initial?: SetupPath;
    cloudProvider?: string;
    canClose: boolean;
    onClose: () => void;
    onDone: (message: string) => void;
    onKeySaved: () => void;
    onLocalChanged: () => void;
}) {
    const [path, setPath] = useState<SetupPath | null>(initial ?? null);
    const mem = local?.hardware.totalMemGB;

    return (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
                    {path && (
                        <button
                            type="button"
                            onClick={() => setPath(null)}
                            disabled={!!download.current}
                            className="mt-1 text-gray-400 hover:text-gray-900 disabled:opacity-40"
                            aria-label="Back"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-lg font-medium">
                            {path === "local" ? "Set up on-device AI" : path === "cloud" ? "Set up cloud AI" : "Where should CapScreen's AI run?"}
                        </h2>
                        {!path && <p className="text-sm text-gray-500">You can switch later. Sanctions matching always runs on this computer either way.</p>}
                    </div>
                </div>
                {canClose && (
                    <button type="button" onClick={onClose} disabled={!!download.current} className="text-gray-400 hover:text-gray-900 disabled:opacity-40" aria-label="Close setup">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="mt-5">
                {!path && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <PathCard
                            icon={<HardDrive className="h-5 w-5 text-gray-700" />}
                            title="On this computer"
                            points={["Private: nothing leaves this computer", "Free, no account needed", "Works offline"]}
                            caveat={`Needs a one-time download of 3–6 GB.${mem && mem < 12 ? ` With ${mem} GB of memory, answers take a little while.` : ""}`}
                            onClick={() => setPath("local")}
                        />
                        <PathCard
                            icon={<Cloud className="h-5 w-5 text-gray-700" />}
                            title="Cloud provider"
                            points={["Fastest and most capable answers", "No download", "Works on any computer"]}
                            caveat="Needs your own API key (paid usage). Cap-table details you ask the AI about are sent to the provider."
                            onClick={() => setPath("cloud")}
                        />
                    </div>
                )}
                {path === "local" && (
                    <LocalSetup local={local} download={download} onLocalChanged={onLocalChanged} onDone={onDone} onUseCloud={() => setPath("cloud")} />
                )}
                {path === "cloud" && <CloudSetup state={state} initialProvider={cloudProvider} onKeySaved={onKeySaved} onDone={onDone} />}
            </div>
        </section>
    );
}
