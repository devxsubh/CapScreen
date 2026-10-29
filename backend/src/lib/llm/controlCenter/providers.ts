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

/** Preferred tiers per provider, best first. Patterns, so a new release is picked up without a code change. */
const PREFERRED_CHAT: Record<string, RegExp[]> = {
  anthropic: [/^claude-sonnet-/, /^claude-haiku-/, /^claude-opus-/],
  openai: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/],
  gemini: [/^(models\/)?gemini-[\d.]+-flash$/, /^(models\/)?gemini-[\d.]+-flash-lite$/],
  groq: [/gpt-oss-120b$/, /^llama-[\d.]+-70b-versatile$/, /llama-/],
  openrouter: [/^anthropic\/claude-sonnet-/, /^openai\/gpt-[\d.]+-mini$/, /^google\/gemini-[\d.]+-flash$/],
};

/** Default when a provider's listing is empty (some gateways don't list models). */
const FALLBACK_CHAT: Record<string, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5-mini",
  gemini: "gemini-3.8-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-sonnet-4.5",
};

/** Embedding models a cloud provider offers (providers missing here have none we support). */
export const CLOUD_EMBEDDING: Record<string, string> = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
};

const NON_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search|computer-use|davinci|babbage|guard|vision-preview|veo|imagen|aqa|robotics|sora/i;

/** Product lines a provider still lists but has replaced with its main chat models. */
const SUPERSEDED: Record<string, RegExp> = {
  openai: /^(o\d|chatgpt-|codex-|gpt-oss)/,
  gemini: /^(models\/)?(gemma|learnlm)/,
};

/**
 * Model families to offer when a provider lists many paid ones. Google's free tier covers the Flash and Flash-Lite
 * chat models; Pro, Argon, Omni and the image models are paid-only (ai.google.dev/gemini-api/docs/pricing).
 */
const ONLY_FAMILIES: Record<string, string[]> = {
  gemini: ["gemini-flash", "gemini-flash-lite"],
};

/** Dated snapshots and preview/experimental builds; stripped to find the model they are a build of. */
const SNAPSHOT_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{3,4}|preview|exp|experimental|latest|beta)$/;
const VERSION_TOKEN = /^\d+(\.\d+)*$/;

type ParsedModel = {
  id: string;
  /** The id without snapshot/preview suffixes: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
  base: string;
  /** First name token, e.g. `claude`, `gpt`, `gemini`, `llama`. */
  line: string;
  /** The name without its version: `claude-haiku`, `gpt-mini`, `gemini-flash-lite`. */
  family: string;
  version: number[] | null;
  stable: boolean;
};

function parseModel(id: string): ParsedModel {
  const plain = id.replace(/^models\//, "").toLowerCase();
  let base = plain;
  for (let prev = ""; prev !== base; ) {
    prev = base;
    base = base.replace(SNAPSHOT_SUFFIX, "");
  }
  // Ignore the vendor prefix of gateway ids (`anthropic/claude-…`, `meta-llama/llama-…`).
  const tokens = base.split("/").pop()!.split("-");
  const start = tokens.findIndex((t, i) => i > 0 && VERSION_TOKEN.test(t));
  if (start < 0) return { id, base, line: tokens[0], family: tokens.join("-"), version: null, stable: plain === base };
  let end = start;
  while (end < tokens.length && VERSION_TOKEN.test(tokens[end])) end++;
  return {
    id,
    base,
    line: tokens[0],
    family: [...tokens.slice(0, start), ...tokens.slice(end)].join("-"),
    // `claude-opus-4-5` and `gpt-4.1` both read as [4, 5] / [4, 1].
    version: tokens.slice(start, end).join(".").split(".").map(Number),
    stable: plain === base,
  };
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The newest model of each tier from a line's newest generation: Claude 5 Opus, Sonnet and Haiku rather than
 * every 4.x release and dated snapshot. Plain aliases win over snapshots and previews of the same model.
 * Unversioned names are kept only in lines with no versioned models.
 */
export function latestModels(listed: string[]): string[] {
  const byBase = new Map<string, ParsedModel>();
  for (const p of listed.map(parseModel)) {
    const cur = byBase.get(p.base);
    // Same model: the alias, else the newest snapshot (dates sort as text).
    if (!cur || (p.stable && !cur.stable) || (p.stable === cur.stable && p.id > cur.id)) byBase.set(p.base, p);
  }
  const newestMajor = new Map<string, number>();
  for (const p of byBase.values()) {
    if (p.version) newestMajor.set(p.line, Math.max(newestMajor.get(p.line) ?? 0, p.version[0]));
  }
  const keep = new Map<string, ParsedModel>();
  for (const p of byBase.values()) {
    const major = newestMajor.get(p.line);
    if (!p.version) {
      if (major === undefined) keep.set(`base:${p.base}`, p);
      continue;
    }
    if (p.version[0] !== major) continue;
    const key = `family:${p.line}:${p.family}`;
    const cur = keep.get(key);
    const newer = cur ? compareVersions(p.version, cur.version!) : 1;
    if (newer > 0 || (newer === 0 && p.stable && !cur!.stable)) keep.set(key, p);
  }
  const kept = new Set([...keep.values()].map((p) => p.id));
  return listed.filter((m) => kept.has(m));
}

/**
 * Chat-capable models from a provider's listing, recommended ones first. Cloud listings are trimmed to the
 * latest models (`latestOnly`); a local server lists exactly what the user downloaded, so it is left whole.
 */
export function chatModels(providerId: string, listed: string[], latestOnly = true): string[] {
  const hidden = latestOnly ? SUPERSEDED[providerId] : undefined;
  const families = latestOnly ? ONLY_FAMILIES[providerId] : undefined;
  let chat = listed.filter(
    (m) => !NON_CHAT.test(m) && !hidden?.test(m) && (!families || families.includes(parseModel(m).family)),
  );
  if (latestOnly) chat = latestModels(chat);
  const preferred = [...new Set((PREFERRED_CHAT[providerId] ?? []).flatMap((re) => chat.filter((m) => re.test(m)).sort()))];
  return [...preferred, ...chat.filter((m) => !preferred.includes(m)).sort()];
}

export function recommendedCloudModel(providerId: string, listed: string[], latestOnly = true): string | null {
  // An empty listing (some gateways) still gets a sensible default.
  if (!listed.length) return FALLBACK_CHAT[providerId] ?? null;
  return chatModels(providerId, listed, latestOnly)[0] ?? null;
}
