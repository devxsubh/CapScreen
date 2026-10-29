"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { listAuditLogs, auditLogExportUrl, type AuditLogEntry } from "@/app/lib/auditLogApi";
import {
    EVENT_ICONS,
    EVENT_LABELS,
    auditEventDetail,
} from "@/app/components/startups/auditEventDisplay";

interface Props {
    startupId: string;
}

function formatTs(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function StartupAuditMenu({ startupId }: Props) {
    const [open, setOpen] = useState(false);
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        listAuditLogs(startupId)
            .then(setLogs)
            .catch(() => setLogs([]))
            .finally(() => setLoading(false));
    }, [open, startupId]);

    useEffect(() => {
        if (!open) return;
        function onClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                title="Audit log"
            >
                <ClipboardList className="h-3.5 w-3.5" />
                Audit
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-30 w-80 rounded-xl border border-gray-200 bg-white shadow-lg py-2 max-h-72 overflow-y-auto">
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                        Audit log
                    </p>
                    <div className="px-3 pb-2">
                        <a
                            href={auditLogExportUrl(startupId)}
                            className="text-[11px] text-gray-700 hover:text-gray-950 hover:underline"
                        >
                            Export CSV
                        </a>
                    </div>
                    {loading ? (
                        <p className="px-3 py-3 text-xs text-gray-400">Loading…</p>
                    ) : logs.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-400">No events yet.</p>
                    ) : (
                        <ul className="px-2 space-y-1">
                            {logs.map((log) => {
                                const detail = auditEventDetail(log);
                                return (
                                    <li
                                        key={log.id}
                                        className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                                    >
                                        <span className="mt-0.5 shrink-0">
                                            {EVENT_ICONS[log.eventType]}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs text-gray-800">
                                                {EVENT_LABELS[log.eventType]}
                                                {detail && (
                                                    <span className="ml-1 text-gray-500">
                                                        — {detail}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-gray-400">
                                                {log.performedByEmail} ·{" "}
                                                {formatTs(log.createdAt)}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
