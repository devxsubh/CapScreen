"use client";

import { useCallback, useEffect, useState } from "react";
import type { EntityResult } from "@/lib/screenerTypes";
import {
  listEntityReviews,
  upsertEntityReview,
  type EntityReview,
} from "@/lib/startupsApi";

interface RiskTableProps {
  entities: EntityResult[];
  startupId?: string;
  onEntitySelect?: (entity: EntityResult) => void;
}

const REVIEW_STATUS_LABEL: Record<EntityReview["status"], string> = {
  pending: "—",
  cleared: "Cleared",
  escalated: "Escalated",
  blocked: "Blocked",
};

const REVIEW_STATUS_CLASS: Record<EntityReview["status"], string> = {
  pending: "text-gray-400",
  cleared: "text-green-600 font-medium",
  escalated: "text-amber-600 font-medium",
  blocked: "text-red-600 font-medium",
};

function RiskBadge({ level }: { level: string }) {
  if (level === "flagged")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
        Flagged
      </span>
    );
  if (level === "review")
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">
        Review
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
      Clear
    </span>
  );
}

function StatusDropdown({
  entityName,
  startupId,
  current,
  notes: initialNotes,
  onSave,
}: {
  entityName: string;
  startupId: string;
  current: EntityReview["status"];
  notes?: string | null;
  onSave: (status: EntityReview["status"], notes?: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [expanded, setExpanded] = useState(Boolean(initialNotes));

  async function persist(status: EntityReview["status"], nextNotes?: string) {
    setSaving(true);
    try {
      await upsertEntityReview(
        startupId,
        entityName,
        status,
        nextNotes?.trim() || undefined,
      );
      onSave(status, nextNotes?.trim() || null);
    } catch {
      // silently revert — the dropdown value is controlled by parent state
    } finally {
      setSaving(false);
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as EntityReview["status"];
    await persist(next, notes);
    if (next !== "pending") setExpanded(true);
  }

  async function handleNotesBlur() {
    if (current === "pending" && !notes.trim()) return;
    await persist(current, notes);
  }

  return (
    <div className="min-w-[120px]">
      <select
        disabled={saving}
        value={current}
        onChange={(e) => void handleChange(e)}
        className={`text-xs border-0 bg-transparent cursor-pointer focus:outline-none disabled:opacity-50 ${REVIEW_STATUS_CLASS[current]}`}
      >
        <option value="pending">—</option>
        <option value="cleared">Cleared</option>
        <option value="escalated">Escalated</option>
        <option value="blocked">Blocked</option>
      </select>
      {(expanded || current !== "pending") && (
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void handleNotesBlur()}
          placeholder="Review notes"
          className="mt-1 block w-full rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
      )}
      {!expanded && current === "pending" && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 block text-[10px] text-gray-400 hover:text-gray-600"
        >
          + notes
        </button>
      )}
    </div>
  );
}

export function RiskTable({ entities, startupId, onEntitySelect }: RiskTableProps) {
  const [reviews, setReviews] = useState<
    Map<string, { status: EntityReview["status"]; notes: string | null }>
  >(new Map());

  useEffect(() => {
    if (!startupId) return;
    listEntityReviews(startupId)
      .then((list) => {
        setReviews(
          new Map(
            list.map((r) => [
              r.entityName,
              { status: r.status, notes: r.notes },
            ]),
          ),
        );
      })
      .catch(() => {});
  }, [startupId]);

  const handleSave = useCallback(
    (name: string, status: EntityReview["status"], notes?: string | null) => {
      setReviews((prev) =>
        new Map(prev).set(name, { status, notes: notes ?? null }),
      );
    },
    [],
  );

  // Sort: flagged first, then review, then clear
  const sorted = [...entities].sort((a, b) => {
    const order = { flagged: 0, review: 1, clear: 2 };
    return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
  });

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="md:hidden rounded-lg border divide-y bg-white">
        {onEntitySelect && (
          <p className="text-[11px] text-gray-400 px-3 py-2 border-b bg-gray-50/80">
            Tap a row for Watchman sanctions details
          </p>
        )}
        {sorted.map((e) => {
          const review = reviews.get(e.name);
          const reviewStatus = review?.status ?? "pending";
          return (
            <div
              key={e.name}
              className={`px-3 py-3 ${onEntitySelect ? "cursor-pointer active:bg-gray-50" : ""}`}
              onClick={() => onEntitySelect?.(e)}
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <p className="font-medium text-gray-900 text-sm break-words min-w-0 flex-1">
                  {e.name}
                </p>
                <RiskBadge level={e.riskLevel} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="capitalize">
                  {e.role ? (
                    <span title={e.type}>{e.role}</span>
                  ) : (
                    e.type
                  )}
                </span>
                {e.isUltimateOwner && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    UBO
                  </span>
                )}
                {e.indirectOwnershipPct != null && (
                  <span
                    className={
                      e.indirectOwnershipPct >= 50
                        ? "font-semibold text-red-700"
                        : e.indirectOwnershipPct >= 25
                          ? "font-medium text-amber-700"
                          : ""
                    }
                  >
                    {e.indirectOwnershipPct.toFixed(1)}% indirect
                  </span>
                )}
                {e.topScore !== null && (
                  <span>{(e.topScore * 100).toFixed(0)}% match</span>
                )}
              </div>
              {e.ownershipPath.length > 1 && (
                <p
                  className="mt-1.5 text-[11px] text-gray-400 line-clamp-2"
                  title={e.ownershipPath.join(" → ")}
                >
                  {e.ownershipPath.join(" → ")}
                </p>
              )}
              <div
                className="mt-2"
                onClick={(ev) => ev.stopPropagation()}
              >
                {startupId ? (
                  <StatusDropdown
                    entityName={e.name}
                    startupId={startupId}
                    current={reviewStatus}
                    notes={review?.notes}
                    onSave={(status, notes) => handleSave(e.name, status, notes)}
                  />
                ) : (
                  <span className={`text-xs ${REVIEW_STATUS_CLASS[reviewStatus]}`}>
                    {REVIEW_STATUS_LABEL[reviewStatus]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {onEntitySelect && (
        <p className="text-[11px] text-gray-400 px-3 py-2 border-b bg-gray-50/80">
          Click a row for Watchman sanctions details
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-gray-700">
            <th className="px-4 py-3 text-left font-semibold">Entity</th>
            <th className="px-4 py-3 text-left font-semibold">Type</th>
            <th className="px-4 py-3 text-left font-semibold">UBO?</th>
            <th className="px-4 py-3 text-left font-semibold">Risk</th>
            <th className="px-4 py-3 text-left font-semibold">Indirect %</th>
            <th className="px-4 py-3 text-left font-semibold">Score</th>
            <th className="px-4 py-3 text-left font-semibold">Ownership path</th>
            <th className="px-4 py-3 text-left font-semibold">
              Status{" "}
              <span className="font-normal text-gray-400 text-xs">(human)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const review = reviews.get(e.name);
            const reviewStatus = review?.status ?? "pending";
            return (
              <tr
                key={e.name}
                className={`border-b last:border-0 hover:bg-gray-50 ${onEntitySelect ? "cursor-pointer" : ""}`}
                onClick={() => onEntitySelect?.(e)}
              >
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate" title={e.name}>
                  {e.name}
                </td>
                <td className="px-4 py-3 text-gray-500 capitalize">
                  {e.role ? (
                    <span title={e.type}>{e.role}</span>
                  ) : (
                    e.type
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {e.isUltimateOwner ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      UBO
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  <RiskBadge level={e.riskLevel} />
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {e.indirectOwnershipPct != null ? (
                    <span
                      className={
                        e.indirectOwnershipPct >= 50
                          ? "font-semibold text-red-700"
                          : e.indirectOwnershipPct >= 25
                            ? "font-medium text-amber-700"
                            : ""
                      }
                    >
                      {e.indirectOwnershipPct.toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {e.topScore !== null
                    ? `${(e.topScore * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate" title={e.ownershipPath.join(" → ")}>
                  {e.ownershipPath.length > 1
                    ? e.ownershipPath.join(" → ")
                    : e.name}
                </td>
                <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                  {startupId ? (
                    <StatusDropdown
                      entityName={e.name}
                      startupId={startupId}
                      current={reviewStatus}
                      notes={review?.notes}
                      onSave={(status, notes) => handleSave(e.name, status, notes)}
                    />
                  ) : (
                    <span className={`text-xs ${REVIEW_STATUS_CLASS[reviewStatus]}`}>
                      {REVIEW_STATUS_LABEL[reviewStatus]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
