function readKey(name: string): Buffer | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  return Buffer.from(raw, "base64");
}

export const JWT_ACCESS_TOKEN_SECRET_PRIVATE = readKey(
  "JWT_ACCESS_TOKEN_SECRET_PRIVATE",
);
export const JWT_ACCESS_TOKEN_SECRET_PUBLIC = readKey(
  "JWT_ACCESS_TOKEN_SECRET_PUBLIC",
);

export const JWT_ACCESS_TOKEN_EXPIRATION_MINUTES = Number.parseInt(
  process.env.JWT_ACCESS_TOKEN_EXPIRATION_MINUTES ?? "30",
  10,
);

export const REFRESH_TOKEN_EXPIRATION_DAYS = Number.parseInt(
  process.env.REFRESH_TOKEN_EXPIRATION_DAYS ?? "7",
  10,
);

/** Desktop sessions last longer (like a native app) than browser cookies. */
export const DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS = Number.parseInt(
  process.env.DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS ?? "30",
  10,
);

export function jwtConfigured(): boolean {
  return Boolean(
    JWT_ACCESS_TOKEN_SECRET_PRIVATE && JWT_ACCESS_TOKEN_SECRET_PUBLIC,
  );
}

export function logAuthStartupWarnings(): void {
  if (!jwtConfigured()) {
    console.warn(
      "[auth] JWT_ACCESS_TOKEN_SECRET_PRIVATE/PUBLIC are missing — auth endpoints will return 500 until configured (run: pnpm --filter vc-screener-backend run generate:jwt-keys)",
    );
  }
}
