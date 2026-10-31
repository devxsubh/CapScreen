import type { NextFunction, Request, Response } from "express";
import { jwtConfigured } from "./config";
import { verifyAccessToken } from "./jwt";
import * as users from "./user.repository";

/**
 * Cloud auth service: require a valid RS256 access token (Authorization: Bearer).
 * The desktop app uses middleware/requireAuth.ts (single local user) instead.
 */
export async function requireJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ detail: "Authentication required" });
    return;
  }
  if (!jwtConfigured()) {
    res.status(500).json({ detail: "Server auth is not configured" });
    return;
  }
  try {
    const claims = verifyAccessToken(token);
    const user = await users.findById(claims.sub);
    if (!user) {
      res.status(401).json({ detail: "Invalid or expired token" });
      return;
    }
    res.locals.userId = user._id.toString();
    res.locals.userEmail = user.email.toLowerCase();
    res.locals.token = token;
    next();
  } catch {
    res.status(401).json({ detail: "Invalid or expired token" });
  }
}

/** 500 until the JWT keys are set (see config.ts), instead of failing mid-request. */
export function requireAuthConfigured(_req: Request, res: Response, next: NextFunction): void {
  if (jwtConfigured()) {
    next();
    return;
  }
  res.status(500).json({ detail: "Server auth is not configured" });
}
