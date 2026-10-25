"use client";

import { Cloud, HardDrive, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { aiApi, ROLE_INFO, type AiState, type LlmRole } from "@/lib/aiControlCenterApi";

export function PrivacyCard({ state, onChange }: { state: AiState; onChange: () => void }) {
    const [saving, setSaving] = useState(false);
    const roles = (["agent", "utility", "embedding"] as LlmRole[])
        .map((r) => [r, state.effective.roles[r]] as const)
        .filter(([, s]) => !!s);
    const cloudRoles = roles.filter(([, s]) => s && !s.local);
    const allLocal = roles.length > 0 && cloudRoles.length === 0;

    const toggle = async () => {
        setSaving(true);
        try {
            await aiApi.setLocalOnly(!state.localOnly);
            onChange();
        } finally {
            setSaving(false);
        }
    };

    return (
        <section
            className={`rounded-xl border p-5 ${
                allLocal ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
            }`}
        >
            <div className="flex items-start gap-4">
                <div className={`mt-0.5 ${allLocal ? "text-emerald-600" : "text-amber-600"}`}>
                    {allLocal ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-medium">
                        {roles.length === 0
                            ? "No AI model configured yet"
                            : allLocal
                              ? "Everything stays on this computer"
                              : `${cloudRoles.length} task${cloudRoles.length > 1 ? "s" : ""} send data to a cloud provider`}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Cap tables, documents and screening results are stored only on this device. Sanctions
                        matching always runs locally. Only the AI tasks below can reach the internet — and only
                        when you assign them a cloud model.
                    </p>

                    {roles.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                            {roles.map(([role, s]) => (
                                <li
                                    key={role}
                                    className="flex items-center gap-2 rounded-md bg-white/80 border border-gray-200 px-2.5 py-1.5 text-xs"
                                >
                                    {s!.local ? (
                                        <HardDrive className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                        <Cloud className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                    )}
                                    <span className="whitespace-nowrap">
                                        <span className="text-gray-500">{ROLE_INFO[role].short}:</span>{" "}
                                        <span className="font-medium">{s!.local ? "on-device" : s!.label}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <label className="flex items-center gap-3 shrink-0 cursor-pointer select-none">
                    <span className="text-sm font-medium text-gray-800 hidden sm:inline">Local-only mode</span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={state.localOnly}
                        aria-label="Local-only mode"
                        disabled={saving}
                        onClick={toggle}
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                            state.localOnly ? "bg-emerald-600" : "bg-gray-300"
                        }`}
                    >
                        {saving ? (
                            <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                            <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                    state.localOnly ? "left-[22px]" : "left-0.5"
                                }`}
                            />
                        )}
                    </button>
                </label>
            </div>
            {state.localOnly && (
                <p className="mt-3 text-xs text-emerald-800">
                    Local-only mode is on: any cloud model is blocked, even if one is assigned.
                </p>
            )}
        </section>
    );
}
