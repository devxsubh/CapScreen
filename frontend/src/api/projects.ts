/** Startups seen as projects, and their documents. */

import type { AppDocument, AppProject } from "@/types/app";
import { API_BASE, apiRequest } from "./client";

/** Startups seen as projects (with their documents, CSVs and screenings). */
export async function listProjects(): Promise<AppProject[]> {
    return apiRequest<AppProject[]>("/projects");
}

export async function getProject(projectId: string): Promise<AppProject> {
    return apiRequest<AppProject>(`/projects/${projectId}`);
}

// Documents

export async function uploadProjectDocument(
    projectId: string,
    file: File,
): Promise<AppDocument> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(
        `${API_BASE}/projects/${projectId}/documents`,
        {
            method: "POST",
            body: form,
        },
    );
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<AppDocument>;
}

export async function uploadStandaloneDocument(
    file: File,
): Promise<AppDocument> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_BASE}/single-documents`, {
        method: "POST",
        body: form,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<AppDocument>;
}

export async function listStandaloneDocuments(): Promise<AppDocument[]> {
    return apiRequest<AppDocument[]>("/single-documents");
}

export async function deleteDocument(documentId: string): Promise<void> {
    await apiRequest(`/single-documents/${documentId}`, { method: "DELETE" });
}
