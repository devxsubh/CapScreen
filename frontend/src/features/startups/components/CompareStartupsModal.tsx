"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { compareStartups, type CompareResult } from "@/api/portfolio";

interface Props {
  open: boolean;
  onClose: () => void;
  startupIds: string[];
}

export function CompareStartupsModal({ open, onClose, startupIds }: Props) {
  const [data, setData] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || startupIds.length < 2) return;
    setLoading(true);
    compareStartups(startupIds)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, startupIds]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-900">
            Compare startups
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {!loading && data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-4">Startup</th>
                      <th className="py-2 pr-4">Flagged</th>
                      <th className="py-2 pr-4">Review</th>
                      <th className="py-2">Top entities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.startups.map((s) => (
                      <tr key={s.startupId} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-medium">{s.startupName}</td>
                        <td className="py-2 pr-4 text-red-600">{s.flaggedCount}</td>
                        <td className="py-2 pr-4 text-amber-600">{s.reviewCount}</td>
                        <td className="py-2 text-gray-600">
                          {s.topEntities
                            .filter((e) => e.riskLevel !== "clear")
                            .map((e) => e.name)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.sharedUltimateOwners.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">
                    Shared ultimate owners
                  </h3>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {data.sharedUltimateOwners.map((o) => (
                      <li key={o.ownerName}>
                        <span className="font-medium">{o.ownerName}</span>
                        {" — "}
                        {o.startups.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
