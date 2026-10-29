"use client";

import { useEffect, useRef, useState } from "react";
import {
    Archive,
    Download,
    FileCheck2,
    FolderOpen,
    HardDrive,
    Loader2,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { desktopDataApi, saveDownload } from "@/lib/desktopDataApi";
import { useDesktop } from "@/lib/desktop";
import { SettingsCard, SettingsHeader, StatusLine, type Status } from "@/app/components/settings/SettingsParts";
import { StartFreshCard } from "@/app/components/settings/StartFreshCard";

const LAST_BACKUP_KEY = "capscreen.lastBackup";

type LastBackup = {
    at: string;
    sizeBytes: number;
    filename: string;
};

function readLastBackup(): LastBackup | null {
    try {
        const raw = localStorage.getItem(LAST_BACKUP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LastBackup;
        if (!parsed?.at || typeof parsed.sizeBytes !== "number") return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeLastBackup(entry: LastBackup) {
    try {
        localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(entry));
    } catch {
        // Quota / private mode — ignore; UI still works without persistence.
    }
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        });
    } catch {
        return iso;
    }
}

export default function DataSettingsPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState<"backup" | "restore" | "audit" | null>(null);
    const [backupStatus, setBackupStatus] = useState<Status>(null);
    const [restoreStatus, setRestoreStatus] = useState<Status>(null);
    const [auditStatus, setAuditStatus] = useState<Status>(null);
    const [restorePassword, setRestorePassword] = useState("");
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [dbFile, setDbFile] = useState<string | null>(null);
    const [lastBackup, setLastBackup] = useState<LastBackup | null>(() =>
        typeof window !== "undefined" ? readLastBackup() : null,
    );
    const [restorePhase, setRestorePhase] = useState<"idle" | "restoring" | "reloading">("idle");
    const [reloadSeconds, setReloadSeconds] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);
    const bridge = useDesktop();

    useEffect(() => {
        void desktopDataApi
            .settings()
            .then((s) => setDbFile(s.databaseFile))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (restorePhase !== "reloading" || reloadSeconds <= 0) return;
        const t = setTimeout(() => setReloadSeconds((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [restorePhase, reloadSeconds]);

    const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

    const backup = async () => {
        setBusy("backup");
        setBackupStatus(null);
        try {
            const { data, filename } = await desktopDataApi.backup(password);
            const saved = await saveDownload(data, filename);
            if (saved) {
                const entry: LastBackup = {
                    at: new Date().toISOString(),
                    sizeBytes: data.byteLength,
                    filename,
                };
                writeLastBackup(entry);
                setLastBackup(entry);
                setBackupStatus({
                    ok: true,
                    text: `Encrypted backup saved (${formatBytes(data.byteLength)}). API keys were not included.`,
                });
            }
            setPassword("");
            setConfirmPassword("");
        } catch (e) {
            setBackupStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const restore = async () => {
        if (!restoreFile) return;
        if (
            !confirm(
                "Restoring replaces everything currently in CapScreen with the backup — startups, screenings, documents and chats. API keys are not restored. Continue?",
            )
        )
            return;
        setBusy("restore");
        setRestorePhase("restoring");
        setRestoreStatus(null);
        try {
            const r = await desktopDataApi.restore(await restoreFile.arrayBuffer(), restorePassword);
            setRestorePhase("reloading");
            setReloadSeconds(6);
            setRestoreStatus({
                ok: true,
                text: `Restored backup from ${formatWhen(r.createdAt)} (${r.entries} items). CapScreen is reloading…`,
            });
            setTimeout(() => window.location.assign("/startups"), 6000);
        } catch (e) {
            setRestoreStatus({ ok: false, text: (e as Error).message });
            setRestorePhase("idle");
            setBusy(null);
        }
    };

    const exportAudit = async () => {
        setBusy("audit");
        setAuditStatus(null);
        try {
            const { data, filename } = await desktopDataApi.auditExport();
            const saved = await saveDownload(data, filename);
            if (saved) setAuditStatus({ ok: true, text: "Tamper-evident audit log exported" });
        } catch (e) {
            setAuditStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-5">
            <SettingsHeader
                title="Backup & audit"
                description="Your data never leaves this computer unless you export it."
            />

            <div className="grid gap-5 xl:grid-cols-2">
                <SettingsCard
                    title="Backup status"
                    icon={<Archive className="h-4 w-4 text-gray-400" />}
                    description="A local reminder of the last backup you made from this computer. CapScreen does not upload backups."
                >
                    {lastBackup ? (
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-sm text-emerald-950">
                            <p className="font-medium">Last backup</p>
                            <p className="mt-1 text-xs text-emerald-900/80">
                                {formatWhen(lastBackup.at)}
                                {" · "}
                                {formatBytes(lastBackup.sizeBytes)}
                                {lastBackup.filename ? ` · ${lastBackup.filename}` : ""}
                            </p>
                            <p className="mt-2 text-xs text-emerald-900/70">
                                Recommended: back up before major restores, OS upgrades, or moving to another machine.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-3 py-3 text-sm text-amber-950">
                            <p className="font-medium">Never backed up on this computer</p>
                            <p className="mt-1 text-xs text-amber-900/80">
                                Create an encrypted backup below so you can recover startups, screenings and documents if
                                this machine is lost or replaced.
                            </p>
                        </div>
                    )}
                </SettingsCard>

                <SettingsCard
                    title="Storage"
                    icon={<HardDrive className="h-4 w-4 text-gray-400" />}
                    description="Everything lives in one folder on this computer. API keys are additionally sealed by your OS keychain; keep disk encryption such as FileVault or BitLocker on."
                >
                    {dbFile ? (
                        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                            <span className="truncate font-mono">{dbFile}</span>
                            {bridge && (
                                <button
                                    type="button"
                                    className="ml-3 inline-flex shrink-0 items-center gap-1 hover:text-gray-900"
                                    onClick={() => void bridge.revealInFolder(dbFile)}
                                >
                                    <FolderOpen className="h-3.5 w-3.5" /> Show
                                </button>
                            )}
                        </div>
                    ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    )}
                </SettingsCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <SettingsCard
                    title="Create encrypted backup"
                    icon={<Archive className="h-4 w-4 text-gray-400" />}
                    description="Startups, cap tables, screenings, documents, chats and settings, sealed with your password (AES-256)."
                >
                    <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                        <span className="font-medium">API keys are not included.</span> After restoring on another computer,
                        re-enter cloud keys in the AI Control Center. There is no way to recover a forgotten backup password.
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <PasswordInput
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Backup password (8+ characters)"
                            autoComplete="new-password"
                            aria-label="Backup password"
                        />
                        <PasswordInput
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat password"
                            autoComplete="new-password"
                            aria-label="Repeat backup password"
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-xs ${mismatch ? "text-red-600" : "text-gray-500"}`}>
                            {mismatch ? "Passwords don't match." : "Use a password you will remember offline."}
                        </p>
                        <Button
                            onClick={() => void backup()}
                            disabled={password.length < 8 || password !== confirmPassword || busy !== null}
                            className="bg-gray-950 text-white hover:bg-gray-800"
                        >
                            {busy === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Back up
                        </Button>
                    </div>
                    <StatusLine status={backupStatus} />
                </SettingsCard>

                <SettingsCard
                    title="Restore from backup"
                    icon={<Upload className="h-4 w-4 text-gray-400" />}
                    description="Replaces everything currently in CapScreen with the contents of a .capscreen-backup file. API keys are not restored."
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".capscreen-backup"
                        className="hidden"
                        onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restorePhase !== "idle"}>
                            Choose file…
                        </Button>
                        <span className="truncate text-sm text-gray-600">{restoreFile?.name ?? "No file chosen"}</span>
                    </div>
                    {restoreFile && restorePhase === "idle" && (
                        <div className="mt-2 flex gap-2">
                            <div className="flex-1">
                                <PasswordInput
                                    value={restorePassword}
                                    onChange={(e) => setRestorePassword(e.target.value)}
                                    placeholder="Backup password"
                                    autoComplete="off"
                                    aria-label="Backup password to restore"
                                />
                            </div>
                            <Button
                                onClick={() => void restore()}
                                disabled={!restorePassword || busy !== null}
                                variant="outline"
                                className="text-red-700 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] hover:bg-red-50 hover:text-red-800"
                            >
                                {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore"}
                            </Button>
                        </div>
                    )}
                    {restorePhase === "restoring" && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Decrypting and replacing local data…
                        </div>
                    )}
                    {restorePhase === "reloading" && (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                            <p className="font-medium">Restore complete</p>
                            <p className="mt-1 text-xs text-emerald-900/80">
                                Reloading CapScreen in {reloadSeconds}s so the new database is used. You&apos;ll land on
                                Startups — re-enter any cloud API keys afterward.
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                                <div
                                    className="h-full bg-emerald-600 transition-[width] duration-1000 ease-linear"
                                    style={{ width: `${Math.max(0, ((6 - reloadSeconds) / 6) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                    {restorePhase === "idle" && <StatusLine status={restoreStatus} />}
                </SettingsCard>
            </div>

            <SettingsCard
                title="Audit log"
                icon={<FileCheck2 className="h-4 w-4 text-gray-400" />}
                description="Export a compliance artifact of screening runs, review decisions and document events."
                aside={
                    <Button variant="outline" size="sm" onClick={() => void exportAudit()} disabled={busy !== null}>
                        {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Export
                    </Button>
                }
            >
                <ul className="list-inside list-disc space-y-1 text-xs text-gray-600">
                    <li>JSON file of audit events from this computer</li>
                    <li>Each row carries a SHA-256 hash of the previous row — later edits to the file are detectable</li>
                    <li>Does not include cap-table CSVs or full document contents</li>
                </ul>
                {auditStatus && <StatusLine status={auditStatus} />}
            </SettingsCard>

            <StartFreshCard />
        </div>
    );
}
