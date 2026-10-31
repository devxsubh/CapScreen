const MAX_CSV_BYTES = 500 * 1024;

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function validateCsvContent(
  value: unknown,
): { ok: true; content: string | null } | { ok: false; detail: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, content: null };
  }
  if (typeof value !== "string") {
    return { ok: false, detail: "csvContent must be a string" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, content: null };
  }
  if (byteLength(trimmed) > MAX_CSV_BYTES) {
    return {
      ok: false,
      detail: `csvContent exceeds ${MAX_CSV_BYTES / 1024} KB limit`,
    };
  }
  return { ok: true, content: trimmed };
}
