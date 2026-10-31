import type { Request, Response } from "express";
import { asBody } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { buildVerifiedExport } from "../auditLogs/auditLogs.service";
import * as desktopService from "./desktop.service";

export async function getSettings(_req: Request, res: Response): Promise<void> {
  res.json(desktopService.getSettings());
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  res.json(desktopService.updateSettings(asBody(req.body)));
}

export async function erase(req: Request, res: Response): Promise<void> {
  res.json(await desktopService.eraseData(asBody(req.body).confirm));
}

export async function sanctions(_req: Request, res: Response): Promise<void> {
  res.json(await desktopService.sanctionsStatus());
}

export async function backup(req: Request, res: Response): Promise<void> {
  const { file, manifest } = desktopService.backup(String(asBody(req.body).password ?? ""));
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="capscreen-${manifest.createdAt.slice(0, 10)}.capscreen-backup"`);
  res.setHeader("X-Backup-Entries", String(manifest.entries.length));
  res.send(file);
}

/** Body: the raw backup file; password in the x-backup-password header (URI-encoded). */
export async function restore(req: Request, res: Response): Promise<void> {
  const password = decodeURIComponent(req.header("x-backup-password") ?? "");
  const manifest = desktopService.restore(req.body as Buffer, password);
  res.json({ ok: true, createdAt: manifest.createdAt, entries: manifest.entries.length, restarting: true });
}

export async function getWatchFolder(req: Request, res: Response): Promise<void> {
  res.json({ watch: desktopService.watchFolder(req.params.startupId) });
}

export async function setWatchFolder(req: Request, res: Response): Promise<void> {
  const path = (asBody(req.body).path as string | null | undefined) ?? null;
  const watch = await desktopService.setStartupWatchFolder(req.params.startupId, currentUser(res).userId, path);
  res.json({ watch });
}

export async function auditExport(req: Request, res: Response): Promise<void> {
  const startupId = typeof req.query.startupId === "string" && req.query.startupId ? req.query.startupId : undefined;
  const doc = await buildVerifiedExport(startupId);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="capscreen-audit-${doc.exportedAt.slice(0, 10)}.json"`);
  res.send(JSON.stringify(doc, null, 2));
}
