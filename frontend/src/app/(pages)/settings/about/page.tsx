"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ClipboardCopy, FolderOpen, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi, ROLE_INFO, type AiHealth, type LlmRole } from "@/lib/aiControlCenterApi";
import { desktopDataApi, type SanctionsInfo, type ScreeningSettings } from "@/lib/desktopDataApi";
import { useDesktop } from "@/lib/desktop";
import { DetailRow, SettingsCard, SettingsHeader } from "@/app/components/settings/SettingsParts";

const STATUS_STYLE: Record<string, string> = {
    ok: "text-emerald-700",
    warning: "text-amber-700",
    error: "text-red-600",
    off: "text-gray-500",
};

export default function AboutSettingsPage() {
    const bridge = useDesktop();
    const [sanctions, setSanctions] = useState<SanctionsInfo | null>(null);
    const [health, setHealth] = useState<AiHealth | null>(null);
    const [screening, setScreening] = useState<{ custom: boolean; values: ScreeningSettings } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        void desktopDataApi.sanctions().then(setSanctions).catch(() => {});
        void aiApi.health().then(setHealth).catch(() => {});
        void desktopDataApi
            .settings()
            .then((s) => setScreening({ custom: !!s.settings.screening, values: s.settings.screening ?? s.screeningDefaults }))
            .catch(() => {});
    }, []);

    const roles = health ? (Object.keys(health.roles) as LlmRole[]) : [];

    /** Plain-text summary for support. No account details, keys or cap-table data. */
    const diagnostics = () =>
        [
            `CapScreen ${bridge?.appVersion ?? "dev (browser)"}`,
            `Platform: ${bridge?.platform ?? navigator.platform}`,
            `Sanctions engine: ${sanctions?.available ? "ready" : "unavailable"} (${sanctions?.mode ?? "unknown"})${
                sanctions?.info?.version ? `, Watchman ${sanctions.info.version}` : ""
            }`,
            `Lists: ${
                sanctions?.info?.lists
                    ? Object.entries(sanctions.info.lists)
                          .map(([id, n]) => `${id}=${n}`)
                          .join(", ")
                    : "none loaded"
            }`,
            `Lists loaded: ${sanctions?.info?.endedAt ?? "unknown"}`,
            `Thresholds: ${screening ? `${screening.custom ? "custom" : "default"} ${JSON.stringify(screening.values)}` : "unknown"}`,
            `AI: ${health?.overall ?? "unknown"}${health?.localOnly ? " (local-only)" : ""}`,
            ...roles.map((r) => {
                const h = health!.roles[r];
                return `  ${r}: ${h.status}${h.binding ? ` ${h.binding.provider}/${h.binding.model}` : ""}`;
            }),
        ].join("\n");

    const copy = async () => {
        await navigator.clipboard.writeText(diagnostics());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-4">
            <SettingsHeader title="About" description="Version, where your data lives, and the state of each engine." />

            <SettingsCard title="CapScreen" icon={<Info className="h-4 w-4 text-gray-400" />}>
                <dl className="divide-y divide-gray-100">
                    <DetailRow label="Version">{bridge?.appVersion ?? "Development (browser)"}</DetailRow>
                    <DetailRow label="Platform">{bridge?.platform ?? "Browser"}</DetailRow>
                    {bridge?.dataDir && (
                        <DetailRow label="Data folder">
                            <span className="inline-flex max-w-full items-center gap-2">
                                <span className="truncate font-mono text-xs">{bridge.dataDir}</span>
                                <button
                                    type="button"
                                    onClick={() => void bridge.revealInFolder(bridge.dataDir)}
                                    className="shrink-0 text-gray-400 hover:text-gray-900"
                                    aria-label="Show data folder"
                                >
                                    <FolderOpen className="h-3.5 w-3.5" />
                                </button>
                            </span>
                        </DetailRow>
                    )}
                    <DetailRow label="Sanctions engine">
                        {sanctions ? (
                            <span className={sanctions.available ? "text-emerald-700" : "text-amber-700"}>
                                {sanctions.available ? "Ready" : "Loading"}
                                {sanctions.mode === "offline" && " · offline copy"}
                                {sanctions.info?.version && <span className="text-gray-500"> · Watchman {sanctions.info.version}</span>}
                            </span>
                        ) : (
                            "…"
                        )}
                    </DetailRow>
                    <DetailRow label="Screening thresholds">
                        {screening ? (
                            <Link href="/settings/screening" className="underline decoration-gray-300 hover:decoration-gray-900">
                                {screening.custom ? "Custom" : "Firm defaults"}
                            </Link>
                        ) : (
                            "…"
                        )}
                    </DetailRow>
                </dl>
            </SettingsCard>

            <SettingsCard
                title="AI"
                icon={<Sparkles className="h-4 w-4 text-gray-400" />}
                aside={
                    <Link href="/ai" className="text-xs text-gray-500 hover:text-gray-900">
                        AI Control Center →
                    </Link>
                }
            >
                {health ? (
                    <dl className="divide-y divide-gray-100">
                        {roles.map((r) => {
                            const h = health.roles[r];
                            return (
                                <DetailRow key={r} label={ROLE_INFO[r].title}>
                                    <span className={STATUS_STYLE[h.status] ?? "text-gray-700"}>
                                        {h.binding ? `${h.binding.label} · ${h.binding.model}` : h.title}
                                    </span>
                                </DetailRow>
                            );
                        })}
                        <DetailRow label="Local-only mode">{health.localOnly ? "On" : "Off"}</DetailRow>
                    </dl>
                ) : (
                    <p className="text-sm text-gray-500">Checking…</p>
                )}
            </SettingsCard>

            <SettingsCard
                title="Diagnostics"
                description="A plain-text summary of versions and engine status for support. It contains no account details, API keys or cap-table data."
                aside={
                    <Button variant="outline" size="sm" onClick={() => void copy()}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                }
            />
        </div>
    );
}
