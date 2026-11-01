/** Shared fetch helper for the local backend (single local user, no auth header). */

import { apiBase } from "./apiBase";

export const API_BASE = apiBase();

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const { headers: initHeaders, ...restInit } = init ?? {};
    const response = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        credentials: "include",
        ...restInit,
        headers: {
            Accept: "application/json",
            ...(initHeaders as Record<string, string> | undefined),
        },
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `API error: ${response.status}`);
    }

    if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
    ) {
        return undefined as T;
    }

    return (await response.json()) as T;
}
