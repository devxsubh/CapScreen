import {
    FileText,
    Globe,
    Pencil,
    Shield,
    Trash2,
    Upload,
    User,
} from "lucide-react";
import type { AuditLogEntry } from "@/app/lib/auditLogApi";

export const EVENT_LABELS: Record<AuditLogEntry["eventType"], string> = {
    screening_completed: "Screening completed",
    csv_uploaded: "CSV uploaded",
    csv_updated: "Cap table edited",
    entity_reviewed: "Entity reviewed",
    portfolio_reviewed: "Portfolio sign-off",
    ic_memo_generated: "IC memo generated",
    screening_analysis_generated: "Screening analysis generated",
    document_generated: "Document generated",
    document_uploaded: "Document uploaded",
    document_deleted: "Document deleted",
    agent_tool_approval: "Assistant tool approval",
};

export const EVENT_ICONS: Record<
    AuditLogEntry["eventType"],
    React.JSX.Element
> = {
    screening_completed: <Shield className="h-3.5 w-3.5 text-blue-500" />,
    csv_uploaded: <Upload className="h-3.5 w-3.5 text-gray-500" />,
    csv_updated: <Pencil className="h-3.5 w-3.5 text-amber-500" />,
    entity_reviewed: <User className="h-3.5 w-3.5 text-green-500" />,
    portfolio_reviewed: <Shield className="h-3.5 w-3.5 text-purple-500" />,
    ic_memo_generated: <FileText className="h-3.5 w-3.5 text-indigo-500" />,
    screening_analysis_generated: (
        <FileText className="h-3.5 w-3.5 text-indigo-500" />
    ),
    document_generated: <FileText className="h-3.5 w-3.5 text-indigo-500" />,
    document_uploaded: <Upload className="h-3.5 w-3.5 text-teal-600" />,
    document_deleted: <Trash2 className="h-3.5 w-3.5 text-red-400" />,
    agent_tool_approval: <Globe className="h-3.5 w-3.5 text-sky-500" />,
};

export function auditEventDetail(log: AuditLogEntry): string | null {
    const { eventType, details } = log;

    if (
        eventType === "screening_completed" &&
        typeof details.flaggedCount === "number"
    ) {
        return `${details.flaggedCount} flagged, ${details.reviewCount as number} review, ${details.clearCount as number} clear`;
    }

    if (
        eventType === "entity_reviewed" &&
        typeof details.entityName === "string"
    ) {
        const outcome =
            typeof details.outcome === "string" ? ` → ${details.outcome}` : "";
        return `${details.entityName}${outcome}`;
    }

    if (
        eventType === "portfolio_reviewed" &&
        typeof details.outcome === "string"
    ) {
        return details.outcome;
    }

    if (
        (eventType === "document_uploaded" ||
            eventType === "document_deleted") &&
        typeof details.filename === "string"
    ) {
        return details.filename;
    }

    if (
        (eventType === "document_generated" ||
            eventType === "ic_memo_generated" ||
            eventType === "screening_analysis_generated") &&
        typeof details.title === "string"
    ) {
        return details.title;
    }

    if (
        eventType === "agent_tool_approval" &&
        Array.isArray(details.tools)
    ) {
        const verdict = details.approved ? "Allowed" : "Declined";
        return `${verdict}: ${(details.tools as string[]).join(", ")}`;
    }

    return null;
}
