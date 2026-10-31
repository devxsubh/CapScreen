import { randomUUID } from "crypto";
import * as workflowsRepository from "./workflows.repository";
import { BUILTIN_WORKFLOWS, type BuiltinColumn } from "./builtinWorkflows";

export type WorkflowType = "assistant" | "tabular";

export type ColumnConfig = BuiltinColumn;

export type WorkflowRecord = {
  id: string;
  user_id: string | null;
  is_system: boolean;
  created_at: string;
  title: string;
  type: WorkflowType;
  practice: string | null;
  prompt_md: string | null;
  columns_config: ColumnConfig[] | null;
};

const BUILTIN_RECORDS: WorkflowRecord[] = BUILTIN_WORKFLOWS.map((wf) => ({
  ...wf,
  user_id: null,
  is_system: true,
  created_at: "",
}));

function nowIso(): string {
  return new Date().toISOString();
}

function docToRecord(doc: Record<string, unknown>): WorkflowRecord {
  return {
    id: doc._id as string,
    user_id: (doc.user_id as string | null) ?? null,
    is_system: (doc.is_system as boolean) ?? false,
    created_at: doc.created_at as string,
    title: doc.title as string,
    type: doc.type as WorkflowType,
    practice: (doc.practice as string | null) ?? null,
    prompt_md: (doc.prompt_md as string | null) ?? null,
    columns_config: (doc.columns_config as ColumnConfig[] | null) ?? null,
  };
}

/** Built-in workflows first, then the user's own (newest first). */
export async function listWorkflows(
  userId: string,
  type?: WorkflowType,
): Promise<WorkflowRecord[]> {
  const own = (await workflowsRepository.listOwn(userId, type))
    .map(docToRecord)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const builtins = BUILTIN_RECORDS.filter((wf) => !type || wf.type === type);
  return [...builtins, ...own];
}

export async function getWorkflowById(
  workflowId: string,
  userId: string,
): Promise<WorkflowRecord | null> {
  const builtin = BUILTIN_RECORDS.find((wf) => wf.id === workflowId);
  if (builtin) return builtin;
  const doc = await workflowsRepository.findOwn(workflowId, userId);
  return doc ? docToRecord(doc) : null;
}

export async function createWorkflow(
  userId: string,
  payload: {
    title: string;
    type: WorkflowType;
    prompt_md?: string;
    columns_config?: ColumnConfig[];
    practice?: string | null;
  },
): Promise<WorkflowRecord> {
  const id = randomUUID();
  const doc = await workflowsRepository.create({
    _id: id,
    user_id: userId,
    is_system: false,
    created_at: nowIso(),
    title: payload.title.trim(),
    type: payload.type,
    practice: payload.practice ?? null,
    prompt_md: payload.prompt_md ?? null,
    columns_config: payload.columns_config ?? null,
  });
  return docToRecord(doc);
}

/** Built-in workflows are read-only; returns null for those and for unknown ids. */
export async function updateWorkflow(
  workflowId: string,
  userId: string,
  updates: {
    title?: string;
    prompt_md?: string;
    columns_config?: ColumnConfig[];
    practice?: string | null;
  },
): Promise<WorkflowRecord | null> {
  const patch: Record<string, unknown> = {};
  if (updates.title != null) patch.title = updates.title;
  if (updates.prompt_md != null) patch.prompt_md = updates.prompt_md;
  if (updates.columns_config != null) patch.columns_config = updates.columns_config;
  if ("practice" in updates) patch.practice = updates.practice ?? null;

  const updated = await workflowsRepository.updateOwn(workflowId, userId, patch);
  return updated ? docToRecord(updated) : null;
}

export async function deleteWorkflow(
  workflowId: string,
  userId: string,
): Promise<boolean> {
  return workflowsRepository.deleteOwn(workflowId, userId);
}

export async function listHiddenWorkflowIds(userId: string): Promise<string[]> {
  return workflowsRepository.listHiddenIds(userId);
}

export async function hideWorkflow(
  userId: string,
  workflowId: string,
): Promise<void> {
  await workflowsRepository.hide(userId, workflowId);
}

export async function unhideWorkflow(
  userId: string,
  workflowId: string,
): Promise<void> {
  await workflowsRepository.unhide(userId, workflowId);
}

export type WorkflowPrompt = { id: string; title: string; prompt_md: string };

/** Assistant workflows the agent can read with read_workflow. */
export async function buildWorkflowStore(
  userId: string,
): Promise<Map<string, WorkflowPrompt>> {
  const store = new Map<string, WorkflowPrompt>();
  for (const wf of await listWorkflows(userId, "assistant")) {
    if (wf.prompt_md) {
      store.set(wf.id, { id: wf.id, title: wf.title, prompt_md: wf.prompt_md });
    }
  }
  return store;
}
