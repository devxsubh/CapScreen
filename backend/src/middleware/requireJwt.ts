import type { NextFunction, Request, Response } from "express";
import { jwtConfigured } from "../lib/auth/config";
import { verifyAccessToken } from "../lib/auth/jwt";
import { connectDb } from "../lib/infra/db";
import { findUserById } from "../models";

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
    await connectDb();
    const claims = verifyAccessToken(token);
    const user = await findUserById(claims.sub);
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
