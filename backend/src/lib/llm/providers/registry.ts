import { AnthropicProvider } from "./anthropic";
import { getProviderKey, readAiConfig } from "../controlCenter/store";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { OllamaProvider } from "./ollama";
import type { LlmProvider, ProviderKind } from "./types";

/**
 * Model provider configuration.
 *
 * Two sources, in priority order:
 *   1. AI Control Center — <data>/ai/config.json + encrypted keys (set in the app)
 *   2. Env vars — LLM_PROVIDER / LLM_MODEL / LLM_UTILITY_MODEL / LLM_BASE_URL / LLM_API_KEY
 *      (developer fallback for `pnpm dev`)
 */

export type LlmRole = "agent" | "utility" | "embedding";

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label?: string;
  baseUrl?: string;
  /** Literal key — desktop injects from the OS keychain; avoid in files. */
  apiKey?: string;
  /** Name of an env var holding the key. */
  apiKeyEnv?: string;
  /** Override locality detection. Defaults to true for loopback base URLs. */
  local?: boolean;
};

export type RoleBinding = {
  provider: string;
  model: string;
  /** Set false for local models without function calling; the agent then runs tool-less. */
  supportsTools?: boolean;
};

export type LlmConfig = {
  providers: ProviderConfig[];
  roles: Partial<Record<LlmRole, RoleBinding>>;
  /** Refuse any provider that is not on this machine. */
  localOnly?: boolean;
  source: "control-center" | "env";
};

export type ResolvedLlm = {
  provider: LlmProvider;
  providerId: string;
  model: string;
  supportsTools: boolean;
  local: boolean;
};

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

/** Known endpoints. Any other OpenAI-compatible server works via `custom` + LLM_BASE_URL. */
export const PROVIDER_PRESETS: Record<string, Omit<ProviderConfig, "id">> = {
  anthropic: { kind: "anthropic", label: "Anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
  openai: { kind: "openai-compatible", label: "OpenAI", apiKeyEnv: "OPENAI_API_KEY" },
  ollama: { kind: "ollama", label: "Ollama (local)", baseUrl: "http://127.0.0.1:11434" },
  lmstudio: { kind: "openai-compatible", label: "LM Studio (local)", baseUrl: "http://127.0.0.1:1234/v1" },
  llamacpp: { kind: "openai-compatible", label: "llama.cpp server (local)", baseUrl: "http://127.0.0.1:8080/v1" },
  openrouter: {
    kind: "openai-compatible",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  groq: {
    kind: "openai-compatible",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  },
  gemini: {
    kind: "openai-compatible",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
  },
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function configFromEnv(): LlmConfig {
  // Desktop app: models are configured only in the AI Control Center.
  if (process.env.CAPSCREEN_DESKTOP_TOKEN || (!env("LLM_PROVIDER") && !env("ANTHROPIC_API_KEY") && !env("LLM_API_KEY"))) {
    return { providers: [], roles: {}, source: "env" };
  }
  const presetId = env("LLM_PROVIDER") ?? "anthropic";
  const preset = PROVIDER_PRESETS[presetId] ?? { kind: "openai-compatible" as const };
  const provider: ProviderConfig = {
    id: presetId,
    ...preset,
    ...(env("LLM_BASE_URL") ? { baseUrl: env("LLM_BASE_URL") } : {}),
    ...(env("LLM_API_KEY") ? { apiKey: env("LLM_API_KEY") } : {}),
  };

  const model =
    env("LLM_MODEL") ?? (provider.kind === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "");
  if (!model) {
    throw new Error(`LLM_MODEL must be set when LLM_PROVIDER=${presetId}`);
  }
  if (env("ANTHROPIC_MODEL")) {
    console.warn("[llm] ANTHROPIC_MODEL is ignored — use LLM_MODEL instead");
  }
  const supportsTools = env("LLM_SUPPORTS_TOOLS")?.toLowerCase() !== "false";

  const providers = [provider];
  const roles: LlmConfig["roles"] = {
    agent: { provider: provider.id, model, supportsTools },
    utility: { provider: provider.id, model: env("LLM_UTILITY_MODEL") ?? model, supportsTools },
  };

  // Embeddings keep their historical default (OpenAI) unless configured.
  const embedProvider = env("EMBEDDING_PROVIDER");
  if (embedProvider) {
    if (embedProvider !== provider.id) {
      providers.push({ id: embedProvider, ...(PROVIDER_PRESETS[embedProvider] ?? { kind: "openai-compatible" }) });
    }
    roles.embedding = { provider: embedProvider, model: env("EMBEDDING_MODEL") ?? "text-embedding-3-small" };
  } else if (env("OPENAI_API_KEY")) {
    if (provider.id !== "openai") providers.push({ id: "openai", ...PROVIDER_PRESETS.openai });
    roles.embedding = { provider: "openai", model: env("EMBEDDING_MODEL") ?? "text-embedding-3-small" };
  }

  return { providers, roles, source: "env" };
}

/** Stored overrides on top of a preset. A preset's adapter kind always wins. */
export function mergeWithPreset(p: ProviderConfig | (Omit<ProviderConfig, "kind"> & { kind?: ProviderKind })): ProviderConfig {
  const preset = PROVIDER_PRESETS[p.id];
  return { ...(preset ?? {}), ...p, ...(preset ? { kind: preset.kind } : {}) } as ProviderConfig;
}

function configFromControlCenter(): LlmConfig | null {
  const cfg = readAiConfig();
  if (!cfg) return null;
  return {
    providers: cfg.providers.map((p) => {
      const merged = mergeWithPreset(p);
      // Keys entered in the app win; a preset's env var still works in dev.
      const key = getProviderKey(p.id);
      return key ? { ...merged, apiKey: key } : merged;
    }),
    roles: cfg.roles,
    localOnly: cfg.localOnly,
    source: "control-center",
  };
}

export function getLlmConfig(): LlmConfig {
  return configFromControlCenter() ?? configFromEnv();
}

const providerCache = new Map<string, LlmProvider>();

function providerKey(p: ProviderConfig): string {
  return JSON.stringify([p.id, p.kind, p.baseUrl, p.apiKey, p.apiKeyEnv, p.local]);
}

function isProviderLocal(p: ProviderConfig): boolean {
  return p.local ?? isLoopbackUrl(p.baseUrl);
}

export function buildProvider(p: ProviderConfig): LlmProvider {
  const key = providerKey(p);
  const cached = providerCache.get(key);
  if (cached) return cached;

  const apiKey = p.apiKey ?? (p.apiKeyEnv ? env(p.apiKeyEnv) : undefined) ?? "";
  const provider =
    p.kind === "anthropic"
      ? new AnthropicProvider(p.id, apiKey, p.baseUrl)
      : p.kind === "ollama"
        ? new OllamaProvider(p.id, p.baseUrl, isProviderLocal(p))
        : new OpenAICompatibleProvider(p.id, p.baseUrl, apiKey, isProviderLocal(p));
  providerCache.set(key, provider);
  return provider;
}

export function getLlm(role: LlmRole): ResolvedLlm {
  const config = getLlmConfig();
  // utility falls back to agent so single-model setups need one binding.
  const binding = config.roles[role] ?? (role === "utility" ? config.roles.agent : undefined);
  if (!binding) throw new Error(`No model configured for role "${role}"`);

  const pc = config.providers.find((p) => p.id === binding.provider);
  if (!pc) throw new Error(`Role "${role}" references unknown provider "${binding.provider}"`);

  const provider = buildProvider(pc);
  if (config.localOnly && !provider.local) {
    throw new Error(
      `Local-only mode is on, so "${pc.label ?? pc.id}" (a cloud provider) is blocked. ` +
        "Pick an on-device model or turn off Local-only mode in the AI Control Center.",
    );
  }
  return {
    provider,
    providerId: pc.id,
    model: binding.model,
    supportsTools: binding.supportsTools ?? true,
    local: provider.local,
  };
}

export function hasLlmRole(role: LlmRole): boolean {
  try {
    getLlm(role);
    return true;
  } catch {
    return false;
  }
}

/** Safe-to-expose summary (no keys) for /api/config and the settings UI. */
export type LlmRoleSummary = {
  provider: string;
  label: string;
  model: string;
  local: boolean;
  supportsTools: boolean;
  error?: string;
};

export function describeLlmConfig(): {
  roles: Partial<Record<LlmRole, LlmRoleSummary>>;
  localOnly: boolean;
  source: LlmConfig["source"];
  error?: string;
} {
  let config: LlmConfig;
  try {
    config = getLlmConfig();
  } catch (err) {
    return { roles: {}, localOnly: false, source: "env", error: err instanceof Error ? err.message : String(err) };
  }
  const roles: Partial<Record<LlmRole, LlmRoleSummary>> = {};
  for (const role of ["agent", "utility", "embedding"] as const) {
    const binding = config.roles[role] ?? (role === "utility" ? config.roles.agent : undefined);
    if (!binding) continue;
    const pc = config.providers.find((p) => p.id === binding.provider);
    const base: LlmRoleSummary = {
      provider: binding.provider,
      label: pc?.label ?? binding.provider,
      model: binding.model,
      local: pc ? isProviderLocal(pc) : false,
      supportsTools: binding.supportsTools ?? true,
    };
    try {
      getLlm(role);
      roles[role] = base;
    } catch (err) {
      roles[role] = { ...base, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { roles, localOnly: !!config.localOnly, source: config.source };
}

export { isProviderLocal };
