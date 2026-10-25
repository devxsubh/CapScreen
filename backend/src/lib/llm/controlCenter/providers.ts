import { isProviderLocal, mergeWithPreset, PROVIDER_PRESETS, type ProviderConfig } from "../providers/registry";
import { getProviderKey, readAiConfig, type StoredProvider } from "./store";

/** Providers that need no key (local servers). */
export const KEYLESS = new Set(["ollama", "lmstudio", "llamacpp"]);

export function storedProviders(): StoredProvider[] {
  return readAiConfig()?.providers ?? [];
}

/** Full provider config for `id`: stored overrides on top of the preset, plus the decrypted key. */
export function resolveProvider(id: string): ProviderConfig | null {
  const stored = storedProviders().find((p) => p.id === id);
  const preset = PROVIDER_PRESETS[id];
  if (!stored && !preset) return null;
  const merged = mergeWithPreset({ id, ...(preset ?? {}), ...(stored ?? {}) } as ProviderConfig);
  const key = getProviderKey(id);
  return key ? { ...merged, apiKey: key } : merged;
}

export function providerNeedsKey(p: ProviderConfig): boolean {
  return !KEYLESS.has(p.id) && !isProviderLocal(p);
}

/** A key is usable when one is saved in the app, or (dev only) set in the preset's env var. */
export function providerHasKey(p: ProviderConfig): boolean {
  return !!p.apiKey || (!!p.apiKeyEnv && !!process.env[p.apiKeyEnv]?.trim());
}

// ── API keys as pasted by people ─────────────────────────────────────────────

/**
 * Undo the usual copy-paste damage: surrounding quotes, `Bearer ` prefixes,
 * `OPENAI_API_KEY=sk-…` lines from a .env file, stray whitespace.
 */
export function normalizeApiKey(raw: string): string {
  const unquote = (s: string) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  let k = unquote(raw);
  k = unquote(k.replace(/^(export\s+)?[A-Z][A-Z0-9_]*\s*=\s*/, ""));
  k = unquote(k.replace(/^bearer\s+/i, ""));
  return k;
}

const KEY_PREFIXES: Array<[provider: string, prefix: RegExp]> = [
  ["anthropic", /^sk-ant-/],
  ["openrouter", /^sk-or-/],
  ["groq", /^gsk_/],
  ["gemini", /^AIza/],
  ["openai", /^sk-/],
];

/** The preset provider a key's prefix belongs to, when it's recognisable. */
export function detectKeyProvider(key: string): string | null {
  return KEY_PREFIXES.find(([, re]) => re.test(key))?.[0] ?? null;
}

/** Plain-language reason a key can't be right for `providerId`, or null if it looks fine. */
export function keyFormatProblem(providerId: string, key: string): string | null {
  if (!key) return "Paste your API key first.";
  if (/\s/.test(key)) return "API keys don't contain spaces. Copy the key again — only the key itself.";
  if (key.length < 16 || key.length > 512) return "That doesn't look like a complete API key. Copy it again from the provider.";
  const detected = detectKeyProvider(key);
  if (detected && detected !== providerId && providerId in PROVIDER_PRESETS) {
    const theirs = PROVIDER_PRESETS[detected]?.label ?? detected;
    const ours = PROVIDER_PRESETS[providerId]?.label ?? providerId;
    return `This key looks like it's for ${theirs}, not ${ours}. Paste it under ${theirs} instead.`;
  }
  return null;
}

// ── Cloud model choice ───────────────────────────────────────────────────────

/** Preferred chat models per provider, best first. The provider's own list decides what exists. */
const RECOMMENDED_CHAT: Record<string, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-sonnet-4-5", "claude-haiku-5-5", "claude-haiku-4-5"],
  openai: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o"],
  gemini: ["models/gemini-2.5-flash", "gemini-2.5-flash", "models/gemini-2.0-flash", "gemini-2.0-flash"],
  groq: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"],
  openrouter: ["anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini", "google/gemini-2.5-flash"],
};

/** Embedding models a cloud provider offers (providers missing here have none we support). */
export const CLOUD_EMBEDDING: Record<string, string> = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
};

const NON_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search|computer-use|davinci|babbage|guard|vision-preview|veo|imagen|aqa/i;

/** Chat-capable models from a provider's listing, recommended ones first. */
export function chatModels(providerId: string, listed: string[]): string[] {
  const chat = listed.filter((m) => !NON_CHAT.test(m));
  const preferred = (RECOMMENDED_CHAT[providerId] ?? []).filter((m) => chat.includes(m));
  return [...preferred, ...chat.filter((m) => !preferred.includes(m)).sort()];
}

export function recommendedCloudModel(providerId: string, listed: string[]): string | null {
  const preferred = RECOMMENDED_CHAT[providerId] ?? [];
  // An empty listing (some gateways) still gets a sensible default.
  if (!listed.length) return preferred[0] ?? null;
  return chatModels(providerId, listed)[0] ?? null;
}
