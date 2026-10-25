import { apiBase } from "@/lib/apiBase";

export type LlmRole = "agent" | "utility" | "embedding";

export type RoleBinding = { provider: string; model: string; supportsTools?: boolean };

export type RoleSummary = {
  provider: string;
  label: string;
  model: string;
  local: boolean;
  supportsTools: boolean;
  error?: string;
};

export type ProviderView = {
  id: string;
  label: string;
  kind: "anthropic" | "openai-compatible" | "ollama";
  baseUrl: string | null;
  local: boolean;
  preset: boolean;
  enabled: boolean;
  needsKey: boolean;
  key: { configured: boolean; hint: string | null; updatedAt: string | null };
  envKey: boolean;
};

export type AiState = {
  configured: boolean;
  localOnly: boolean;
  roles: Partial<Record<LlmRole, RoleBinding>>;
  effective: {
    roles: Partial<Record<LlmRole, RoleSummary>>;
    localOnly: boolean;
    source: "control-center" | "env";
    error?: string;
  };
  providers: ProviderView[];
};

export type Fit = "great" | "ok" | "tight" | "too-large";

export type CatalogModel = {
  id: string;
  label: string;
  family: string;
  sizeGB: number;
  minRamGB: number;
  tools: boolean;
  kind: "chat" | "embedding";
  note: string;
  fit: Fit;
  installed: boolean;
};

export type LocalState = {
  hardware: {
    platform: string;
    arch: string;
    cpu: string;
    cores: number;
    totalMemGB: number;
    freeMemGB: number;
    unifiedMemory: boolean;
    freeDiskGB: number | null;
  };
  ollama: {
    running: boolean;
    /** Installed on this computer (it may still be stopped). */
    installed: boolean;
    /** CapScreen can launch it ("Start Ollama"). */
    canStart: boolean;
    version: string | null;
    models: Array<{ name: string; sizeGB: number; family: string | null; parameterSize: string | null }>;
  };
  lmstudio: { running: boolean; models: string[] };
  recommended: string;
  catalog: CatalogModel[];
};

export type FixAction =
  | { action: "setup"; label: string }
  | { action: "start-ollama"; label: string }
  | { action: "get-ollama"; label: string }
  | { action: "download-model"; label: string; model: string }
  | { action: "add-key"; label: string; provider: string }
  | { action: "turn-off-local-only"; label: string }
  | { action: "edit-role"; label: string };

export type RoleHealth = {
  role: LlmRole;
  status: "ok" | "warning" | "error" | "off";
  binding: { provider: string; label: string; model: string; local: boolean; inherited: boolean } | null;
  title: string;
  detail?: string;
  fix?: FixAction;
};

export type AiHealth = {
  overall: "ready" | "attention" | "not-set-up";
  localOnly: boolean;
  roles: Record<LlmRole, RoleHealth>;
  checkedAt: string;
};

/** Error from the API, with the server's machine-readable reason when it sent one. */
export class AiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

export const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

export type PullEvent =
  | { type: "progress"; status: string; completed: number | null; total: number | null; percent: number | null }
  | { type: "done"; model: string }
  | { type: "error"; detail: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${apiBase()}/api/ai${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await resp.json().catch(() => ({}))) as T & { detail?: string; reason?: string };
  if (!resp.ok) throw new AiApiError(body.detail ?? `Request failed (${resp.status})`, resp.status, body.reason);
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const aiApi = {
  state: () => request<AiState>("/state"),
  local: () => request<LocalState>("/local"),
  health: (fresh = false) => request<AiHealth>(`/health${fresh ? "?fresh=1" : ""}`),
  startOllama: () => request<{ ok: true }>("/local/start", { method: "POST" }),

  saveProvider: (id: string, p: { label?: string; baseUrl?: string; kind?: string; local?: boolean }) =>
    request<{ ok: true }>(`/providers/${encodeURIComponent(id)}`, json("PUT", p)),
  removeProvider: (id: string) => request<{ ok: true }>(`/providers/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * Verify the key with the provider, then store it. Throws AiApiError with
   * reason "format" | "rejected" (never stored) or "unverified" (offline —
   * retry with skipVerify to store it anyway).
   */
  saveKey: (id: string, apiKey: string, opts: { skipVerify?: boolean } = {}) =>
    request<{ ok: true; verified: boolean; modelCount: number | null }>(
      `/providers/${encodeURIComponent(id)}/key`,
      json("PUT", { apiKey, skipVerify: opts.skipVerify }),
    ),
  removeKey: (id: string) =>
    request<{ ok: true; affectedRoles: LlmRole[] }>(`/providers/${encodeURIComponent(id)}/key`, { method: "DELETE" }),

  models: (id: string) =>
    request<{ models: string[]; chatModels: string[]; recommended: string | null }>(
      `/providers/${encodeURIComponent(id)}/models`,
    ),
  test: (id: string, model?: string) =>
    request<{ ok: boolean; latencyMs: number; reply?: string; modelCount?: number; error?: string }>(
      `/providers/${encodeURIComponent(id)}/test`,
      json("POST", { model }),
    ),
  probeTools: (provider: string, model: string) =>
    request<{ supportsTools: boolean; source: string; detail?: string }>("/probe-tools", json("POST", { provider, model })),

  saveRoles: (roles: Partial<Record<LlmRole, RoleBinding | null>>) =>
    request<{ ok: true; effective: AiState["effective"] }>("/roles", json("PUT", roles)),
  setLocalOnly: (localOnly: boolean) => request<{ ok: true }>("/policy", json("PUT", { localOnly })),
  quickSetupLocal: (model?: string) =>
    request<{ ok: true; chat: string; embed: string | null }>("/quick-setup/local", json("POST", { model })),
  quickSetupCloud: (provider: string, model?: string) =>
    request<{ ok: true; chat: string; embedding: string }>("/quick-setup/cloud", json("POST", { provider, model })),

  deleteLocalModel: (name: string) =>
    request<{ ok: true }>(`/local/models/${encodeURIComponent(name)}`, { method: "DELETE" }),

  /** Stream an Ollama download. Abort via the signal to cancel. */
  async pull(model: string, onEvent: (e: PullEvent) => void, signal?: AbortSignal): Promise<void> {
    const resp = await fetch(`${apiBase()}/api/ai/local/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal,
    });
    if (!resp.ok || !resp.body) {
      const body = (await resp.json().catch(() => ({}))) as { detail?: string };
      throw new Error(body.detail ?? `Download failed (${resp.status})`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/^data: /, "").trim();
        buf = buf.slice(idx + 2);
        if (line) onEvent(JSON.parse(line) as PullEvent);
      }
    }
  },
};

export const ROLE_INFO: Record<LlmRole, { title: string; short: string; description: string }> = {
  agent: {
    title: "Assistant & screening chat",
    short: "Chat",
    description: "Runs the compliance assistant and calls screening tools. Needs a tool-capable model.",
  },
  utility: {
    title: "Background tasks",
    short: "Background tasks",
    description: "Match narratives, CSV column mapping, entity extraction, IC memo drafts.",
  },
  embedding: {
    title: "Document search",
    short: "Document search",
    description: "Embeds uploaded documents so the assistant can cite them. Optional.",
  },
};

/** Cloud providers offered in guided setup, in the order shown. */
export const CLOUD_CHOICES: Array<{ id: string; label: string; blurb: string; keyUrl: string; keyHint: string }> = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    blurb: "Best at careful compliance analysis and tool use. Recommended.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "starts with sk-ant-",
  },
  {
    id: "openai",
    label: "OpenAI",
    blurb: "GPT models. Also covers document search.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "starts with sk-",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    blurb: "Generous free tier. Also covers document search.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "starts with AIza",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "One key for many model makers.",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "starts with sk-or-",
  },
  {
    id: "groq",
    label: "Groq",
    blurb: "Very fast open models.",
    keyUrl: "https://console.groq.com/keys",
    keyHint: "starts with gsk_",
  },
];

export const KEY_LINKS: Record<string, string> = Object.fromEntries(CLOUD_CHOICES.map((c) => [c.id, c.keyUrl]));
