"use client";

import { Check } from "lucide-react";

export type Status = { ok: boolean; text: string } | null;

export function StatusLine({ status }: { status: Status }) {
    if (!status) return null;
    return (
        <p
            role="status"
            className={`text-sm mt-2 inline-flex items-center gap-1 ${status.ok ? "text-emerald-700" : "text-red-600"}`}
        >
            {status.ok && <Check className="h-3.5 w-3.5" />}
            {status.text}
        </p>
    );
}

/** Page title for a settings sub-page. */
export function SettingsHeader({ title, description }: { title: string; description: string }) {
    return (
        <div className="mb-6">
            <h2 className="text-2xl font-medium font-serif">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
    );
}

/** Bordered group of related settings. */
export function SettingsCard({
    title,
    description,
    icon,
    aside,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    aside?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-gray-200 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                        {icon}
                        {title}
                    </h3>
                    {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
                </div>
                {aside}
            </div>
            {children && <div className="mt-4">{children}</div>}
        </section>
    );
}

export function Switch({
    checked,
    onChange,
    disabled,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                checked ? "bg-gray-900" : "bg-gray-200"
            }`}
        >
            <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-4" : "translate-x-0.5"
                }`}
            />
        </button>
    );
}

/** Label/value row for read-only details. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd className="min-w-0 text-sm text-gray-900 sm:text-right">{children}</dd>
        </div>
    );
}
