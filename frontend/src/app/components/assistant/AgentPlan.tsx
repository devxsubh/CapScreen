import { Check, Circle, Loader2 } from "lucide-react";
import type { AgentPlanStep } from "@/app/components/shared/types";

/** The assistant's step-by-step plan, shown as a live checklist. */
export function AgentPlan({ steps }: { steps: AgentPlanStep[] }) {
    const done = steps.filter((s) => s.status === "done").length;

    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 font-serif text-sm">
            <div className="mb-1.5 text-xs font-medium text-gray-500">
                Plan · {done}/{steps.length} done
            </div>
            <ol className="space-y-1">
                {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <StepIcon status={step.status} />
                        <span
                            className={
                                step.status === "done"
                                    ? "text-gray-400 line-through"
                                    : step.status === "in_progress"
                                      ? "font-medium text-gray-800"
                                      : "text-gray-600"
                            }
                        >
                            {step.title}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function StepIcon({ status }: { status: AgentPlanStep["status"] }) {
    if (status === "done") {
        return <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />;
    }
    if (status === "in_progress") {
        return (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        );
    }
    return <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />;
}
