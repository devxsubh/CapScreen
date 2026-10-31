import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import { currentUser } from "../../http/currentUser";
import { forbidden, notFound } from "../../http/httpError";
import { isSampleRecord } from "../../lib/sample/sampleAssets";
import * as startupsRepository from "./startups.repository";
import type { StartupRecord } from "./startups.repository";

/**
 * Guards every /api/startups/:id/... route: loads the startup (owned, or a
 * shared sample) into res.locals.startup, or answers 404.
 */
export const requireStartupAccess = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const startup = await startupsRepository.findAccessible(req.params.id, currentUser(res).userId);
  if (!startup) throw notFound("Startup not found");
  res.locals.startup = startup;
  next();
});

/** The startup loaded by requireStartupAccess. */
export function accessibleStartup(res: Response): StartupRecord {
  return res.locals.startup as StartupRecord;
}

/** Sample workspaces are shared and read-only. */
export function requireWritableStartup(_req: Request, res: Response, next: NextFunction): void {
  if (isSampleRecord(accessibleStartup(res))) {
    throw forbidden(
      "This is a shared sample workspace — it is read-only. Hide it from your list if you do not need it.",
    );
  }
  next();
}
