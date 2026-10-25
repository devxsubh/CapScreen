import fs from "fs";
import type { NextFunction, Request, Response } from "express";
import { dataFile } from "../lib/infra/dataDir";

/**
 * Desktop app: one local data owner per installation. Requests are already
 * gated by the per-launch desktop token (middleware/desktopToken.ts).
 *
 * The signed-in CapScreen account (written to identity.json by the desktop
 * shell) is used for attribution — audit entries and review decisions record
 * who acted — while data ownership stays `local-user`, so records don't vanish
 * when a different person signs in on the same machine.
 */
export const LOCAL_USER_ID = "local-user";
export const LOCAL_USER_EMAIL = "you@capscreen.local";

type Identity = { email: string; displayName: string | null; organisation: string | null };
let cached: { mtimeMs: number; identity: Identity | null } | null = null;

export function signedInIdentity(): Identity | null {
  const file = dataFile("identity.json");
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    cached = null;
    return null;
  }
  if (cached?.mtimeMs === mtimeMs) return cached.identity;
  let identity: Identity | null = null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Identity>;
    if (typeof raw.email === "string" && raw.email) {
      identity = { email: raw.email.toLowerCase(), displayName: raw.displayName ?? null, organisation: raw.organisation ?? null };
    }
  } catch {
    identity = null;
  }
  cached = { mtimeMs, identity };
  return identity;
}

export async function requireAuth(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const identity = signedInIdentity();
  res.locals.userId = LOCAL_USER_ID;
  res.locals.userEmail = identity?.email ?? LOCAL_USER_EMAIL;
  res.locals.userName = identity?.displayName ?? null;
  next();
}
