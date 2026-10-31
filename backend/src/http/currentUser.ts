import type { Response } from "express";
import { HttpError } from "./httpError";

export type CurrentUser = { userId: string; userEmail: string };

/** The user set on res.locals by requireAuth (desktop) or requireJwt (auth service). */
export function currentUser(res: Response): CurrentUser {
  const { userId, userEmail } = res.locals;
  if (typeof userId !== "string" || !userId.trim()) {
    throw new HttpError(500, "Authenticated user identity missing");
  }
  if (typeof userEmail !== "string" || !userEmail.trim()) {
    throw new HttpError(500, "Authenticated user email missing");
  }
  return { userId: userId.trim(), userEmail: userEmail.trim() };
}
