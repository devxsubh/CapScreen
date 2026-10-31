import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./httpError";

const isProduction = process.env.NODE_ENV === "production";

/** 404 for anything no router matched. Mount after every route. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ detail: "Not found" });
}

/**
 * The one place errors become responses. HttpErrors carry their own status and
 * message; anything else is a bug or an upstream failure (a 500, hidden in
 * production).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message, ...err.extra });
    return;
  }

  // Respect status codes carried on the error (http-errors / body-parser style)
  const rawStatus = (err as Record<string, unknown>)?.status ?? (err as Record<string, unknown>)?.statusCode;
  const status: number =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600
      ? rawStatus
      : err instanceof SyntaxError
        ? 400
        : 500;

  if (status >= 500) {
    console.error(err);
  }

  const message =
    isProduction && status >= 500
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "An error occurred";

  res.status(status).json({ detail: message });
}
