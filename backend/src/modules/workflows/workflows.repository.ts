import { HiddenWorkflowModel, WorkflowModel } from "../../models";

/** Data access for the user's own workflows and the built-ins they've hidden. */

export type WorkflowDoc = Record<string, unknown>;

export async function listOwn(userId: string, type?: string): Promise<WorkflowDoc[]> {
  return (await WorkflowModel.find({ is_system: false, user_id: userId, ...(type ? { type } : {}) }).lean()) as WorkflowDoc[];
}

export async function findOwn(id: string, userId: string): Promise<WorkflowDoc | null> {
  return (await WorkflowModel.findOne({ _id: id, user_id: userId }).lean()) as WorkflowDoc | null;
}

export async function create(fields: Record<string, unknown>): Promise<WorkflowDoc> {
  return (await WorkflowModel.create(fields)).toObject() as WorkflowDoc;
}

export async function updateOwn(id: string, userId: string, patch: Record<string, unknown>): Promise<WorkflowDoc | null> {
  return (await WorkflowModel.findOneAndUpdate(
    { _id: id, user_id: userId, is_system: false },
    { $set: patch },
    { new: true },
  ).lean()) as WorkflowDoc | null;
}

export async function deleteOwn(id: string, userId: string): Promise<boolean> {
  return (await WorkflowModel.findOneAndDelete({ _id: id, user_id: userId, is_system: false })) !== null;
}

export async function listHiddenIds(userId: string): Promise<string[]> {
  const docs = (await HiddenWorkflowModel.find({ user_id: userId }).lean()) as WorkflowDoc[];
  return docs.map((d) => d.workflow_id as string);
}

export async function hide(userId: string, workflowId: string): Promise<void> {
  await HiddenWorkflowModel.updateOne(
    { user_id: userId, workflow_id: workflowId },
    { $setOnInsert: { user_id: userId, workflow_id: workflowId } },
    { upsert: true },
  );
}

export async function unhide(userId: string, workflowId: string): Promise<void> {
  await HiddenWorkflowModel.deleteOne({ user_id: userId, workflow_id: workflowId });
}
