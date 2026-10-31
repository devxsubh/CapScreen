import type { Request, Response } from "express";
import { currentUser } from "../../http/currentUser";
import { toAppDocument } from "../documents/documents.serializer";
import * as projectsService from "./projects.service";
import { toProject } from "./projects.serializer";

export async function list(_req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(res);
  const startups = await projectsService.listProjects(userId);
  res.json(startups.map((s) => toProject(s, userId)));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(res);
  const { startup, documents, assets } = await projectsService.getProject(req.params.projectId, userId);
  res.json(toProject(startup, userId, documents.map(toAppDocument), assets));
}
