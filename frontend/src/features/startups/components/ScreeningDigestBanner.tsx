"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getLatestDigest, type ScreeningDigest } from "@/api/portfolio";

interface Props {
  refreshKey?: number;
}

export function ScreeningDigestBanner({ refreshKey = 0 }: Props) {
  const [digest, setDigest] = useState<ScreeningDigest | null>(null);

  useEffect(() => {
    getLatestDigest()
      .then(setDigest)
      .catch(() => setDigest(null));
  }, [refreshKey]);

  if (!digest || (digest.newFlagCount === 0 && digest.newReviewCount === 0)) {
    return null;
  }

  return (
    <div className="mx-4 md:mx-10 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2">
      <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-amber-900">Re-screen digest</p>
        <p className="text-xs text-amber-800 mt-0.5">{digest.summaryText}</p>
        {digest.changes.length > 0 && (
          <ul className="mt-1.5 text-[11px] text-amber-900/90 space-y-0.5">
            {digest.changes.slice(0, 3).map((c) => (
              <li key={`${c.startupId}-${c.entityName}`}>
                {c.startupName}: {c.entityName} → {c.newRisk}
              </li>
            ))}
            {digest.changes.length > 3 && (
              <li>+{digest.changes.length - 3} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
