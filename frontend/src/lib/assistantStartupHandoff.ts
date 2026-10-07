import type { AppMessage } from "@/app/components/shared/types";

export type AssistantStartupHandoff = {
  filename: string;
  content: string;
  chatId?: string;
  /** Assistant message index in the chat when screening found flags. */
  messageIndex?: number;
};

const STORAGE_KEY = "assistant-startup-handoff";

export function saveAssistantStartupHandoff(
  data: AssistantStartupHandoff,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadAssistantStartupHandoff(
  chatId?: string,
): AssistantStartupHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AssistantStartupHandoff;
    if (!parsed.filename || typeof parsed.content !== "string") return null;
    if (chatId && parsed.chatId && parsed.chatId !== chatId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAssistantStartupHandoff(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function csvFileFromHandoff(
  handoff: AssistantStartupHandoff,
): File {
  return new File([handoff.content], handoff.filename, { type: "text/csv" });
}

export function lastAssistantMessageIndex(messages: AppMessage[]): number {
  return messages.map((m) => m.role).lastIndexOf("assistant");
}

export function resolveCsvFromMessages(
  messages: AppMessage[],
  csvContent?: string | null,
  csvFilename?: string | null,
): { filename: string; content: string } | null {
  if (csvContent?.trim() && csvFilename) {
    return { content: csvContent, filename: csvFilename };
  }
  if (csvContent?.trim()) {
    return { content: csvContent, filename: "cap-table.csv" };
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user" || !message.csvContent?.trim()) continue;
    const csvFile = message.files?.find((f) =>
      f.filename.toLowerCase().endsWith(".csv"),
    );
    return {
      content: message.csvContent,
      filename: csvFile?.filename ?? "cap-table.csv",
    };
  }

  return null;
}

export function screeningNeedsStartupHandoff(result: {
  flaggedCount: number;
}): boolean {
  return result.flaggedCount > 0;
}
