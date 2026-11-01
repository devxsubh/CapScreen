"use client";

import type { EntityResult } from "@/types/screening";
import { Building2, User } from "lucide-react";

interface Step {
  name: string;
  edgePct: number | null;
}

function stepsFromEntity(entity: EntityResult): Step[] {
  if (entity.ownershipPathSteps?.length) {
    return entity.ownershipPathSteps;
  }
  if (entity.ownershipPath.length > 1) {
    return entity.ownershipPath.map((name) => ({ name, edgePct: null }));
  }
  return [{ name: entity.name, edgePct: null }];
}

export function OwnershipChainVisual({
  entity,
  startupName,
}: {
  entity: EntityResult;
  startupName?: string;
}) {
  const steps = stepsFromEntity(entity);
  if (steps.length <= 1 && !startupName) return null;

  const portco = startupName ?? steps[steps.length - 1]?.name;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Ownership chain
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          From this entity down to the portfolio company
        </p>
      </div>
      <ol className="px-3 py-3 space-y-0">
        {steps.map((step, i) => {
          const isSubject = step.name === entity.name;
          const isPortco = step.name === portco && i === steps.length - 1;
          const isPerson = isSubject
            ? entity.type === "person"
            : false;

          return (
            <li key={`${step.name}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0 w-5">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    isSubject
                      ? "border-blue-500 bg-blue-50"
                      : isPortco
                        ? "border-gray-400 bg-gray-100"
                        : "border-gray-300 bg-white"
                  }`}
                >
                  <span className="text-[9px] font-bold text-gray-500">
                    {i + 1}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 min-h-[20px] bg-gray-200 my-0.5" />
                )}
              </div>

              <div className={`flex-1 min-w-0 pb-3 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <div
                  className={`rounded-md px-3 py-2 border ${
                    isSubject
                      ? "border-blue-200 bg-blue-50/60"
                      : isPortco
                        ? "border-gray-300 bg-gray-50"
                        : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {isPerson ? (
                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm leading-snug break-words ${
                          isSubject
                            ? "font-semibold text-gray-900"
                            : "font-medium text-gray-800"
                        }`}
                      >
                        {step.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {isSubject && (
                          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800">
                            Selected entity
                          </span>
                        )}
                        {isPortco && (
                          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 text-gray-700">
                            Portfolio company
                          </span>
                        )}
                        {entity.isUltimateOwner && isSubject && (
                          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                            UBO
                          </span>
                        )}
                      </div>
                    </div>
                    {step.edgePct != null && (
                      <span className="shrink-0 text-xs font-semibold text-gray-600 tabular-nums">
                        {step.edgePct}%
                      </span>
                    )}
                  </div>
                </div>
                {i < steps.length - 1 && step.edgePct != null && (
                  <p className="text-[10px] text-gray-400 mt-1 ml-1 pl-2">
                    owns {step.edgePct}% of next entity ↓
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {entity.indirectOwnershipPct != null && (
        <div className="px-3 py-2.5 border-t border-gray-100 bg-slate-50 text-xs text-slate-700">
          Effective stake in portfolio company:{" "}
          <span className="font-bold tabular-nums">
            {entity.indirectOwnershipPct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
