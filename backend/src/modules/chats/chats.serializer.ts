import type { ChatRecord } from "./chats.repository";

export function toChat(doc: ChatRecord) {
  return {
    id: String(doc._id),
    project_id: (doc.projectId as string | null) ?? null,
    user_id: doc.userId as string,
    title: (doc.title as string | null) ?? null,
    created_at: new Date(doc.createdAt as string).toISOString(),
  };
}
