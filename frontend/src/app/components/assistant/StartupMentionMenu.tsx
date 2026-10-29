"use client";

import { useEffect, useMemo, useState } from "react";
import { listStartups, type StartupRecord } from "@/lib/startupsApi";

interface Props {
  value: string;
  cursor: number;
  onSelect: (startupName: string) => void;
  onClose: () => void;
}

function activeMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const fragment = before.slice(at + 1);
  if (fragment.includes(" ") || fragment.includes("\n")) return null;
  return fragment;
}

export function StartupMentionMenu({
  value,
  cursor,
  onSelect,
  onClose,
}: Props) {
  const [startups, setStartups] = useState<StartupRecord[]>([]);
  const query = activeMentionQuery(value, cursor);

  useEffect(() => {
    if (query === null) return;
    listStartups()
      .then(setStartups)
      .catch(() => setStartups([]));
  }, [query]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return startups
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, startups]);

  if (query === null || matches.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 bottom-full mb-1.5 z-20 rounded-xl border border-gray-100 bg-white shadow-xl overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-1.5 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-400">Mention a startup</span>
        {query && (
          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono">{query}</span>
        )}
      </div>
      <ul className="max-h-44 overflow-y-auto">
        {matches.map((s) => {
          const flagged = s.lastScreeningResult?.flaggedCount ?? 0;
          const review  = s.lastScreeningResult?.reviewCount ?? 0;
          const badge = flagged > 0
            ? <span className="text-[10px] font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">{flagged} flagged</span>
            : review > 0
            ? <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">{review} review</span>
            : s.lastScreeningResult
            ? <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">clear</span>
            : <span className="text-[10px] text-gray-400">not screened</span>;
          return (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between gap-3 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(s.name);
                  onClose();
                }}
              >
                <span className="font-medium text-gray-900 truncate">{s.name}</span>
                {badge}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function insertStartupMention(
  value: string,
  cursor: number,
  startupName: string,
): { nextValue: string; nextCursor: number } {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const at = before.lastIndexOf("@");
  const needsQuotes = /\s/.test(startupName);
  const mention = needsQuotes ? `@"${startupName}"` : `@${startupName}`;
  const nextValue = before.slice(0, at) + mention + " " + after;
  const nextCursor = at + mention.length + 1;
  return { nextValue, nextCursor };
}
