export const CSV_ASSET_PREFIX = "csv:";
export const SCREENING_ASSET_PREFIX = "screening:";

export function csvAssetId(projectId: string, csvId: string): string {
  return `${CSV_ASSET_PREFIX}${projectId}:${csvId}`;
}

export function parseCsvAssetId(
  id: string,
): { projectId: string; csvId: string } | null {
  if (!id.startsWith(CSV_ASSET_PREFIX)) return null;
  const parts = id.slice(CSV_ASSET_PREFIX.length).split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { projectId: parts[0], csvId: parts[1] };
}

export function isCsvAssetId(id: string): boolean {
  return id.startsWith(CSV_ASSET_PREFIX);
}

export function isScreeningAssetId(id: string): boolean {
  return id.startsWith(SCREENING_ASSET_PREFIX);
}

export function isDocumentAssetId(id: string): boolean {
  return !isCsvAssetId(id) && !isScreeningAssetId(id);
}
