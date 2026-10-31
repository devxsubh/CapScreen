/**
 * An expected failure: the status and JSON body the client should get.
 * Services throw these; the error handler (http/errorHandler.ts) sends them
 * as `{ detail, ...extra }`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (detail: string, extra?: Record<string, unknown>) => new HttpError(400, detail, extra);
export const unauthorized = (detail: string, extra?: Record<string, unknown>) => new HttpError(401, detail, extra);
export const forbidden = (detail: string, extra?: Record<string, unknown>) => new HttpError(403, detail, extra);
export const notFound = (detail: string, extra?: Record<string, unknown>) => new HttpError(404, detail, extra);
export const conflict = (detail: string, extra?: Record<string, unknown>) => new HttpError(409, detail, extra);
