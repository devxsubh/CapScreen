import type { NextFunction, Request, Response } from "express";
import { connectDb } from "../lib/infra/db";

/** Opens the database (once) before the request reaches a route. */
export function connectDatabase(_req: Request, _res: Response, next: NextFunction): void {
  connectDb().then(() => next(), next);
}
