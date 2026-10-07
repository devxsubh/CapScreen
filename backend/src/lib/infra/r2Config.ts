export function getR2AccountId(): string | null {
  return process.env.R2_ACCOUNT_ID?.trim() || null;
}

export function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME?.trim() || "capscreen-screener";
}

export function getR2EndpointUrl(): string | null {
  const explicit = process.env.R2_ENDPOINT_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const accountId = getR2AccountId();
  if (!accountId) return null;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function r2Configured(): boolean {
  return Boolean(
    getR2EndpointUrl() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      getR2BucketName(),
  );
}

export function getR2PublicUrl(): string | null {
  const raw = process.env.R2_PUBLIC_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

export function logR2StartupWarnings(): void {
  if (r2Configured()) {
    console.log(
      `[storage] Cloudflare R2 configured — bucket ${getR2BucketName()}`,
    );
    return;
  }
  console.warn(
    "[storage] R2 is not configured — file uploads will fail until R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are set",
  );
}
