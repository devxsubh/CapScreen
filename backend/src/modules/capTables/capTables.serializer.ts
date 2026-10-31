export function toCsv(raw: unknown) {
  const c = raw as Record<string, unknown>;
  return {
    id: String(c._id),
    startupId: String(c.startupId),
    filename: c.filename,
    content: c.content,
    uploadedAt: c.uploadedAt,
    updatedAt: c.updatedAt ?? null,
    parseStatus: c.parseStatus ?? "pending",
    parseErrors: c.parseErrors ?? [],
    recordCount: c.recordCount ?? 0,
    csvKind: c.csvKind ?? null,
    parseSource: c.parseSource ?? null,
    confidence: c.confidence ?? null,
    columnMapping: c.columnMapping ?? null,
    normalizedContent: c.normalizedContent ?? null,
    ingestWarnings: c.ingestWarnings ?? [],
    rosterPurpose: c.rosterPurpose ?? "cap_table",
  };
}
