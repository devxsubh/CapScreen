import type { NextFunction, Request, Response } from "express";
import { jwtConfigured, previewModeEnabled } from "../lib/auth/config";
import { verifyAccessToken } from "../lib/auth/jwt";
import { connectDb } from "../lib/infra/db";
import { findUserById } from "../models";

const PREVIEW_USER_ID = "preview-user";
const PREVIEW_USER_EMAIL = "admin@capscreen.local";

function setPreviewUser(res: Response): void {
  res.locals.userId = PREVIEW_USER_ID;
  res.locals.userEmail = PREVIEW_USER_EMAIL;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
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
        return;
      } catch {
        res.status(401).json({ detail: "Invalid or expired token" });
        return;
      }
    }
  }

  if (previewModeEnabled()) {
    setPreviewUser(res);
    next();
    return;
  }

  res.status(401).json({ detail: "Authentication required" });
}
