"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import type {
  EntityResult,
  WatchmanMatch,
  WatchmanScorePiece,
} from "@/lib/screenerTypes";

function ProgramBadges({ programs }: { programs: string[] }) {
  if (programs.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {programs.map((p) => (
        <span
          key={p}
          className="inline-flex rounded-md bg-red-50 border border-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800"
        >
          {p}
        </span>
      ))}
    </div>
  );
}

function FieldTable({
  rows,
}: {
  rows: { label: string; value: string | undefined | null; mono?: boolean }[];
}) {
  const visible = rows.filter((r) => r.value);
  if (visible.length === 0) return null;

  return (
    <table className="w-full text-xs">
      <tbody>
        {visible.map((row) => (
          <tr key={row.label} className="border-t border-gray-100 first:border-0">
            <td className="py-2 pr-4 align-top font-medium text-gray-500 w-[130px] shrink-0">
              {row.label}
            </td>
            <td
              className={`py-2 align-top text-gray-900 break-words ${
                row.mono ? "font-mono text-[11px]" : ""
              }`}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatAddress(
  a: NonNullable<WatchmanMatch["addresses"]>[number],
): string {
  return [a.line1, a.line2, a.city, a.state, a.postalCode, a.country]
    .filter(Boolean)
    .join(", ");
}

function hitSourceLabel(match: WatchmanMatch): string {
  if (match.hitSource === "altName") return "Alias hit (altNames array)";
  if (match.hitSource === "v2") return "Unified v2 entity match";
  return "Primary SDN entry";
}

function formatListLabel(source?: string): string {
  if (!source) return "Unknown list";
  return source.replace(/_/g, " ").toUpperCase();
}

function MatchScoreBreakdown({ pieces }: { pieces: WatchmanScorePiece[] }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Field-level match breakdown
      </p>
      <div className="space-y-1.5">
        {pieces.map((p, i) => (
          <div
            key={`${p.pieceType}-${i}`}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="text-gray-700 capitalize">
              {p.pieceType.replace(/_/g, " ")}
              {p.exact && (
                <span className="ml-1 text-emerald-700 font-medium">exact</span>
              )}
            </span>
            <span
              className={`tabular-nums font-semibold ${
                p.matched ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {(p.score * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function vesselRows(m: WatchmanMatch) {
  const rows: { label: string; value: string }[] = [];
  if (m.callSign) rows.push({ label: "Call sign", value: m.callSign });
  if (m.vesselType) rows.push({ label: "Vessel type", value: m.vesselType });
  if (m.tonnage) rows.push({ label: "Tonnage", value: m.tonnage });
  if (m.grossRegisteredTonnage)
    rows.push({ label: "Gross tonnage", value: m.grossRegisteredTonnage });
  if (m.vesselFlag) rows.push({ label: "Vessel flag", value: m.vesselFlag });
  if (m.vesselOwner) rows.push({ label: "Vessel owner", value: m.vesselOwner });
  return rows;
}

function scoreColor(score: number): string {
  if (score >= 0.95) return "text-red-700 bg-red-50 border-red-200";
  if (score >= 0.8) return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-gray-700 bg-gray-50 border-gray-200";
}

export function WatchmanMatchDetails({
  match,
  index,
}: {
  match: WatchmanMatch;
  index: number;
}) {
  const isAlias = match.hitSource === "altName";
  const scoreCls = scoreColor(match.match);

  const fields: { label: string; value: string | undefined | null; mono?: boolean }[] =
    isAlias
      ? [
          { label: "List entry", value: match.sdnName },
          { label: "Alternate name", value: match.alternateName },
          { label: "Alternate type", value: match.alternateType },
          { label: "Alternate ID", value: match.alternateID, mono: true },
          { label: "Parent entity ID", value: match.entityID, mono: true },
          { label: "Matched as", value: match.matchedName, mono: true },
          { label: "Alt remarks", value: match.alternateRemarks },
        ]
      : [
          { label: "List name", value: match.sdnName },
          { label: "Source list", value: match.sourceList ? formatListLabel(match.sourceList) : undefined },
          { label: "Source ID", value: match.sourceID ?? match.entityID, mono: true },
          { label: "Entity type", value: (match.entityType ?? match.sdnType) || undefined },
          { label: "Matched as", value: match.matchedName, mono: true },
          { label: "Title", value: match.title },
          { label: "Remarks", value: match.remarks },
          ...(match.addresses?.map((a, i) => ({
            label: match.addresses!.length > 1 ? `Address ${i + 1}` : "Address",
            value: formatAddress(a),
          })) ?? []),
          ...(match.affiliations?.length
            ? [{ label: "Affiliations", value: match.affiliations.join("; ") }]
            : []),
          ...(match.cryptoAddresses?.length
            ? [{ label: "Crypto", value: match.cryptoAddresses.join(", "), mono: true }]
            : []),
          ...vesselRows(match).map((v) => ({ ...v, mono: false as const })),
        ];

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {match.sdnName}
            </p>
            <p className="text-[11px] text-gray-500">
              Match #{index + 1} · {hitSourceLabel(match)}
              {match.sourceList && (
                <> · {formatListLabel(match.sourceList)}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`rounded-lg border px-2.5 py-1 text-sm font-bold tabular-nums ${scoreCls}`}
          >
            {(match.match * 100).toFixed(1)}%
          </span>
          {match.secondarySanctions && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
              Secondary sanctions
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Sanctions programs
          </p>
          <ProgramBadges programs={match.programs} />
        </div>
        {match.matchDetails && match.matchDetails.length > 0 && (
          <MatchScoreBreakdown pieces={match.matchDetails} />
        )}
        <FieldTable rows={fields} />
      </div>
    </div>
  );
}

function ScreeningQueryPanel({ entity }: { entity: EntityResult }) {
  const q = entity.screeningQuery;
  if (!q) return null;

  const rows: { label: string; value: string | undefined }[] = [
    { label: "Request ID", value: q.requestId },
    { label: "Alt names", value: q.altNames?.join(", ") },
    { label: "Birth date", value: q.birthDate },
    { label: "Address", value: q.address },
    { label: "Country", value: q.country },
    { label: "Registration ID", value: q.registrationId },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Query sent to Watchman
      </p>
      <FieldTable rows={rows} />
    </div>
  );
}

export function WatchmanClearPanel({ entity }: { entity: EntityResult }) {
  const watchmanType = entity.type === "person" ? "person" : "business";

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 overflow-hidden">
      <ScreeningQueryPanel entity={entity} />
      <div className="flex items-center gap-3 px-4 py-3 border-b border-emerald-100">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">No sanctions match</p>
          <p className="text-xs text-emerald-700/80 mt-0.5">
            Watchman returned no entries at or above the match threshold
          </p>
        </div>
      </div>
      <table className="w-full text-xs px-4">
        <tbody>
          <tr className="border-t border-emerald-100">
            <td className="py-2.5 pl-4 pr-4 font-medium text-gray-500 w-[130px]">
              Queried name
            </td>
            <td className="py-2.5 pr-4 font-medium text-gray-900">{entity.name}</td>
          </tr>
          <tr className="border-t border-emerald-100">
            <td className="py-2.5 pl-4 pr-4 font-medium text-gray-500">Query type</td>
            <td className="py-2.5 pr-4 text-gray-900 capitalize">
              {watchmanType}{" "}
              <span className="text-gray-400">({entity.type})</span>
            </td>
          </tr>
          <tr className="border-t border-emerald-100">
            <td className="py-2.5 pl-4 pr-4 font-medium text-gray-500">Hits returned</td>
            <td className="py-2.5 pr-4 text-gray-900">0 above threshold</td>
          </tr>
          <tr className="border-t border-emerald-100">
            <td className="py-2.5 pl-4 pr-4 font-medium text-gray-500">Risk bucket</td>
            <td className="py-2.5 pr-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                Clear
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function WatchmanMatchesList({
  matches,
  entity,
}: {
  matches: WatchmanMatch[];
  entity?: EntityResult;
}) {
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      if (m.sourceList) set.add(m.sourceList);
    }
    return [...set].sort();
  }, [matches]);

  const filtered =
    sourceFilter === "all"
      ? matches
      : matches.filter((m) => m.sourceList === sourceFilter);

  if (matches.length === 0) {
    if (entity) return <WatchmanClearPanel entity={entity} />;
    return (
      <p className="text-sm text-gray-500">
        No Watchman hits for this entity.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entity?.screeningQuery && <ScreeningQueryPanel entity={entity} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {filtered.length} of {matches.length} entr
          {matches.length === 1 ? "y" : "ies"} (sorted by match score)
        </p>
        {sources.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                sourceFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              All lists
            </button>
            {sources.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                  sourceFilter === src
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {formatListLabel(src)}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.map((m, i) => (
        <WatchmanMatchDetails
          key={`${m.sourceID ?? m.entityID ?? m.sdnName}-${i}`}
          match={m}
          index={i}
        />
      ))}
    </div>
  );
}
