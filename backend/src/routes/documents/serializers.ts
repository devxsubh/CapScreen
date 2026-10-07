export function toAppDocument(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    user_id: doc.ownerId,
    project_id: doc.projectId ? String(doc.projectId) : null,
    folder_id: null,
    filename: doc.filename,
    file_type: doc.fileType ?? null,
    storage_path: doc.storageKey,
    pdf_storage_path: null,
    size_bytes: doc.sizeBytes ?? 0,
    page_count: null,
    structure_tree: null,
    status: doc.status ?? "ready",
    created_at: doc.createdAt
      ? new Date(doc.createdAt as string | Date).toISOString()
      : null,
    updated_at: doc.updatedAt
      ? new Date(doc.updatedAt as string | Date).toISOString()
      : null,
    latest_version_number: null,
  };
}
