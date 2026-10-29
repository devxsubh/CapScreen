import { Globe } from "lucide-react";
import type { AssistantEvent } from "@/app/components/shared/types";

type ApprovalRequest = Extract<AssistantEvent, { type: "approval_request" }>;

const TOOL_DESCRIPTIONS: Record<string, string> = {
    web_search: "Search the web (sends this query to an outside search service)",
};

const STATUS_TEXT: Record<ApprovalRequest["status"], string> = {
    pending: "Waiting for approval",
    approved: "Allowed",
    declined: "Declined — the assistant continued without it",
    skipped: "Not answered",
};

/**
 * Shown when the assistant pauses before a sensitive tool. Nothing runs
 * until the user picks Allow or Deny; the choice is written to the audit log.
 */
export function ApprovalCard({
    request,
    onAnswer,
}: {
    request: ApprovalRequest;
    onAnswer?: (runId: string, approved: boolean) => void;
}) {
    const isPending = request.status === "pending";

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 font-serif text-sm">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-gray-800">
                <Globe className="h-3.5 w-3.5 text-amber-600" />
                The assistant wants to:
            </div>
            <ul className="mb-2 space-y-1 text-gray-700">
                {request.calls.map((call, i) => (
                    <li key={i}>
                        {TOOL_DESCRIPTIONS[call.name] ?? `Run ${call.name}`}
                        <QueryPreview input={call.input} />
                    </li>
                ))}
            </ul>

            {isPending && onAnswer ? (
                <div className="flex gap-2">
                    <button
                        onClick={() => onAnswer(request.runId, true)}
                        className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                    >
                        Allow
                    </button>
                    <button
                        onClick={() => onAnswer(request.runId, false)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Deny
                    </button>
                </div>
            ) : (
                <div className="text-xs text-gray-500">
                    {STATUS_TEXT[request.status]}
                </div>
            )}
        </div>
    );
}

/** Shows the search query so the user knows exactly what would leave the machine. */
function QueryPreview({ input }: { input: unknown }) {
    const query =
        typeof input === "object" && input !== null && "query" in input
            ? String((input as { query: unknown }).query)
            : null;
    if (!query) return null;
    return (
        <div className="mt-0.5 rounded bg-white px-2 py-1 font-mono text-xs text-gray-600">
            {query}
        </div>
    );
}
