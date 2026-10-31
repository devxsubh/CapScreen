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

export function toRagDocument(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    startupId: String(doc.startupId),
    filename: doc.filename,
    mimeType: doc.mimeType,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
    storageKey: doc.storageKey ?? null,
    sizeBytes: doc.sizeBytes ?? 0,
    chunkCount: doc.chunkCount,
    status: doc.status,
    errorMessage: doc.errorMessage ?? null,
  };
}

export function toGeneratedDocument(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    startupId: String(doc.startupId),
    kind: doc.kind ?? "custom",
    title: String(doc.title ?? "document"),
    content: doc.content,
    screeningScreenedAt: doc.screeningScreenedAt ?? null,
    createdAt: doc.createdAt ?? null,
  };
}
