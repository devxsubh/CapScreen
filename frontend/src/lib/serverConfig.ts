/** Runtime config from the backend — provider/model names only, never keys. */
import { apiBase } from "@/lib/apiBase";

export type LlmRole = "agent" | "utility" | "embedding";

export type ServerLlmRole = {
  provider: string;
  label: string;
  model: string;
  /** True when this model runs on the user's machine (no data egress). */
  local: boolean;
};

export type ServerLlmConfig = {
  roles: Partial<Record<LlmRole, ServerLlmRole>>;
  error?: string;
};

let cached: ServerLlmConfig | null = null;

export async function getServerLlmConfig(): Promise<ServerLlmConfig> {
  if (cached) return cached;
  const base = apiBase();
  const resp = await fetch(`${base}/api/config`, { cache: "no-store" });
  if (!resp.ok) {
    return { roles: {} };
  }
  const data = (await resp.json()) as { llm?: ServerLlmConfig };
  cached = data.llm ?? { roles: {} };
  return cached;
}
