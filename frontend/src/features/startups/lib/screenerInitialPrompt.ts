const storageKey = (startupId: string) =>
  `screener-initial-prompt:${startupId}`;

export function setScreenerInitialPrompt(
  startupId: string,
  prompt: string,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(storageKey(startupId), prompt);
}

export function consumeScreenerInitialPrompt(
  startupId: string,
): string | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(startupId);
  const value = sessionStorage.getItem(key);
  if (value) sessionStorage.removeItem(key);
  return value;
}

/** Prompt aligned with builtin-cap-table-screen workflow (F5). */
export const CAP_TABLE_SCREEN_WORKFLOW_PROMPT =
  "Run the Cap Table Sanctions Screen workflow on this cap table. " +
  "Summarize total entities screened and counts by risk level (flagged / review / clear). " +
  "Highlight highest-risk owners and ownership chains through shell companies. " +
  "Never conclude guilt — decision support only.";

export const DEFAULT_SCREENING_PROMPT = CAP_TABLE_SCREEN_WORKFLOW_PROMPT;

export type ScreenPurpose = "cap_table" | "co_investor" | "vendor";
