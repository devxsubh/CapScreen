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
  };
  ollama: {
    running: boolean;
    version: string | null;
    models: Array<{ name: string; sizeGB: number; family: string | null; parameterSize: string | null }>;
  };
  lmstudio: { running: boolean; models: string[] };
  recommended: string;
  catalog: CatalogModel[];
};

export type PullEvent =
  | { type: "progress"; status: string; completed: number | null; total: number | null; percent: number | null }
  | { type: "done"; model: string }
  | { type: "error"; detail: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${apiBase()}/api/ai${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await resp.json().catch(() => ({}))) as T & { detail?: string };
  if (!resp.ok) throw new Error(body.detail ?? `Request failed (${resp.status})`);
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const aiApi = {
  state: () => request<AiState>("/state"),
  local: () => request<LocalState>("/local"),

  saveProvider: (id: string, p: { label?: string; baseUrl?: string; kind?: string; local?: boolean }) =>
    request<{ ok: true }>(`/providers/${encodeURIComponent(id)}`, json("PUT", p)),
  removeProvider: (id: string) => request<{ ok: true }>(`/providers/${encodeURIComponent(id)}`, { method: "DELETE" }),

  saveKey: (id: string, apiKey: string) =>
    request<{ ok: true }>(`/providers/${encodeURIComponent(id)}/key`, json("PUT", { apiKey })),
  removeKey: (id: string) => request<{ ok: true }>(`/providers/${encodeURIComponent(id)}/key`, { method: "DELETE" }),

  models: (id: string) => request<{ models: string[] }>(`/providers/${encodeURIComponent(id)}/models`),
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
  quickSetupLocal: () =>
    request<{ ok: true; chat: string; embed: string | null }>("/quick-setup/local", { method: "POST" }),

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
