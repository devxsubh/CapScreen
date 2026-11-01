/** Tabular reviews: grids, cell generation and grid chat. */

import type { AppDocument, AssistantEvent, TabularReview, TabularReviewDetailOut } from "@/types/app";
import { API_BASE, apiRequest } from "./client";
import { uploadProjectDocument, uploadStandaloneDocument } from "./projects";

export async function listTabularReviews(
    projectId?: string,
): Promise<TabularReview[]> {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return apiRequest<TabularReview[]>(`/tabular-review${qs}`);
}

export async function createTabularReview(payload: {
    title?: string;
    document_ids: string[];
    columns_config: { index: number; name: string; prompt: string }[];
    workflow_id?: string;
    project_id?: string;
}): Promise<TabularReview> {
    return apiRequest<TabularReview>("/tabular-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function getTabularReview(
    reviewId: string,
): Promise<TabularReviewDetailOut> {
    return apiRequest<TabularReviewDetailOut>(`/tabular-review/${reviewId}`);
}

export async function updateTabularReview(
    reviewId: string,
    payload: {
        title?: string;
        columns_config?: { index: number; name: string; prompt: string }[];
        document_ids?: string[];
        project_id?: string | null;
    },
): Promise<TabularReview> {
    return apiRequest<TabularReview>(`/tabular-review/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function generateTabularColumnPrompt(
    title: string,
    options?: { format?: string; documentName?: string; tags?: string[] },
): Promise<{ prompt: string; source: "preset" | "llm" | "fallback" }> {
    return apiRequest<{
        prompt: string;
        source: "preset" | "llm" | "fallback";
    }>("/tabular-review/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title,
            format: options?.format,
            documentName: options?.documentName,
            tags: options?.tags,
        }),
    });
}

export async function uploadReviewDocument(
    reviewId: string,
    file: File,
    options?: {
        projectId?: string;
        documentIds?: string[];
        columnsConfig?: { index: number; name: string; prompt: string }[];
    },
): Promise<AppDocument> {
    const uploaded = options?.projectId
        ? await uploadProjectDocument(options.projectId, file)
        : await uploadStandaloneDocument(file);

    await updateTabularReview(reviewId, {
        columns_config: options?.columnsConfig,
        document_ids: [...(options?.documentIds ?? []), uploaded.id],
    });

    return uploaded;
}

export async function deleteTabularReview(reviewId: string): Promise<void> {
    await apiRequest(`/tabular-review/${reviewId}`, { method: "DELETE" });
}

export async function streamTabularGeneration(
    reviewId: string,
): Promise<Response> {
    return fetch(`${API_BASE}/tabular-review/${reviewId}/generate`, {
        method: "POST",
    });
}

export async function streamTabularChat(
    reviewId: string,
    messages: { role: string; content: string }[],
    chat_id?: string | null,
    signal?: AbortSignal,
    context?: { reviewTitle?: string | null; projectName?: string | null },
): Promise<Response> {
    return fetch(`${API_BASE}/tabular-review/${reviewId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages,
            chat_id: chat_id ?? undefined,
            review_title: context?.reviewTitle ?? undefined,
            project_name: context?.projectName ?? undefined,
        }),
        signal: signal ?? undefined,
    });
}

export interface TRCitationAnnotation {
    type: "tabular_citation";
    ref: number;
    col_index: number;
    row_index: number;
    col_name: string;
    doc_name: string;
    quote: string;
}

interface RawTRMessage {
    id: string;
    chat_id: string;
    role: "user" | "assistant";
    content: string | AssistantEvent[] | null;
    annotations?: TRCitationAnnotation[] | null;
    created_at: string;
}

export interface TRDisplayMessage {
    role: "user" | "assistant";
    content: string;
    events?: AssistantEvent[];
    annotations?: TRCitationAnnotation[];
}

export interface TRChat {
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
}

export function mapTRMessages(raw: RawTRMessage[]): TRDisplayMessage[] {
    return raw.map((m) => {
        if (m.role === "user") {
            return {
                role: "user" as const,
                content: typeof m.content === "string" ? m.content : "",
            };
        }
        const events = Array.isArray(m.content)
            ? (m.content as AssistantEvent[])
            : undefined;
        const content =
            events
                ?.filter((e) => e.type === "content")
                .map((e) => (e as { type: "content"; text: string }).text)
                .join("") ?? "";
        return {
            role: "assistant" as const,
            content,
            events,
            annotations: m.annotations ?? undefined,
        };
    });
}

export async function getTabularChats(reviewId: string): Promise<TRChat[]> {
    return apiRequest<TRChat[]>(`/tabular-review/${reviewId}/chats`);
}

export async function getTabularChatMessages(
    reviewId: string,
    chatId: string,
): Promise<RawTRMessage[]> {
    return apiRequest<RawTRMessage[]>(
        `/tabular-review/${reviewId}/chats/${chatId}/messages`,
    );
}

export async function deleteTabularChat(
    reviewId: string,
    chatId: string,
): Promise<void> {
    await apiRequest(`/tabular-review/${reviewId}/chats/${chatId}`, {
        method: "DELETE",
    });
}

export async function regenerateTabularCell(
    reviewId: string,
    documentId: string,
    columnIndex: number,
    summary?: string,
): Promise<{
    summary: string;
    flag: "green" | "grey" | "yellow" | "red";
    reasoning: string;
}> {
    return apiRequest(`/tabular-review/${reviewId}/regenerate-cell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            document_id: documentId,
            column_index: columnIndex,
            ...(summary !== undefined ? { content: { summary } } : {}),
        }),
    });
}

export async function clearTabularCells(
    reviewId: string,
    documentIds: string[],
): Promise<void> {
    await apiRequest(`/tabular-review/${reviewId}/clear-cells`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: documentIds }),
    });
}
