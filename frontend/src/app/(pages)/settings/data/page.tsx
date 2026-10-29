"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Download, FileCheck2, FolderOpen, HardDrive, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { desktopDataApi, saveDownload } from "@/lib/desktopDataApi";
import { useDesktop } from "@/lib/desktop";
import { SettingsCard, SettingsHeader, StatusLine, type Status } from "@/app/components/settings/SettingsParts";

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
    const fileRef = useRef<HTMLInputElement>(null);
    const bridge = useDesktop();

    useEffect(() => {
        void desktopDataApi
            .settings()
            .then((s) => setDbFile(s.databaseFile))
            .catch(() => {});
    }, []);

    const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

    const backup = async () => {
        setBusy("backup");
        setBackupStatus(null);
        try {
            const { data, filename } = await desktopDataApi.backup(password);
            const saved = await saveDownload(data, filename);
            setBackupStatus(
                saved ? { ok: true, text: `Encrypted backup saved (${(data.byteLength / 1024 / 1024).toFixed(1)} MB)` } : null,
            );
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
        if (!confirm("Restoring replaces everything currently in CapScreen with the backup. Continue?")) return;
        setBusy("restore");
        setRestoreStatus(null);
        try {
            const r = await desktopDataApi.restore(await restoreFile.arrayBuffer(), restorePassword);
            setRestoreStatus({ ok: true, text: `Restored backup from ${new Date(r.createdAt).toLocaleString()}. Reloading…` });
            setTimeout(() => window.location.assign("/startups"), 6000);
        } catch (e) {
            setRestoreStatus({ ok: false, text: (e as Error).message });
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
        <div className="space-y-4">
            <SettingsHeader
                title="Backup & audit"
                description="Your data never leaves this computer unless you export it."
            />

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

            <SettingsCard
                title="Create encrypted backup"
                icon={<Archive className="h-4 w-4 text-gray-400" />}
                description="Startups, cap tables, screenings, documents, chats and settings, sealed with your password (AES-256). API keys are not included; re-enter them after restoring on another computer."
            >
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
                        {mismatch ? "Passwords don't match." : "There is no way to recover a forgotten backup password."}
                    </p>
                    <Button
                        onClick={() => void backup()}
                        disabled={password.length < 8 || password !== confirmPassword || busy !== null}
                        className="bg-black text-white hover:bg-gray-900"
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
                description="Replaces everything currently in CapScreen with the contents of a .capscreen-backup file."
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".capscreen-backup"
                    className="hidden"
                    onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => fileRef.current?.click()}>
                        Choose file…
                    </Button>
                    <span className="truncate text-sm text-gray-600">{restoreFile?.name ?? "No file chosen"}</span>
                </div>
                {restoreFile && (
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
                            className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                            {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore"}
                        </Button>
                    </div>
                )}
                <StatusLine status={restoreStatus} />
            </SettingsCard>

            <SettingsCard
                title="Audit log"
                icon={<FileCheck2 className="h-4 w-4 text-gray-400" />}
                description="Every screening, review decision and document event as JSON with a SHA-256 hash chain, so any later edit to the file is detectable."
                aside={
                    <Button variant="outline" size="sm" onClick={() => void exportAudit()} disabled={busy !== null}>
                        {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Export
                    </Button>
                }
            >
                {auditStatus && <StatusLine status={auditStatus} />}
            </SettingsCard>
        </div>
    );
}
