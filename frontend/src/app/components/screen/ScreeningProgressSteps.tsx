"use client";

import { CheckCircle2, Circle, Loader2, AlertTriangle } from "lucide-react";
import type { ScreeningProgressEvent, ScreeningStage } from "@/lib/screenerTypes";

const STAGE_ORDER: ScreeningStage[] = [
  "parse",
  "graph",
  "screen",
  "exposure",
  "explain",
];

const STAGE_LABELS: Record<ScreeningStage, string> = {
  parse: "Parsing CSV",
  graph: "Building ownership graph",
  screen: "Screening sanctions lists",
  exposure: "Computing ownership exposure",
  explain: "Writing analyst notes",
};

function stageIndex(stage: ScreeningStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function latestProgressByStage(
  events: ScreeningProgressEvent[],
): Map<ScreeningStage, ScreeningProgressEvent> {
  const map = new Map<ScreeningStage, ScreeningProgressEvent>();
  for (const event of events) {
    map.set(event.stage, event);
  }
  return map;
}

interface Props {
  events: ScreeningProgressEvent[];
  isStreaming?: boolean;
}

export function ScreeningProgressSteps({ events, isStreaming = false }: Props) {
  if (events.length === 0) return null;

  const byStage = latestProgressByStage(events);
  const activeStage = [...events].reverse().find((e) => e.status === "start")?.stage;
  const maxReached = Math.max(
    ...events.map((e) => stageIndex(e.stage)),
    0,
  );

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Screening pipeline
      </p>
      <ul className="space-y-1">
        {STAGE_ORDER.map((stage, idx) => {
          const event = byStage.get(stage);
          const reached = idx <= maxReached;
          if (!reached && !event) return null;

          const isDone = event?.status === "done";
          const isWarn = event?.status === "warn";
          const isActive =
            isStreaming && activeStage === stage && event?.status === "start";

          let icon = (
            <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          );
          if (isDone) {
            icon = (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            );
          } else if (isWarn) {
            icon = (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            );
          } else if (isActive) {
            icon = (
              <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin shrink-0" />
            );
          }

          let detail = event?.detail ?? "";
          if (
            stage === "screen" &&
            event?.current != null &&
            event.total != null &&
            event.status === "start"
          ) {
            detail = event.detail
              ? `${event.detail} (${event.current}/${event.total})`
              : `Entity ${event.current} of ${event.total}`;
          }
          if (
            stage === "explain" &&
            event?.current != null &&
            event.total != null &&
            event.total > 0 &&
            event.status === "start"
          ) {
            detail = event.detail
              ? `${event.detail} (${event.current}/${event.total})`
              : `Narrative ${event.current} of ${event.total}`;
          }

          return (
            <li
              key={stage}
              className="flex items-start gap-2 text-xs text-gray-600"
            >
              <span className="mt-0.5">{icon}</span>
              <span className="min-w-0">
                <span className="font-medium text-gray-700">
                  {STAGE_LABELS[stage]}
                </span>
                {detail ? (
                  <span className="text-gray-500"> — {detail}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
