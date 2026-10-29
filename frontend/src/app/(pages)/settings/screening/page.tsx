"use client";

import { useEffect, useState } from "react";
import { GitBranch, Loader2, RotateCcw, Search, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopDataApi, type ScreeningSettings } from "@/lib/desktopDataApi";
import { SettingsCard, SettingsHeader, StatusLine, type Status } from "@/app/components/settings/SettingsParts";

type Field = keyof ScreeningSettings;

const pct = (score: number) => Math.round(score * 100);

/** Same rules as the backend (validateScreeningSettings), checked before saving. */
function problem(s: ScreeningSettings): string | null {
    if (s.reviewMinScore < s.watchmanMinMatch) return "The review threshold can't be below the minimum match score.";
    if (s.flaggedMinScore < s.reviewMinScore) return "The flag threshold can't be below the review threshold.";
    if (s.ofacOwnershipRulePct < 1 || s.ofacOwnershipRulePct > 50) return "The OFAC threshold must be between 1% and 50%.";
    if (s.beneficialOwnerPct < 1 || s.beneficialOwnerPct > 25) return "The beneficial-owner threshold must be between 1% and 25%.";
    if (s.watchmanResultLimit < 1 || s.watchmanResultLimit > 100) return "Matches per entity must be between 1 and 100.";
    return null;
}

function classify(score: number, s: ScreeningSettings): "not shown" | "clear" | "review" | "flagged" {
    if (score < s.watchmanMinMatch) return "not shown";
    if (score >= s.flaggedMinScore) return "flagged";
    if (score >= s.reviewMinScore) return "review";
    return "clear";
}

const OUTCOME_STYLE = {
    "not shown": "bg-gray-100 text-gray-600",
    clear: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-800",
    flagged: "bg-red-50 text-red-700",
} as const;

/** 50–100% scale showing which scores are dropped, cleared, reviewed or flagged. */
function ScoreBand({ s }: { s: ScreeningSettings }) {
    const pos = (score: number) => `${Math.min(100, Math.max(0, ((score - 0.5) / 0.5) * 100))}%`;
    const segments = [
        { from: 0.5, to: s.watchmanMinMatch, cls: "bg-gray-200", label: "Not shown" },
        { from: s.watchmanMinMatch, to: s.reviewMinScore, cls: "bg-emerald-300", label: "Clear" },
        { from: s.reviewMinScore, to: s.flaggedMinScore, cls: "bg-amber-300", label: "Review" },
        { from: s.flaggedMinScore, to: 1, cls: "bg-red-400", label: "Flagged" },
    ];
    return (
        <div aria-hidden className="select-none">
            <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
                {segments.map((seg) =>
                    seg.to > seg.from ? (
                        <div
                            key={seg.label}
                            className={`absolute inset-y-0 ${seg.cls}`}
                            style={{ left: pos(seg.from), width: `calc(${pos(seg.to)} - ${pos(seg.from)})` }}
                            title={seg.label}
                        />
                    ) : null,
                )}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-gray-400">
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                {segments.map((seg) => (
                    <span key={seg.label} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${seg.cls}`} />
                        {seg.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

function DefaultHint({ value, def, format }: { value: number; def: number; format: (n: number) => string }) {
    if (value === def) return <span className="text-xs text-gray-400">default</span>;
    return <span className="text-xs text-blue-600">default {format(def)}</span>;
}

/** Slider + number box for a 0–1 score shown as a percentage. */
function ScoreField({
    id,
    label,
    help,
    value,
    def,
    max,
    onChange,
}: {
    id: string;
    label: string;
    help: string;
    value: number;
    def: number;
    max: number;
    onChange: (score: number) => void;
}) {
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <DefaultHint value={pct(value)} def={pct(def)} format={(n) => `${n}%`} />
            </div>
            <p className="text-xs text-gray-500">{help}</p>
            <div className="mt-2 flex items-center gap-3">
                <input
                    id={id}
                    type="range"
                    min={50}
                    max={max}
                    step={1}
                    value={pct(value)}
                    onChange={(e) => onChange(Number(e.target.value) / 100)}
                    className="flex-1 accent-gray-900"
                />
                <div className="flex items-center rounded-md border border-gray-200 pr-2 focus-within:border-gray-400">
                    <input
                        type="number"
                        min={50}
                        max={max}
                        value={pct(value)}
                        onChange={(e) => onChange(Number(e.target.value) / 100)}
                        aria-label={`${label} (percent)`}
                        className="h-8 w-14 bg-transparent px-2 text-right text-sm tabular-nums outline-none"
                    />
                    <span className="text-sm text-gray-400">%</span>
                </div>
            </div>
        </div>
    );
}

function NumberField({
    id,
    label,
    help,
    value,
    def,
    min,
    max,
    suffix,
    onChange,
}: {
    id: string;
    label: string;
    help: React.ReactNode;
    value: number;
    def: number;
    min: number;
    max: number;
    suffix?: string;
    onChange: (n: number) => void;
}) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <p className="text-xs text-gray-500">{help}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <DefaultHint value={value} def={def} format={(n) => `${n}${suffix ?? ""}`} />
                <div className="flex items-center rounded-md border border-gray-200 pr-2 focus-within:border-gray-400">
                    <input
                        id={id}
                        type="number"
                        min={min}
                        max={max}
                        value={value}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="h-8 w-16 bg-transparent px-2 text-right text-sm tabular-nums outline-none"
                    />
                    {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
                </div>
            </div>
        </div>
    );
}

export default function ScreeningSettingsPage() {
    const [saved, setSaved] = useState<ScreeningSettings | null>(null);
    const [defaults, setDefaults] = useState<ScreeningSettings | null>(null);
    const [draft, setDraft] = useState<ScreeningSettings | null>(null);
    const [busy, setBusy] = useState<"save" | "reset" | null>(null);
    const [status, setStatus] = useState<Status>(null);
    const [tryScore, setTryScore] = useState(85);

    useEffect(() => {
        desktopDataApi
            .settings()
            .then((r) => {
                setSaved(r.settings.screening);
                setDefaults(r.screeningDefaults);
                setDraft(r.settings.screening ?? r.screeningDefaults);
            })
            .catch((e: Error) => setStatus({ ok: false, text: e.message }));
    }, []);

    if (!draft || !defaults) {
        return (
            <>
                <SettingsHeader title="Screening" description="How strict sanctions matching and ownership rules are." />
                {status ? (
                    <StatusLine status={status} />
                ) : (
                    <p className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </p>
                )}
            </>
        );
    }

    const current = saved ?? defaults;
    const dirty = (Object.keys(draft) as Field[]).some((k) => draft[k] !== current[k]);
    const error = problem(draft);
    const set = (k: Field, v: number) => {
        setStatus(null);
        setDraft((d) => (d ? { ...d, [k]: Number.isFinite(v) ? v : 0 } : d));
    };

    const save = async () => {
        setBusy("save");
        setStatus(null);
        try {
            const r = await desktopDataApi.saveSettings({ screening: draft });
            setSaved(r.settings.screening);
            setStatus({ ok: true, text: "Saved. New screenings use these thresholds." });
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const reset = async () => {
        if (!confirm("Go back to the firm default thresholds for new screenings?")) return;
        setBusy("reset");
        setStatus(null);
        try {
            await desktopDataApi.saveSettings({ screening: null });
            setSaved(null);
            setDraft(defaults);
            setStatus({ ok: true, text: "Back to the default thresholds." });
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    const outcome = classify(tryScore / 100, draft);

    return (
        <div className="space-y-4 pb-20">
            <SettingsHeader
                title="Screening"
                description="How strict sanctions matching and ownership rules are. Changes apply to new screenings; every result records the thresholds it was made with."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-600">
                    {saved ? "Using your custom thresholds" : "Using the firm default thresholds"}
                </span>
                {saved && (
                    <Button variant="ghost" size="sm" onClick={() => void reset()} disabled={busy !== null}>
                        {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Reset to defaults
                    </Button>
                )}
            </div>

            <SettingsCard
                title="Match scores"
                icon={<Target className="h-4 w-4 text-gray-400" />}
                description="Watchman scores how closely each name matches a sanctions entry. These cut-offs decide what you see and what gets escalated."
            >
                <ScoreBand s={draft} />
                <div className="mt-5 space-y-5">
                    <ScoreField
                        id="watchmanMinMatch"
                        label="Minimum match score"
                        help="Weaker matches are not shown at all. Lower it to see more distant spellings."
                        value={draft.watchmanMinMatch}
                        def={defaults.watchmanMinMatch}
                        max={99}
                        onChange={(v) => set("watchmanMinMatch", v)}
                    />
                    <ScoreField
                        id="reviewMinScore"
                        label="Needs review at"
                        help="Entities whose best match reaches this go to an analyst."
                        value={draft.reviewMinScore}
                        def={defaults.reviewMinScore}
                        max={99}
                        onChange={(v) => set("reviewMinScore", v)}
                    />
                    <ScoreField
                        id="flaggedMinScore"
                        label="Flagged at"
                        help="Near-certain matches are flagged as high risk."
                        value={draft.flaggedMinScore}
                        def={defaults.flaggedMinScore}
                        max={100}
                        onChange={(v) => set("flaggedMinScore", v)}
                    />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm">
                    <label htmlFor="try-score" className="text-gray-600">
                        Try it: a
                    </label>
                    <input
                        id="try-score"
                        type="number"
                        min={0}
                        max={100}
                        value={tryScore}
                        onChange={(e) => setTryScore(Number(e.target.value))}
                        className="h-7 w-14 rounded-md border border-gray-200 px-2 text-right tabular-nums outline-none focus:border-gray-400"
                    />
                    <span className="text-gray-600">% match would be</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[outcome]}`}>{outcome}</span>
                </div>
            </SettingsCard>

            <SettingsCard
                title="Ownership rules"
                icon={<GitBranch className="h-4 w-4 text-gray-400" />}
                description="Applied to indirect stakes traced through the ownership graph. You can be stricter than the regulation, but not looser."
            >
                <div className="space-y-4">
                    <NumberField
                        id="ofacOwnershipRulePct"
                        label="OFAC ownership rule"
                        help="Treat an entity as blocked when sanctioned parties together own at least this much (OFAC 50% rule; max 50%)."
                        value={draft.ofacOwnershipRulePct}
                        def={defaults.ofacOwnershipRulePct}
                        min={1}
                        max={50}
                        suffix="%"
                        onChange={(v) => set("ofacOwnershipRulePct", v)}
                    />
                    <NumberField
                        id="beneficialOwnerPct"
                        label="Beneficial-owner review"
                        help="Send owners with at least this indirect stake for review (FinCEN uses 25%; max 25%)."
                        value={draft.beneficialOwnerPct}
                        def={defaults.beneficialOwnerPct}
                        min={1}
                        max={25}
                        suffix="%"
                        onChange={(v) => set("beneficialOwnerPct", v)}
                    />
                </div>
            </SettingsCard>

            <SettingsCard title="Search depth" icon={<Search className="h-4 w-4 text-gray-400" />}>
                <NumberField
                    id="watchmanResultLimit"
                    label="Matches per entity"
                    help="How many candidate sanctions entries to keep for each name. More gives analysts more context but slows screening."
                    value={draft.watchmanResultLimit}
                    def={defaults.watchmanResultLimit}
                    min={1}
                    max={100}
                    onChange={(v) => set("watchmanResultLimit", Math.round(v))}
                />
            </SettingsCard>

            {!dirty && <StatusLine status={status} />}

            {dirty && (
                <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                        {error ? (
                            <span className="text-red-600">{error}</span>
                        ) : status && !status.ok ? (
                            <span className="text-red-600">{status.text}</span>
                        ) : (
                            <span className="text-gray-600">Unsaved changes. They apply to the next screening.</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setDraft(current)} disabled={busy !== null}>
                            Discard
                        </Button>
                        <Button
                            onClick={() => void save()}
                            disabled={busy !== null || !!error}
                            className="bg-black text-white hover:bg-gray-900"
                        >
                            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
