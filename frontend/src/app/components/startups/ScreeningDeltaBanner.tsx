"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { getScreeningDelta, type ScreeningDelta } from "@/lib/startupsApi";

interface Props {
  startupId: string;
  refreshKey?: number;
}

export function ScreeningDeltaBanner({ startupId, refreshKey = 0 }: Props) {
  const [delta, setDelta] = useState<ScreeningDelta | null>(null);

  useEffect(() => {
    getScreeningDelta(startupId)
      .then(setDelta)
      .catch(() => setDelta(null));
  }, [startupId, refreshKey]);

  if (!delta?.hasPrevious) return null;

  const hasEntityChanges = delta.changes.length > 0;
  const hasSummaryOnly =
    !hasEntityChanges &&
    delta.summary !== "No new or escalated flags since last screen.";

  if (!hasEntityChanges && !hasSummaryOnly) return null;

  const tone = hasEntityChanges
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-gray-200 bg-gray-50 text-gray-800";

  return (
    <div className={`mx-4 mb-2 rounded-lg border px-3 py-2 flex items-start gap-2 ${tone}`}>
      <TrendingUp className={`h-4 w-4 mt-0.5 shrink-0 ${hasEntityChanges ? "text-amber-600" : "text-gray-500"}`} />
      <div className="min-w-0 text-xs">
        <p className="font-medium">{delta.summary}</p>
        {hasEntityChanges && (
          <ul className="mt-1 text-amber-800/90 space-y-0.5">
            {delta.changes.slice(0, 4).map((c) => (
              <li key={c.entityName}>
                {c.entityName}: {c.previousRisk ?? "new"} → {c.newRisk}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
