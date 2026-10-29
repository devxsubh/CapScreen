"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Loader2, Shield, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EntityResult } from "@/lib/screenerTypes";
import { WatchmanMatchesList } from "@/app/components/screen/WatchmanMatchDetails";
import { OwnershipChainVisual } from "@/app/components/screen/OwnershipChainVisual";
import { fetchEntityExplanation } from "@/lib/screeningExplainApi";

interface Props {
  entity: EntityResult | null;
  onClose: () => void;
  startupName?: string;
}

const RISK_THEME: Record<
  string,
  { badge: string; border: string; accent: string }
> = {
  flagged: {
    badge: "bg-red-100 text-red-800 ring-red-200",
    border: "border-red-300",
    accent: "bg-red-500",
  },
  review: {
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    border: "border-amber-300",
    accent: "bg-amber-500",
  },
  clear: {
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    border: "border-emerald-300",
    accent: "bg-emerald-500",
  },
};

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums truncate ${
          highlight ? "text-red-700" : "text-gray-900"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function EntityDetailModal({ entity, onClose, startupName }: Props) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  useEffect(() => {
    if (!entity) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [entity, onClose]);

  useEffect(() => {
    if (!entity) {
      setExplanation(null);
      setExplanationLoading(false);
      setExplanationError(null);
      return;
    }

    if (entity.explanation) {
      setExplanation(entity.explanation);
      setExplanationLoading(false);
      setExplanationError(null);
      return;
    }

    if (entity.riskLevel === "clear") {
      setExplanation(null);
      setExplanationLoading(false);
      setExplanationError(null);
      return;
    }

    let cancelled = false;
    setExplanation(null);
    setExplanationLoading(true);
    setExplanationError(null);

    void fetchEntityExplanation(entity, startupName)
      .then((text) => {
        if (!cancelled) {
          setExplanation(text);
          setExplanationLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setExplanationError(
            err instanceof Error ? err.message : "Failed to load analyst notes",
          );
          setExplanationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entity, startupName]);

  if (!entity) return null;

  const theme = RISK_THEME[entity.riskLevel] ?? RISK_THEME.clear;
  const hasMatches = entity.matches.length > 0;
  const topPrograms = [
    ...new Set(entity.matches.flatMap((m) => m.programs)),
  ].slice(0, 3);
  const showChain =
    entity.ownershipPath.length > 1 || entity.ownershipPathSteps?.length;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={`relative z-[201] flex flex-col w-full max-w-3xl max-h-[100dvh] sm:max-h-[92vh] bg-white shadow-2xl border-2 ${theme.border} overflow-hidden rounded-t-2xl sm:rounded-2xl`}
      >
        <div className={`h-1 shrink-0 ${theme.accent}`} />

        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b shrink-0 bg-white">
          <div className="flex gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                entity.riskLevel !== "clear"
                  ? "bg-red-50 border-red-100"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              {entity.type === "person" ? (
                <User className="h-5 w-5 text-gray-600" />
              ) : (
                <Building2 className="h-5 w-5 text-gray-600" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="entity-detail-title"
                className="text-lg font-bold text-gray-900 leading-tight break-words"
              >
                {entity.name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${theme.badge}`}
                >
                  {entity.riskLevel}
                </span>
                <span className="text-xs text-gray-500 capitalize">
                  {entity.type}
                </span>
                {entity.isUltimateOwner && (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 ring-1 ring-gray-200">
                    Ultimate beneficial owner
                  </span>
                )}
                {entity.role && (
                  <span className="text-xs text-gray-400">· {entity.role}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b bg-gray-50/50 shrink-0">
          <StatCell
            label="Top match score"
            value={
              entity.topScore !== null
                ? `${(entity.topScore * 100).toFixed(1)}%`
                : "—"
            }
            highlight={entity.riskLevel === "flagged"}
          />
          <StatCell
            label="Watchman hits"
            value={String(entity.matches.length)}
            highlight={hasMatches}
          />
          <StatCell
            label="Indirect stake"
            value={
              entity.indirectOwnershipPct != null
                ? `${entity.indirectOwnershipPct.toFixed(1)}%`
                : "—"
            }
            highlight={
              entity.indirectOwnershipPct != null &&
              entity.indirectOwnershipPct >= 25
            }
          />
          <StatCell
            label="Programs"
            value={topPrograms.length > 0 ? topPrograms.join(", ") : "—"}
            highlight={topPrograms.length > 0}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {entity.exposureStatement && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">
                Ownership exposure
              </p>
              <p className="text-sm text-amber-950 leading-relaxed">
                {entity.exposureStatement}
              </p>
              {entity.ownershipRuleFlags && entity.ownershipRuleFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {entity.ownershipRuleFlags.map((flag) => (
                    <span
                      key={flag}
                      className="inline-flex rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                    >
                      {flag === "ofac_50" ? "OFAC 50% rule" : "UBO 25%+"}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {showChain && (
            <OwnershipChainVisual entity={entity} startupName={startupName} />
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-gray-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Watchman sanctions data
                </h3>
                <p className="text-[11px] text-gray-400">
                  Deterministic OFAC/EU list matching — raw API response, not
                  AI-generated
                </p>
              </div>
            </div>
            <WatchmanMatchesList matches={entity.matches} entity={entity} />
          </section>

          {(explanationLoading || explanation || explanationError) && (
            <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Analyst notes
                <span className="font-normal normal-case ml-1">
                  — AI summary only, not a sanctions determination
                </span>
              </h3>
              {explanationLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Generating analyst summary…
                </div>
              )}
              {explanationError && (
                <p className="text-sm text-red-600">{explanationError}</p>
              )}
              {explanation && !explanationLoading && (
                <div className="text-sm text-gray-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {explanation}
                  </ReactMarkdown>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
