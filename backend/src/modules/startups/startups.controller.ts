import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import { accessibleStartup } from "./startupAccess";
import * as startupsService from "./startups.service";
import { toScreeningSummary, toStartup } from "./startups.serializer";

export async function list(_req: Request, res: Response): Promise<void> {
  const startups = await startupsService.listStartups(currentUser(res).userId);
  res.json(startups.map(toStartup));
}

export async function create(req: Request, res: Response): Promise<void> {
  const name = str(asBody(req.body).name).trim();
  if (!name) throw badRequest("name is required");
  res.status(201).json(toStartup(await startupsService.createStartup(name, currentUser(res).userId)));
}

export async function get(_req: Request, res: Response): Promise<void> {
  res.json(toStartup(accessibleStartup(res)));
}

export async function rename(req: Request, res: Response): Promise<void> {
  const name = str(asBody(req.body).name).trim();
  const startup = await startupsService.renameStartup(req.params.id, currentUser(res).userId, name);
  res.json(toStartup(startup));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await startupsService.deleteStartup(req.params.id);
  res.status(204).send();
}

export async function screeningSummary(_req: Request, res: Response): Promise<void> {
  const startups = await startupsService.listStartups(currentUser(res).userId);
  res.json(startups.map(toScreeningSummary));
}

/** Legacy alias of POST /api/portfolio/rescreen, kept for the frontend. */
export async function rescreenAll(_req: Request, res: Response): Promise<void> {
  res.json(await startupsService.rescreenAll(currentUser(res)));
}
