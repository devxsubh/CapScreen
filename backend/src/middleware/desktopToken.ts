import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * The Electron shell generates a random token per launch, passes it to the
 * backend as CAPSCREEN_DESKTOP_TOKEN, and attaches it to every renderer request
 * as `x-capscreen-token`. Other local processes and web pages can reach
 * 127.0.0.1 but cannot know the token.
 *
 * Unset in `pnpm dev` (no Electron) — the API is then loopback-only but open.
 */
export const DESKTOP_TOKEN_HEADER = "x-capscreen-token";

export function desktopToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.CAPSCREEN_DESKTOP_TOKEN;
  if (!expected || req.method === "OPTIONS" || req.path === "/health" || req.path.startsWith("/api/files/")) {
    next();
    return;
  }
  const got = req.header(DESKTOP_TOKEN_HEADER) ?? "";
  if (got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    next();
    return;
  }
  res.status(403).json({ detail: "Forbidden" });
}
