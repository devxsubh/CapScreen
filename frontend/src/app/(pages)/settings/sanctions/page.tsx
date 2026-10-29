"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Loader2, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { desktopDataApi, type AppSettings, type SanctionsInfo } from "@/lib/desktopDataApi";
import { SettingsCard, SettingsHeader, StatusLine, Switch, type Status } from "@/app/components/settings/SettingsParts";

const INTERVALS = [6, 12, 24, 72, 168];

function intervalLabel(h: number): string {
    if (h < 24) return `${h} hours`;
    if (h === 24) return "day";
    if (h === 168) return "week";
    return `${h / 24} days`;
}

export default function SanctionsSettingsPage() {
    const [info, setInfo] = useState<SanctionsInfo | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [lists, setLists] = useState<Array<{ id: string; label: string }>>([]);
    const [status, setStatus] = useState<Status>(null);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(
        () =>
            Promise.all([desktopDataApi.settings(), desktopDataApi.sanctions()]).then(([s, i]) => {
                setSettings(s.settings);
                setLists(s.availableLists);
                setInfo(i);
            }),
        [],
    );

    const refresh = () => {
        setRefreshing(true);
        load()
            .catch((e: Error) => setStatus({ ok: false, text: e.message }))
            .finally(() => setRefreshing(false));
    };

    useEffect(() => {
        void load().catch((e: Error) => setStatus({ ok: false, text: e.message }));
        return () => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
        };
    }, [load]);

    const toggleList = async (id: string) => {
        if (!settings) return;
        const next = settings.sanctionsLists.includes(id)
            ? settings.sanctionsLists.filter((l) => l !== id)
            : [...settings.sanctionsLists, id];
        setSaving(true);
        setStatus(null);
        try {
            const r = await desktopDataApi.saveSettings({ sanctionsLists: next });
            setSettings(r.settings);
            setStatus({ ok: true, text: "Saved. Reloading sanctions data (about 30 seconds)…" });
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
            reloadTimer.current = setTimeout(() => void load().catch(() => {}), 30_000);
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const saveSchedule = async (patch: Partial<AppSettings["backgroundScreening"]>) => {
        if (!settings) return;
        try {
            const r = await desktopDataApi.saveSettings({ backgroundScreening: { ...settings.backgroundScreening, ...patch } });
            setSettings(r.settings);
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        }
    };

    const loadedLists = info?.info?.lists ?? {};
    const totalEntries = Object.values(loadedLists).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-4">
            <SettingsHeader
                title="Sanctions data"
                description="Lists are downloaded from official public sources and matched on this computer. Every screening records the exact list versions it used."
            />

            <SettingsCard
                title={info?.available ? "Screening engine ready" : info ? "Screening engine loading…" : "Checking screening engine…"}
                icon={<ShieldCheck className={`h-4 w-4 ${info?.available ? "text-emerald-600" : "text-gray-400"}`} />}
                description={
                    info?.info?.endedAt
                        ? `${totalEntries.toLocaleString()} entries loaded ${new Date(info.info.endedAt).toLocaleString()}. Refreshes every 12 hours while CapScreen runs.`
                        : undefined
                }
                aside={
                    <button
                        type="button"
                        onClick={refresh}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Refresh status"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                }
            >
                {info?.info?.version && <p className="-mt-2 mb-3 text-xs text-gray-500">Watchman {info.info.version}</p>}
                {info?.mode === "offline" && (
                    <p className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Offline: screening against the copy saved on this computer
                            {Object.values(info.cached).length > 0 &&
                                ` (${new Date(Math.min(...Object.values(info.cached).map((d) => Date.parse(d)))).toLocaleString()})`}
                            . CapScreen switches back to live lists automatically when the sources are reachable.
                        </span>
                    </p>
                )}
                {info?.mode === "online" && Object.keys(info.cached ?? {}).length > 0 && (
                    <p className="mb-3 text-xs text-gray-500">
                        Offline copy saved{" "}
                        {new Date(Math.max(...Object.values(info.cached).map((d) => Date.parse(d)))).toLocaleString()}, used
                        automatically if the internet is unavailable.
                    </p>
                )}

                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Lists to screen against</h4>
                <ul className="divide-y divide-gray-100">
                    {lists.map((l) => {
                        const on = settings?.sanctionsLists.includes(l.id) ?? false;
                        const count = loadedLists[l.id];
                        const hash = info?.info?.listHashes?.[l.id];
                        return (
                            <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-sm">{l.label}</p>
                                    <p className="truncate text-xs text-gray-400">
                                        <span className="font-mono">{l.id}</span>
                                        {count !== undefined && ` · ${count.toLocaleString()} entries`}
                                        {hash && (
                                            <span className="font-mono" title={`SHA-256 ${hash}`}>
                                                {" "}
                                                · {hash.slice(0, 12)}…
                                            </span>
                                        )}
                                        {on && count === undefined && info?.available && " · loading"}
                                    </p>
                                </div>
                                <Switch
                                    label={l.label}
                                    checked={on}
                                    disabled={saving || !settings || (on && settings.sanctionsLists.length === 1)}
                                    onChange={() => void toggleList(l.id)}
                                />
                            </li>
                        );
                    })}
                </ul>
                {saving && <Loader2 className="mt-2 h-4 w-4 animate-spin text-gray-400" />}
                <StatusLine status={status} />
            </SettingsCard>

            {settings && (
                <SettingsCard
                    title="Background re-screening"
                    icon={<Clock className="h-4 w-4 text-gray-400" />}
                    description="While CapScreen is open or in the menu bar, every startup's latest cap table is re-checked against fresh lists. You get a notification when something new needs review."
                    aside={
                        <Switch
                            label="Re-screen my portfolio in the background"
                            checked={settings.backgroundScreening.enabled}
                            onChange={(enabled) => void saveSchedule({ enabled })}
                        />
                    }
                >
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        Every
                        <select
                            value={settings.backgroundScreening.intervalHours}
                            disabled={!settings.backgroundScreening.enabled}
                            onChange={(e) => void saveSchedule({ intervalHours: Number(e.target.value) })}
                            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm disabled:opacity-50"
                        >
                            {(INTERVALS.includes(settings.backgroundScreening.intervalHours)
                                ? INTERVALS
                                : [...INTERVALS, settings.backgroundScreening.intervalHours].sort((a, b) => a - b)
                            ).map((h) => (
                                <option key={h} value={h}>
                                    {intervalLabel(h)}
                                </option>
                            ))}
                        </select>
                    </label>
                </SettingsCard>
            )}
        </div>
    );
}
