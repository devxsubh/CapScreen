"use client";

import { AlertTriangle, CheckCircle2, Cloud, HardDrive, Loader2, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_INFO, type AiHealth, type FixAction, type LlmRole, type RoleHealth } from "@/lib/aiControlCenterApi";
import type { ModelDownloader } from "./useModelDownload";

const DOT: Record<RoleHealth["status"], string> = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    off: "bg-gray-300",
};

function headline(h: AiHealth): { title: string; subtitle: string; tone: "ok" | "warn" | "new" } {
    if (h.overall === "not-set-up") {
        return {
            title: "AI isn't set up yet",
            subtitle: "Sanctions screening works without it. Set up AI to use the assistant, match explanations and document search.",
            tone: "new",
        };
    }
    const bindings = Object.values(h.roles).flatMap((r) => (r.binding ? [r.binding] : []));
    const cloud = [...new Set(bindings.filter((b) => !b.local).map((b) => b.label))];
    const where =
        cloud.length === 0
            ? "Runs on this computer — nothing leaves it."
            : `Uses ${cloud.join(" and ")} in the cloud. Cap-table details you ask the AI about are sent there.`;
    if (h.overall === "ready") return { title: "AI is ready", subtitle: where, tone: "ok" };
    return { title: "AI needs attention", subtitle: where, tone: "warn" };
}

/** Same fix for the same cause (e.g. one "Start Ollama" for every task that needs it). */
function fixId(f: FixAction): string {
    return f.action === "download-model" ? `${f.action}:${f.model}` : f.action === "add-key" ? `${f.action}:${f.provider}` : f.action;
}

function RoleLine({
    r,
    sameAsAgent,
    showFix,
    busyFix,
    download,
    onFix,
}: {
    r: RoleHealth;
    sameAsAgent: boolean;
    showFix: boolean;
    busyFix: string | null;
    download: ModelDownloader;
    onFix: (fix: FixAction, role: LlmRole) => void;
}) {
    const downloading = r.fix?.action === "download-model" && download.current?.model === r.fix.model;
    const fixKey = r.fix ? `${r.role}:${r.fix.action}` : null;
    return (
        <li className="flex items-start gap-3 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[r.status]}`} aria-hidden />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-gray-900">{ROLE_INFO[r.role].title}</span>
                    {r.binding && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            {r.binding.local ? <HardDrive className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                            {sameAsAgent ? "same model as the assistant" : `${r.binding.model} · ${r.binding.local ? "on this computer" : r.binding.label}`}
                        </span>
                    )}
                </div>
                {r.status === "ok" ? (
                    <p className="text-xs text-emerald-700">Ready</p>
                ) : (
                    <p className="text-xs text-gray-600">
                        <span className={r.status === "error" ? "font-medium text-red-700" : r.status === "warning" ? "font-medium text-amber-700" : "text-gray-700"}>
                            {r.title}.
                        </span>{" "}
                        {/* The first row with this cause already explains it. */}
                        {r.fix && !showFix ? "" : r.detail}
                    </p>
                )}
                {downloading && download.current && (
                    <div className="mt-2 max-w-sm">
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full bg-black transition-[width] duration-300" style={{ width: `${download.current.percent ?? 2}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                            {download.current.status}
                            {download.current.progress ? ` · ${download.current.progress}` : ""}
                        </p>
                    </div>
                )}
            </div>
            {r.fix && showFix && (
                downloading ? (
                    <Button variant="outline" size="sm" onClick={download.cancel} className="h-8 shrink-0 text-xs">
                        <X className="h-3 w-3" /> Cancel
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={() => onFix(r.fix!, r.role)}
                        disabled={busyFix !== null || (r.fix.action === "download-model" && !!download.current)}
                        className={`h-8 shrink-0 text-xs ${r.status === "error" ? "bg-black text-white hover:bg-gray-900" : ""}`}
                        variant={r.status === "error" ? "default" : "outline"}
                    >
                        {busyFix === fixKey && <Loader2 className="h-3 w-3 animate-spin" />}
                        {r.fix.label}
                    </Button>
                )
            )}
        </li>
    );
}

export function AiStatusCard({
    health,
    checking,
    busyFix,
    download,
    savingPolicy,
    onFix,
    onRecheck,
    onChangeSetup,
    onToggleLocalOnly,
}: {
    health: AiHealth;
    checking: boolean;
    busyFix: string | null;
    download: ModelDownloader;
    savingPolicy: boolean;
    onFix: (fix: FixAction, role: LlmRole) => void;
    onRecheck: () => void;
    onChangeSetup: () => void;
    onToggleLocalOnly: () => void;
}) {
    const h = headline(health);
    const roles = (["agent", "utility", "embedding"] as LlmRole[]).map((r) => health.roles[r]);
    const agent = health.roles.agent;

    const tone =
        h.tone === "ok"
            ? { box: "border-emerald-200 bg-emerald-50/50", icon: <CheckCircle2 className="h-6 w-6 text-emerald-600" /> }
            : h.tone === "warn"
              ? { box: "border-amber-200 bg-amber-50/50", icon: <AlertTriangle className="h-6 w-6 text-amber-600" /> }
              : { box: "border-gray-200 bg-gray-50", icon: <Sparkles className="h-6 w-6 text-gray-700" /> };

    return (
        <section className={`rounded-xl border p-5 ${tone.box}`} aria-live="polite">
            <div className="flex items-start gap-4">
                <div className="mt-0.5 shrink-0">{tone.icon}</div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-medium">{h.title}</h2>
                    <p className="mt-0.5 text-sm text-gray-600">{h.subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onRecheck} disabled={checking} className="h-8 text-xs text-gray-600" title="Check again">
                        <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Check again</span>
                    </Button>
                </div>
            </div>

            {health.overall === "not-set-up" ? (
                <div className="mt-4">
                    <Button onClick={onChangeSetup} className="bg-black text-white hover:bg-gray-900">
                        <Sparkles className="h-4 w-4" /> Set up AI
                    </Button>
                </div>
            ) : (
                <>
                    <ul className="mt-3 divide-y divide-black/5 rounded-lg border border-black/5 bg-white/70 px-4">
                        {roles.map((r, i) => {
                            const earlier = roles.slice(0, i).some((o) => o.fix && r.fix && fixId(o.fix) === fixId(r.fix));
                            return (
                                <RoleLine
                                    key={r.role}
                                    r={r}
                                    sameAsAgent={
                                        r.role === "utility" &&
                                        !!agent.binding &&
                                        r.binding?.provider === agent.binding.provider &&
                                        r.binding?.model === agent.binding.model
                                    }
                                    showFix={!earlier}
                                    busyFix={busyFix}
                                    download={download}
                                    onFix={onFix}
                                />
                            );
                        })}
                    </ul>
                    {download.error && (
                        <p className="mt-2 text-xs text-red-700">
                            Couldn&apos;t download {download.error.model}: {download.error.message}
                        </p>
                    )}
                </>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
                <label className="flex cursor-pointer select-none items-start gap-3">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={health.localOnly}
                        aria-label="Local-only mode"
                        disabled={savingPolicy}
                        onClick={onToggleLocalOnly}
                        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${health.localOnly ? "bg-emerald-600" : "bg-gray-300"}`}
                    >
                        {savingPolicy ? (
                            <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${health.localOnly ? "left-[22px]" : "left-0.5"}`} />
                        )}
                    </button>
                    <span>
                        <span className="block text-sm font-medium text-gray-900">Local-only mode</span>
                        <span className="block text-xs text-gray-600">
                            {health.localOnly
                                ? "On: nothing is sent to cloud AI, even if a cloud model is chosen."
                                : "Off: cloud models you choose may receive cap-table details."}
                        </span>
                    </span>
                </label>
                {health.overall !== "not-set-up" && (
                    <Button variant="outline" size="sm" onClick={onChangeSetup} className="h-8 text-xs">
                        <Settings2 className="h-3.5 w-3.5" /> Change how AI runs
                    </Button>
                )}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
                Cap tables, documents and screening results stay on this computer. Sanctions matching always runs locally.
            </p>
        </section>
    );
}
