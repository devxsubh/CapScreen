import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest, notFound } from "../../http/httpError";
import * as workflowsService from "./workflows.service";
import type { ColumnConfig, WorkflowType } from "./workflows.service";

/**
 * Workflows are stored by lib/workflows/workflowMemory.ts, which is also what
 * the agent's list_workflows / read_workflow tools use; this is its HTTP edge.
 */

function parseType(value: unknown): WorkflowType | undefined {
  if (value === undefined) return undefined;
  if (value !== "assistant" && value !== "tabular") throw badRequest("type must be 'assistant' or 'tabular'");
  return value;
}

export async function list(req: Request, res: Response): Promise<void> {
  const type = parseType(typeof req.query.type === "string" && req.query.type ? req.query.type : undefined);
  res.json(await workflowsService.listWorkflows(currentUser(res).userId, type));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const title = str(body.title);
  if (!title.trim()) throw badRequest("title is required");
  const type = parseType(body.type ?? null);
  const created = await workflowsService.createWorkflow(currentUser(res).userId, {
    title,
    type: type!,
    prompt_md: body.prompt_md as string | undefined,
    columns_config: body.columns_config as ColumnConfig[] | undefined,
    practice: body.practice as string | null | undefined,
  });
  res.status(201).json(created);
}

export async function get(req: Request, res: Response): Promise<void> {
  const workflow = await workflowsService.getWorkflowById(req.params.workflowId, currentUser(res).userId);
  if (!workflow) throw notFound("Workflow not found");
  res.json(workflow);
}

/** PUT and PATCH both apply only the fields present in the body. */
export async function update(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const updates: {
    title?: string;
    prompt_md?: string;
    columns_config?: ColumnConfig[];
    practice?: string | null;
  } = {};
  if (body.title != null) updates.title = body.title as string;
  if (body.prompt_md != null) updates.prompt_md = body.prompt_md as string;
  if (body.columns_config != null) updates.columns_config = body.columns_config as ColumnConfig[];
  if ("practice" in body) updates.practice = (body.practice as string | null) ?? null;

  const updated = await workflowsService.updateWorkflow(req.params.workflowId, currentUser(res).userId, updates);
  if (!updated) throw notFound("Workflow not found or not editable");
  res.json(updated);
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!(await workflowsService.deleteWorkflow(req.params.workflowId, currentUser(res).userId))) {
    throw notFound("Workflow not found");
  }
  res.status(204).send();
}

export async function listHidden(_req: Request, res: Response): Promise<void> {
  res.json(await workflowsService.listHiddenWorkflowIds(currentUser(res).userId));
}

export async function hide(req: Request, res: Response): Promise<void> {
  const workflowId = str(asBody(req.body).workflow_id);
  if (!workflowId.trim()) throw badRequest("workflow_id is required");
  await workflowsService.hideWorkflow(currentUser(res).userId, workflowId);
  res.status(204).send();
}

export async function unhide(req: Request, res: Response): Promise<void> {
  await workflowsService.unhideWorkflow(currentUser(res).userId, req.params.workflowId);
  res.status(204).send();
}
