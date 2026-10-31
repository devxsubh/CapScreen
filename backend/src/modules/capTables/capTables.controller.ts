import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import * as capTablesService from "./capTables.service";
import { toCsv } from "./capTables.serializer";

export async function preview(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const content = str(body.content);
  if (!content.trim()) throw badRequest("content is required");
  res.json(await capTablesService.preview(content, str(body.filename).trim() || undefined));
}

export async function list(req: Request, res: Response): Promise<void> {
  const csvs = await capTablesService.listCsvs(req.params.id);
  res.json(csvs.map(toCsv));
}

export async function upload(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const filename = str(body.filename).trim();
  const content = str(body.content);
  if (!filename || !content.trim()) throw badRequest("filename and content are required");
  const csv = await capTablesService.uploadCsv(
    req.params.id,
    { filename, content, confirmMapping: body.confirmMapping === true },
    currentUser(res),
  );
  res.status(201).json(toCsv(csv));
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const content = str(body.content);
  if (!content.trim()) throw badRequest("content is required");
  const csv = await capTablesService.updateCsv(
    req.params.id,
    req.params.csvId,
    { content, confirmMapping: body.confirmMapping === true },
    currentUser(res),
  );
  res.json(toCsv(csv));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await capTablesService.deleteCsv(req.params.id, req.params.csvId);
  res.status(204).send();
}
