import type { Response } from "express";

export const REFRESH_COOKIE_NAME = "vc_refresh_token";

const isProduction = process.env.NODE_ENV === "production";

export function setRefreshTokenCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth", // auth service mounts its routes here (authService/app.ts)
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth", // auth service mounts its routes here (authService/app.ts)
  });
}
