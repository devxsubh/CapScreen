"use client";

import { Check } from "lucide-react";

export type Status = { ok: boolean; text: string } | null;

export function StatusLine({ status }: { status: Status }) {
    if (!status) return null;
    return (
        <p
            role="status"
            className={`mt-3 inline-flex items-center gap-1.5 text-sm ${status.ok ? "text-emerald-700" : "text-red-600"}`}
        >
            {status.ok && <Check className="h-3.5 w-3.5" />}
            {status.text}
        </p>
    );
}

/** Page title for a settings sub-page. */
export function SettingsHeader({ title, description }: { title: string; description: string }) {
    return (
        <div className="mb-8">
            <h2 className="text-3xl font-medium font-eb-garamond tracking-tight text-gray-950">{title}</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gray-500">{description}</p>
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
    tone = "default",
}: {
    title: string;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    aside?: React.ReactNode;
    children?: React.ReactNode;
    tone?: "default" | "muted" | "danger";
}) {
    const shell =
        tone === "danger"
            ? "border-red-100 bg-red-50/30"
            : tone === "muted"
              ? "border-gray-100 bg-gray-50/60"
              : "border-gray-200 bg-white";

    return (
        <section className={`rounded-2xl border p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)] sm:p-6 ${shell}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2.5 text-[15px] font-medium text-gray-950">
                        {icon && (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                                {icon}
                            </span>
                        )}
                        <span>{title}</span>
                    </h3>
                    {description && (
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{description}</p>
                    )}
                </div>
                {aside && <div className="shrink-0 pt-0.5">{aside}</div>}
            </div>
            {children && <div className="mt-5">{children}</div>}
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
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                checked ? "bg-gray-900" : "bg-gray-200"
            }`}
        >
            <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
            />
        </button>
    );
}

/** Label/value row for read-only details. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd className="min-w-0 text-sm text-gray-900 sm:text-right">{children}</dd>
        </div>
    );
}
