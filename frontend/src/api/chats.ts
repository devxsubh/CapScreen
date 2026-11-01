/** Saved assistant chats and the agent chat stream (POST /chat). */

import { normalizeAppMessages } from "@/lib/normalizeAppMessages";
import type { AppChat, AppChatDetailOut, AppMessage } from "@/types/app";
import { API_BASE, apiRequest } from "./client";

export async function saveChatMessages(
    chatId: string,
    messages: AppMessage[],
): Promise<void> {
    if (!chatId) return;
    await apiRequest(`/api/chats/${chatId}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
    });
}

export async function createChat(payload?: {
    project_id?: string;
}): Promise<{ id: string }> {
    return apiRequest<{ id: string }>("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
    });
}

export async function listChats(options?: { limit?: number }): Promise<AppChat[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    return apiRequest<AppChat[]>(`/api/chats${query ? `?${query}` : ""}`);
}

export async function getChat(chatId: string): Promise<AppChatDetailOut> {
    const data = await apiRequest<AppChatDetailOut>(`/api/chats/${chatId}`);
    return {
        ...data,
        messages: normalizeAppMessages(data.messages ?? []),
    };
}

export async function renameChat(chatId: string, title: string): Promise<void> {
    await apiRequest(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
}

export async function deleteChat(chatId: string): Promise<void> {
    await apiRequest(`/api/chats/${chatId}`, { method: "DELETE" });
}

export async function generateChatTitle(
    chatId: string,
    message: string,
): Promise<{ title: string }> {
    return apiRequest<{ title: string }>(`/api/chats/${chatId}/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
}

export async function streamChat(payload: {
    messages: {
        role: string;
        content: string;
        files?: { filename: string; document_id?: string }[];
        workflow?: { id: string; title: string };
    }[];
    chat_id?: string;
    project_id?: string;
    model?: string;
    csvContent?: string | null;
    screeningResult?: unknown;
    displayed_doc?: { filename: string; document_id: string };
    attached_documents?: { filename: string; document_id: string }[];
    signal?: AbortSignal;
}): Promise<Response> {
    const { signal, ...body } = payload;

    return fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal,
    });
}

/**
 * Answers an approval request from the assistant ("may I search the web?")
 * and returns the SSE stream with the rest of the reply.
 */
export async function resumeAgentRun(
    runId: string,
    approved: boolean,
    signal?: AbortSignal,
): Promise<Response> {
    return fetch(`${API_BASE}/chat/runs/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify({ approved }),
        signal,
    });
}

type StreamChatMessage = {
    role: string;
    content: string;
    files?: { filename: string; document_id?: string }[];
    workflow?: { id: string; title: string };
};

export async function streamProjectChat(payload: {
    projectId: string;
    messages: StreamChatMessage[];
    chat_id?: string;
    model?: string;
    csvContent?: string | null;
    screeningResult?: unknown;
    displayed_doc?: { filename: string; document_id: string };
    attached_documents?: { filename: string; document_id: string }[];
    signal?: AbortSignal;
}): Promise<Response> {
    const { projectId, signal, ...body } = payload;

    return fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify({
            ...body,
            project_id: projectId,
            startup_id: projectId,
        }),
        signal,
    });
}
