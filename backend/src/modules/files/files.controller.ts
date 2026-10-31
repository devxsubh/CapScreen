import path from "path";
import type { Request, Response } from "express";
import { HttpError, forbidden, notFound } from "../../http/httpError";
import { downloadObject, readDownloadToken } from "../../lib/infra/fileStorage";

/** GET /api/files/:token — serves a stored file for a signed, unexpired link. */
export async function download(req: Request, res: Response): Promise<void> {
  const token = readDownloadToken(req.params.token);
  if (!token.ok) {
    throw token.reason === "expired" ? new HttpError(410, "Download link expired") : forbidden("Invalid download link");
  }
  const body = await downloadObject(token.key);
  if (!body) throw notFound("File not found");
  res.setHeader("Content-Disposition", `attachment; filename="${token.filename.replace(/"/g, "")}"`);
  res.type(path.extname(token.filename) || "application/octet-stream").send(body);
}
