/** Workflows: built-ins plus the user's own. */

import type { AppWorkflow } from "@/types/app";
import { apiRequest } from "./client";

type WorkflowType = AppWorkflow["type"];

/** Built-in workflows (is_system) followed by the user's own. */
export async function listWorkflows(
    type?: WorkflowType,
): Promise<AppWorkflow[]> {
    return apiRequest<AppWorkflow[]>(type ? `/workflows?type=${type}` : "/workflows");
}

export async function getWorkflow(workflowId: string): Promise<AppWorkflow> {
    return apiRequest<AppWorkflow>(`/workflows/${workflowId}`);
}

export async function createWorkflow(payload: {
    title: string;
    type: "assistant" | "tabular";
    prompt_md?: string;
    columns_config?: { index: number; name: string; prompt: string }[];
    practice?: string | null;
}): Promise<AppWorkflow> {
    return apiRequest<AppWorkflow>("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function updateWorkflow(
    workflowId: string,
    payload: {
        title?: string;
        prompt_md?: string;
        columns_config?: { index: number; name: string; prompt: string }[];
        practice?: string | null;
    },
): Promise<AppWorkflow> {
    return apiRequest<AppWorkflow>(`/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
    await apiRequest(`/workflows/${workflowId}`, { method: "DELETE" });
}

export async function listHiddenWorkflows(): Promise<string[]> {
    return apiRequest<string[]>("/workflows/hidden");
}

export async function hideWorkflow(workflowId: string): Promise<void> {
    await apiRequest("/workflows/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId }),
    });
}

export async function unhideWorkflow(workflowId: string): Promise<void> {
    await apiRequest(`/workflows/hidden/${workflowId}`, { method: "DELETE" });
}
