"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Check, Download, FolderOpen, Loader2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { desktopDataApi, saveDownload, type AppSettings, type SanctionsInfo } from "@/lib/desktopDataApi";
import { useDesktop } from "@/lib/desktop";

type Status = { ok: boolean; text: string } | null;

function StatusLine({ status }: { status: Status }) {
    if (!status) return null;
    return (
        <p className={`text-sm mt-2 inline-flex items-center gap-1 ${status.ok ? "text-emerald-700" : "text-red-600"}`}>
            {status.ok && <Check className="h-3.5 w-3.5" />}
            {status.text}
        </p>
    );
}

function SanctionsSection() {
    const [info, setInfo] = useState<SanctionsInfo | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [lists, setLists] = useState<Array<{ id: string; label: string }>>([]);
    const [status, setStatus] = useState<Status>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const [s, i] = await Promise.all([desktopDataApi.settings(), desktopDataApi.sanctions()]);
        setSettings(s.settings);
        setLists(s.availableLists);
        setInfo(i);
    }, []);

    useEffect(() => {
        void load().catch((e: Error) => setStatus({ ok: false, text: e.message }));
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
            setStatus({ ok: true, text: "Saved — reloading sanctions data (about 30 seconds)…" });
            setTimeout(() => void load(), 30_000);
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const saveSchedule = async (patch: Partial<AppSettings["backgroundScreening"]>) => {
        if (!settings) return;
        const r = await desktopDataApi.saveSettings({ backgroundScreening: { ...settings.backgroundScreening, ...patch } });
        setSettings(r.settings);
    };

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-2xl font-medium font-serif">Sanctions data</h2>
                <p className="text-sm text-gray-500">
                    Lists are downloaded from official public sources and matched on this computer. Every screening
                    records the exact list versions it used.
                </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className={`h-4 w-4 ${info?.available ? "text-emerald-600" : "text-gray-400"}`} />
                        {info?.available ? "Screening engine ready" : "Screening engine loading…"}
                        {info?.info?.version && <span className="text-xs text-gray-500 font-normal">Watchman {info.info.version}</span>}
                    </div>
                    <button type="button" onClick={() => void load()} className="text-gray-400 hover:text-gray-700" aria-label="Refresh">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
                {info?.info?.lists && (
                    <table className="mt-3 w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-gray-500">
                                <th className="font-normal pb-1">List</th>
                                <th className="font-normal pb-1 text-right">Entries</th>
                                <th className="font-normal pb-1 pl-4">Version (SHA-256)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(info.info.lists).map(([id, count]) => (
                                <tr key={id} className="border-t border-gray-100">
                                    <td className="py-1.5">{lists.find((l) => l.id === id)?.label ?? id}</td>
                                    <td className="py-1.5 text-right tabular-nums">{count.toLocaleString()}</td>
                                    <td className="py-1.5 pl-4 font-mono text-xs text-gray-500" title={info.info?.listHashes?.[id]}>
                                        {info.info?.listHashes?.[id]?.slice(0, 16) ?? "—"}…
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {info?.mode === "offline" && (
                    <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Offline: screening against the copy saved on this computer
                        {Object.values(info.cached).length > 0 &&
                            ` (${new Date(Math.min(...Object.values(info.cached).map((d) => Date.parse(d)))).toLocaleString()})`}
                        . CapScreen switches back to live lists automatically when the sources are reachable.
                    </p>
                )}
                {info?.mode === "online" && Object.keys(info.cached ?? {}).length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                        Offline copy saved {new Date(Math.max(...Object.values(info.cached).map((d) => Date.parse(d)))).toLocaleString()} — used automatically if the internet is unavailable.
                    </p>
                )}
                {info?.info?.endedAt && (
                    <p className="mt-2 text-xs text-gray-500">
                        Loaded {new Date(info.info.endedAt).toLocaleString()} · refreshes every 12 hours while CapScreen runs
                    </p>
                )}
            </div>

            <div>
                <h3 className="text-sm font-medium mb-2">Lists to screen against</h3>
                <div className="grid gap-1.5">
                    {lists.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                disabled={saving || !settings}
                                checked={settings?.sanctionsLists.includes(l.id) ?? false}
                                onChange={() => void toggleList(l.id)}
                            />
                            {l.label}
                            <span className="font-mono text-xs text-gray-400">{l.id}</span>
                        </label>
                    ))}
                </div>
                <StatusLine status={status} />
            </div>

            {settings && (
                <div className="rounded-lg border border-gray-200 p-4">
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                            type="checkbox"
                            checked={settings.backgroundScreening.enabled}
                            onChange={(e) => void saveSchedule({ enabled: e.target.checked })}
                        />
                        Re-screen my portfolio in the background
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                        While CapScreen is open or in the menu bar, every startup&apos;s latest cap table is re-checked
                        against fresh lists. You get a notification when something new needs review.
                    </p>
                    <div className="mt-2 ml-6 flex items-center gap-2 text-sm">
                        Every
                        <select
                            value={settings.backgroundScreening.intervalHours}
                            disabled={!settings.backgroundScreening.enabled}
                            onChange={(e) => void saveSchedule({ intervalHours: Number(e.target.value) })}
                            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm"
                        >
                            {[6, 12, 24, 72, 168].map((h) => (
                                <option key={h} value={h}>
                                    {h < 24 ? `${h} hours` : h === 24 ? "day" : h === 168 ? "week" : `${h / 24} days`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </section>
    );
}

function BackupSection() {
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<"backup" | "restore" | "audit" | null>(null);
    const [status, setStatus] = useState<Status>(null);
    const [restorePassword, setRestorePassword] = useState("");
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [dbFile, setDbFile] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const bridge = useDesktop();

    useEffect(() => {
        void desktopDataApi.settings().then((s) => setDbFile(s.databaseFile)).catch(() => {});
    }, []);

    const backup = async () => {
        setBusy("backup");
        setStatus(null);
        try {
            const { data, filename } = await desktopDataApi.backup(password);
            const saved = await saveDownload(data, filename);
            setStatus(saved ? { ok: true, text: `Encrypted backup saved (${(data.byteLength / 1024 / 1024).toFixed(1)} MB)` } : null);
            setPassword("");
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const restore = async () => {
        if (!restoreFile) return;
        if (!confirm("Restoring replaces everything currently in CapScreen with the backup. Continue?")) return;
        setBusy("restore");
        setStatus(null);
        try {
            const r = await desktopDataApi.restore(await restoreFile.arrayBuffer(), restorePassword);
            setStatus({ ok: true, text: `Restored backup from ${new Date(r.createdAt).toLocaleString()}. Reloading…` });
            setTimeout(() => window.location.assign("/startups"), 6000);
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
            setBusy(null);
        }
    };

    const exportAudit = async () => {
        setBusy("audit");
        setStatus(null);
        try {
            const { data, filename } = await desktopDataApi.auditExport();
            const saved = await saveDownload(data, filename);
            if (saved) setStatus({ ok: true, text: "Tamper-evident audit log exported" });
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-2xl font-medium font-serif">Backup &amp; export</h2>
                <p className="text-sm text-gray-500">
                    Everything lives in one folder on this computer (API keys are additionally sealed by your OS
                    keychain; keep disk encryption such as FileVault or BitLocker on). Back it up to an external drive
                    or move it to a new machine.
                </p>
            </div>

            {dbFile && (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    <span className="font-mono truncate">{dbFile}</span>
                    {bridge && (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900 shrink-0 ml-3" onClick={() => void bridge.revealInFolder(dbFile)}>
                            <FolderOpen className="h-3.5 w-3.5" /> Show
                        </button>
                    )}
                </div>
            )}

            <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                    <Archive className="h-4 w-4" /> Create encrypted backup
                </h3>
                <p className="text-xs text-gray-500">
                    Startups, cap tables, screenings, documents, chats, and settings — sealed with your password
                    (AES-256). API keys are not included; re-enter them after restoring on another computer.
                </p>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Backup password (8+ characters)" autoComplete="new-password" />
                    </div>
                    <Button onClick={backup} disabled={password.length < 8 || busy !== null} className="bg-black hover:bg-gray-900 text-white">
                        {busy === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Back up
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                    <Upload className="h-4 w-4" /> Restore from backup
                </h3>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".capscreen-backup"
                    className="hidden"
                    onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex gap-2 items-center">
                    <Button variant="outline" onClick={() => fileRef.current?.click()}>
                        Choose file…
                    </Button>
                    <span className="text-sm text-gray-600 truncate">{restoreFile?.name ?? "No file chosen"}</span>
                </div>
                {restoreFile && (
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <PasswordInput value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} placeholder="Backup password" autoComplete="off" />
                        </div>
                        <Button onClick={restore} disabled={!restorePassword || busy !== null} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">
                            {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-medium">Audit log</h3>
                <p className="text-xs text-gray-500">
                    Exports every screening, review decision and document event as JSON with a SHA-256 hash chain, so
                    any later edit to the file is detectable.
                </p>
                <Button variant="outline" onClick={exportAudit} disabled={busy !== null}>
                    {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export audit log
                </Button>
            </div>

            <StatusLine status={status} />
        </section>
    );
}

export default function DataSettingsPage() {
    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <header className="mx-auto flex w-full max-w-3xl shrink-0 flex-col px-6 pt-10 pb-4">
                <h1 className="text-4xl font-medium font-eb-garamond">Data &amp; Backup</h1>
                <p className="text-sm text-gray-500 mt-1">Your data never leaves this computer unless you export it.</p>
            </header>
            <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16 space-y-10">
                <SanctionsSection />
                <BackupSection />
            </main>
        </div>
    );
}
