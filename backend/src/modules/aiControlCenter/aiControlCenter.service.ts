import { HttpError, badRequest, notFound } from "../../http/httpError";
import { checkAiHealth, invalidateHealthCache } from "../../lib/llm/controlCenter/health";
import {
  DISK_HEADROOM_GB,
  deleteOllamaModel,
  detectHardware,
  findOllamaInstall,
  lmStudioStatus,
  MODEL_CATALOG,
  modelFit,
  ollamaCapabilities,
  ollamaIsLocal,
  ollamaStatus,
  pullOllamaModel,
  recommendedChatModel,
  sameOllamaModel,
  startOllama,
} from "../../lib/llm/controlCenter/localRuntime";
import {
  chatModels,
  CLOUD_EMBEDDING,
  keyFormatProblem,
  normalizeApiKey,
  providerHasKey,
  providerNeedsKey,
  recommendedCloudModel,
  resolveProvider,
  storedProviders,
} from "../../lib/llm/controlCenter/providers";
import {
  deleteProviderKey,
  providerKeyInfo,
  readAiConfig,
  setProviderKey,
  updateAiConfig,
  type StoredProvider,
} from "../../lib/llm/controlCenter/store";
import { classifyLlmError, friendlyLlmError } from "../../lib/llm/friendlyError";
import {
  buildProvider,
  describeLlmConfig,
  isProviderLocal,
  PROVIDER_PRESETS,
  responseText,
  type LlmRole,
  type ProviderConfig,
} from "../../lib/llm/providers";

/**
 * AI Control Center — the user's own model providers, keys, and assignments.
 * Keys go in, never out: responses carry only "configured" + a 4-char hint.
 */

export const ROLES: LlmRole[] = ["agent", "utility", "embedding"];
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const OLLAMA_MODEL_NAME = /^[\w.\-/]+(:[\w.\-]+)?$/;
/** Memory a chat model needs beyond its download size. */
const MODEL_MEMORY_HEADROOM_GB = 2.5;

type RoleAssignment = { provider: string; model: string; supportsTools?: boolean };

function requireProvider(id: string | undefined): ProviderConfig {
  const pc = id ? resolveProvider(id) : null;
  if (!pc) throw notFound("Unknown provider");
  return pc;
}

/** Adds the provider to the saved list if it isn't there yet (presets keep their kind). */
function ensureStored(cfg: { providers: StoredProvider[] }, id: string): void {
  if (!cfg.providers.some((p) => p.id === id)) {
    cfg.providers.push({ id, kind: PROVIDER_PRESETS[id]?.kind ?? "openai-compatible" });
  }
}

// ── Providers and keys ───────────────────────────────────────────────────────

export function providerView(p: ProviderConfig, enabled: boolean) {
  const key = providerKeyInfo(p.id);
  return {
    id: p.id,
    label: p.label ?? p.id,
    kind: p.kind,
    baseUrl: p.baseUrl ?? null,
    local: isProviderLocal(p),
    preset: p.id in PROVIDER_PRESETS,
    enabled,
    needsKey: providerNeedsKey(p),
    key: { configured: key.configured, hint: key.hint, updatedAt: key.updatedAt },
    // Dev only: an env var can stand in for an in-app key.
    envKey: !key.configured && !!p.apiKeyEnv && !!process.env[p.apiKeyEnv]?.trim(),
  };
}

export function getState() {
  const cfg = readAiConfig();
  const stored = storedProviders();
  const ids = [...new Set([...Object.keys(PROVIDER_PRESETS), ...stored.map((p) => p.id)])];
  return {
    configured: !!cfg,
    localOnly: cfg?.localOnly ?? false,
    roles: cfg?.roles ?? {},
    effective: describeLlmConfig(),
    providers: ids.map((id) => providerView(resolveProvider(id)!, stored.some((p) => p.id === id))),
  };
}

/** Live check of every role: runtime up, model present, key accepted. */
export async function health(fresh: boolean) {
  return checkAiHealth({ fresh });
}

/** Adds or edits a provider. Presets keep their kind; custom ones need a base URL. */
export function saveProvider(id: string, input: Partial<StoredProvider>): void {
  if (!PROVIDER_ID.test(id)) {
    throw badRequest("Provider id must be 2–40 lowercase letters, digits or dashes");
  }
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : undefined;
  const preset = PROVIDER_PRESETS[id];
  if (!preset && !baseUrl) throw badRequest("Custom providers need a base URL");
  if (baseUrl && !isHttpUrl(baseUrl)) {
    throw badRequest("Enter a full URL starting with http:// or https://, e.g. http://127.0.0.1:8000/v1");
  }
  updateAiConfig((cfg) => {
    const next: StoredProvider = {
      id,
      kind: preset?.kind ?? (input.kind === "anthropic" ? "anthropic" : "openai-compatible"),
      ...(input.label ? { label: String(input.label).slice(0, 60) } : {}),
      ...(baseUrl ? { baseUrl: baseUrl.replace(/\/$/, "") } : {}),
      ...(typeof input.local === "boolean" ? { local: input.local } : {}),
    };
    cfg.providers = [...cfg.providers.filter((p) => p.id !== id), next];
  });
  invalidateHealthCache();
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Removes the provider, its key, and any role assigned to it. */
export function removeProvider(id: string): void {
  deleteProviderKey(id);
  updateAiConfig((cfg) => {
    cfg.providers = cfg.providers.filter((p) => p.id !== id);
    for (const role of ROLES) if (cfg.roles[role]?.provider === id) delete cfg.roles[role];
  });
  invalidateHealthCache();
}

/**
 * Saves an API key. The key is checked against the provider first and is only
 * stored if the provider accepts it; `skipVerify` saves without that check
 * (offline, or a gateway that has no model listing).
 */
export async function saveProviderKey(id: string, rawKey: string, skipVerify: boolean) {
  const apiKey = normalizeApiKey(rawKey);
  const pc = requireProvider(id);
  const problem = keyFormatProblem(id, apiKey);
  if (problem) throw badRequest(problem, { reason: "format" });

  let modelCount: number | null = null;
  if (!skipVerify) {
    try {
      modelCount = (await buildProvider({ ...pc, apiKey }).listModels?.())?.length ?? null;
    } catch (err) {
      const { kind, message } = classifyLlmError(err);
      // Rejected keys are never stored; network trouble can be saved anyway.
      const rejected = kind === "auth" || kind === "quota";
      throw new HttpError(rejected ? 422 : 503, message, { reason: rejected ? "rejected" : "unverified", kind });
    }
  }

  setProviderKey(id, apiKey);
  updateAiConfig((cfg) => ensureStored(cfg, id));
  invalidateHealthCache();
  return { key: providerKeyInfo(id), verified: !skipVerify, modelCount };
}

/** Removes the key; returns the roles that now have no working key. */
export function removeProviderKey(id: string): LlmRole[] {
  deleteProviderKey(id);
  invalidateHealthCache();
  const roles = readAiConfig()?.roles ?? {};
  // Utility counts when it inherits the agent's provider.
  return ROLES.filter((r) => (roles[r] ?? (r === "utility" ? roles.agent : undefined))?.provider === id);
}

export async function listProviderModels(id: string) {
  const pc = requireProvider(id);
  try {
    const models = ((await buildProvider(pc).listModels?.()) ?? []).sort();
    const cloud = !isProviderLocal(pc);
    return {
      models,
      chatModels: pc.kind === "ollama" ? models.filter((m) => !/embed/i.test(m)) : chatModels(pc.id, models, cloud),
      recommended: pc.kind === "ollama" ? null : recommendedCloudModel(pc.id, models, cloud),
    };
  } catch (err) {
    throw new HttpError(502, friendlyLlmError(err), { kind: classifyLlmError(err).kind });
  }
}

/** One-shot connectivity + latency check, optionally against a specific model. Never throws. */
export async function testProvider(id: string, model?: string) {
  const pc = requireProvider(id);
  const started = Date.now();
  try {
    const provider = buildProvider(pc);
    if (model) {
      const reply = await provider.complete({
        model,
        maxTokens: 16,
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
      });
      return { ok: true, latencyMs: Date.now() - started, reply: responseText(reply).trim().slice(0, 80) };
    }
    const models = (await provider.listModels?.()) ?? [];
    return { ok: true, latencyMs: Date.now() - started, modelCount: models.length };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, error: friendlyLlmError(err) };
  }
}

/** Does this model actually call tools? Ollama reports it; others get a forced trivial tool call. */
export async function probeTools(id: string | undefined, model: string | undefined) {
  const pc = id ? resolveProvider(id) : null;
  if (!pc || !model) throw badRequest("provider and model are required");
  if (pc.id === "ollama") {
    const caps = await ollamaCapabilities(model);
    if (caps) return { supportsTools: caps.includes("tools"), source: "ollama" };
  }
  try {
    const reply = await buildProvider(pc).complete({
      model,
      maxTokens: 64,
      messages: [{ role: "user", content: "What time is it? Use the tool." }],
      tools: [{ name: "get_time", description: "Returns the current time", input_schema: { type: "object", properties: {} } }],
      toolChoice: { type: "auto" },
    });
    return { supportsTools: reply.content.some((b) => b.type === "tool_use"), source: "probe" };
  } catch (err) {
    const msg = friendlyLlmError(err);
    if (/tool/i.test(msg)) return { supportsTools: false, source: "probe", detail: msg };
    throw new HttpError(502, msg);
  }
}

// ── Model assignments and policy ─────────────────────────────────────────────

/** Sets the roles present in `body`; null clears one. */
export async function assignRoles(body: Partial<Record<string, RoleAssignment | null>>) {
  for (const role of Object.keys(body)) {
    if (!ROLES.includes(role as LlmRole)) throw badRequest(`Unknown role "${role}"`);
  }
  for (const role of ROLES) {
    const b = body[role];
    if (!b) continue;
    const pc = resolveProvider(b.provider);
    if (!pc || !b.model?.trim()) throw badRequest(`Role "${role}" needs a known provider and a model`);
    if (role === "embedding" && !buildProvider(pc).embed) {
      throw badRequest(`${pc.label ?? b.provider} has no embedding models`);
    }
  }

  // Fill in tool support for Ollama models when the caller did not say.
  for (const role of ["agent", "utility"] as const) {
    const b = body[role];
    if (b && b.supportsTools === undefined && b.provider === "ollama") {
      const caps = await ollamaCapabilities(b.model);
      if (caps) b.supportsTools = caps.includes("tools");
    }
  }

  updateAiConfig((cfg) => {
    for (const role of ROLES) {
      if (!(role in body)) continue;
      const b = body[role];
      if (!b) {
        delete cfg.roles[role];
        continue;
      }
      cfg.roles[role] = {
        provider: b.provider,
        model: b.model.trim(),
        ...(b.supportsTools !== undefined ? { supportsTools: b.supportsTools } : {}),
      };
      ensureStored(cfg, b.provider);
    }
  });
  return describeLlmConfig();
}

/** Local-only mode: cloud models are refused at call time (see getLlm()). */
export function setLocalOnly(localOnly: unknown) {
  updateAiConfig((cfg) => {
    if (typeof localOnly === "boolean") cfg.localOnly = localOnly;
  });
  return describeLlmConfig();
}

// ── On-device runtimes ───────────────────────────────────────────────────────

export async function localRuntimes() {
  const hw = detectHardware();
  const [ollama, lmstudio] = await Promise.all([ollamaStatus(), lmStudioStatus()]);
  return {
    hardware: hw,
    ollama: { ...ollama, installed: ollama.running || !!findOllamaInstall(), canStart: ollamaIsLocal() && !!findOllamaInstall() },
    lmstudio,
    recommended: recommendedChatModel(hw),
    catalog: MODEL_CATALOG.map((m) => ({
      ...m,
      fit: modelFit(m, hw),
      installed: ollama.models.some((i) => sameOllamaModel(i.name, m.id)),
    })),
  };
}

/** Launches an installed Ollama and waits until it answers. */
export async function startLocalRuntime(): Promise<void> {
  const r = await startOllama();
  invalidateHealthCache();
  if (!r.started) throw new HttpError(409, r.detail ?? "Couldn't start Ollama");
}

/** Throws unless the model name is valid, Ollama is up and the disk can hold it. */
export async function checkCanPull(model: string): Promise<void> {
  if (!OLLAMA_MODEL_NAME.test(model)) throw badRequest("Invalid model name");
  if (!(await ollamaStatus()).running) {
    throw new HttpError(409, "Ollama isn't running. Start it, then download again.");
  }
  const known = MODEL_CATALOG.find((m) => sameOllamaModel(m.id, model));
  const disk = detectHardware().freeDiskGB;
  if (known && disk !== null && disk < known.sizeGB + DISK_HEADROOM_GB) {
    throw new HttpError(
      507,
      `Not enough disk space: ${model} needs about ${known.sizeGB + DISK_HEADROOM_GB} GB free and this computer has ${disk} GB.`,
    );
  }
}

export type PullEvent =
  | { type: "progress"; status: string; completed: number | null; total: number | null; percent: number | null }
  | { type: "done"; model: string }
  | { type: "error"; detail: string };

/** Runs `ollama pull`, reporting progress. Ends with "done" or "error" (unless aborted). */
export async function pullModel(model: string, send: (event: PullEvent) => void, signal: AbortSignal): Promise<void> {
  try {
    await pullOllamaModel(
      model,
      (p) => {
        const percent = p.total ? Math.round(((p.completed ?? 0) / p.total) * 1000) / 10 : null;
        send({ type: "progress", status: p.status, completed: p.completed ?? null, total: p.total ?? null, percent });
      },
      signal,
    );
    send({ type: "done", model });
  } catch (err) {
    if (!signal.aborted) send({ type: "error", detail: friendlyLlmError(err) });
  }
  invalidateHealthCache();
}

export async function deleteLocalModel(name: string): Promise<void> {
  try {
    await deleteOllamaModel(name);
    invalidateHealthCache();
  } catch (err) {
    throw new HttpError(502, friendlyLlmError(err));
  }
}

// ── One-click setups ─────────────────────────────────────────────────────────

/**
 * On-device setup: Ollama for chat (the given model, or the largest installed
 * tool-capable one that fits in memory) and embeddings, Local-only mode on.
 */
export async function quickSetupLocal(requested: string) {
  const ollama = await ollamaStatus();
  if (!ollama.running) throw new HttpError(409, "Ollama isn't running. Start it, then try again.");
  const names = ollama.models.map((m) => m.name);
  const hw = detectHardware();

  let chat: string | undefined;
  if (requested) {
    chat = names.find((n) => sameOllamaModel(n, requested));
    if (!chat) throw new HttpError(409, `${requested} isn't downloaded yet.`);
    const caps = await ollamaCapabilities(chat);
    if (caps && !caps.includes("tools")) {
      throw new HttpError(
        409,
        `${requested} can't use tools, so the assistant couldn't run screenings. Pick a model marked "tools".`,
      );
    }
  } else {
    const withTools: Array<{ name: string; sizeGB: number }> = [];
    for (const m of ollama.models) {
      const caps = await ollamaCapabilities(m.name);
      if (caps?.includes("tools")) withTools.push(m);
    }
    chat = withTools
      .filter((m) => m.sizeGB + MODEL_MEMORY_HEADROOM_GB <= hw.totalMemGB)
      .sort((a, b) => b.sizeGB - a.sizeGB)[0]?.name;
    if (!chat) {
      throw new HttpError(
        409,
        `No tool-capable chat model is downloaded yet. Download ${recommendedChatModel(hw)} first.`,
      );
    }
  }
  const chatModel = chat;
  const embed = names.find((n) => /embed/.test(n));

  updateAiConfig((cfg) => {
    ensureStored(cfg, "ollama");
    cfg.roles.agent = { provider: "ollama", model: chatModel, supportsTools: true };
    cfg.roles.utility = { provider: "ollama", model: chatModel, supportsTools: true };
    if (embed) cfg.roles.embedding = { provider: "ollama", model: embed };
    else delete cfg.roles.embedding;
    cfg.localOnly = true;
  });
  invalidateHealthCache();
  return { chat: chatModel, embed: embed ?? null, effective: describeLlmConfig() };
}

/**
 * Cloud setup: the provider's model for chat and background tasks,
 * Local-only mode off. Document search uses the provider's embeddings when it
 * has them, otherwise keyword search — people choosing cloud often can't run
 * local models, so nothing here depends on Ollama.
 */
export async function quickSetupCloud(id: string | undefined, requested: string | undefined) {
  const pc = requireProvider(id);
  const providerId = pc.id;
  const label = pc.label ?? providerId;
  if (providerNeedsKey(pc) && !providerHasKey(pc)) {
    throw new HttpError(409, `Save your ${label} API key first.`);
  }

  let listed: string[] = [];
  try {
    listed = (await buildProvider(pc).listModels?.()) ?? [];
  } catch (err) {
    const { kind, message } = classifyLlmError(err);
    if (kind === "auth" || kind === "quota") throw new HttpError(422, message);
    // Offline: still save the choice; the status card shows the connection problem.
  }
  const model = requested?.trim() || recommendedCloudModel(providerId, listed);
  if (!model) {
    throw new HttpError(409, `${label} didn't list any chat models. Type a model name under Advanced settings.`);
  }
  if (listed.length && !listed.includes(model)) {
    throw new HttpError(409, `${label} doesn't offer "${model}" to your account. Pick one from the list.`);
  }

  const embedding = CLOUD_EMBEDDING[providerId] ? { provider: providerId, model: CLOUD_EMBEDDING[providerId] } : null;

  updateAiConfig((cfg) => {
    ensureStored(cfg, providerId);
    cfg.roles.agent = { provider: providerId, model, supportsTools: true };
    cfg.roles.utility = { provider: providerId, model, supportsTools: true };
    if (embedding) cfg.roles.embedding = embedding;
    else delete cfg.roles.embedding;
    cfg.localOnly = false;
  });
  invalidateHealthCache();
  return {
    chat: model,
    embedding: embedding ? `${label} (${embedding.model})` : "keyword search",
    effective: describeLlmConfig(),
  };
}
