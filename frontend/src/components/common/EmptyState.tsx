import type { LucideIcon } from "lucide-react";

/** First-run screen for an empty page: what it's for, the first steps, and one action. */
export function EmptyState({
    icon: Icon,
    title,
    description,
    steps,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    steps?: string[];
    action?: React.ReactNode;
}) {
    return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)]">
                <Icon className="h-5 w-5 text-gray-600" />
            </span>
            <h2 className="mt-5 font-eb-garamond text-2xl font-medium text-gray-950">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{description}</p>
            {steps && steps.length > 0 && (
                <ol className="mt-5 w-full space-y-2 text-left">
                    {steps.map((step, i) => (
                        <li key={step} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-medium text-gray-600 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
                                {i + 1}
                            </span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
            )}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}
