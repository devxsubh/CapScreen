import express from "express";
import {
  buildProvider,
  describeLlmConfig,
  mergeWithPreset,
  isProviderLocal,
  PROVIDER_PRESETS,
  responseText,
  type LlmRole,
  type ProviderConfig,
} from "../lib/llm/providers";
import {
  deleteProviderKey,
  getProviderKey,
  providerKeyInfo,
  readAiConfig,
  setProviderKey,
  updateAiConfig,
  type StoredProvider,
} from "../lib/llm/controlCenter/store";
import {
  deleteOllamaModel,
  detectHardware,
  lmStudioStatus,
  MODEL_CATALOG,
  modelFit,
  ollamaCapabilities,
  ollamaStatus,
  pullOllamaModel,
  recommendedChatModel,
} from "../lib/llm/controlCenter/localRuntime";
import { friendlyLlmError } from "../lib/llm/friendlyError";

/**
 * AI Control Center — the user's own model providers, keys, and assignments.
 * Keys go in, never out: responses carry only "configured" + a 4-char hint.
 */
export const aiControlCenterRouter = express.Router();

const ROLES: LlmRole[] = ["agent", "utility", "embedding"];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** Providers that need no key (local servers). */
const KEYLESS = new Set(["ollama", "lmstudio", "llamacpp"]);

function storedProviders(): StoredProvider[] {
  return readAiConfig()?.providers ?? [];
}

/** Full provider config for `id`: stored overrides on top of the preset, plus the decrypted key. */
function resolveProvider(id: string): ProviderConfig | null {
  const stored = storedProviders().find((p) => p.id === id);
  const preset = PROVIDER_PRESETS[id];
  if (!stored && !preset) return null;
  const merged = mergeWithPreset({ id, ...(preset ?? {}), ...(stored ?? {}) } as ProviderConfig);
  const key = getProviderKey(id);
  return key ? { ...merged, apiKey: key } : merged;
}

function providerView(p: ProviderConfig, enabled: boolean) {
  const key = providerKeyInfo(p.id);
  const keyless = KEYLESS.has(p.id) || isProviderLocal(p);
  return {
    id: p.id,
    label: p.label ?? p.id,
    kind: p.kind,
    baseUrl: p.baseUrl ?? null,
    local: isProviderLocal(p),
    preset: p.id in PROVIDER_PRESETS,
    enabled,
    needsKey: !keyless,
    key: { configured: key.configured, hint: key.hint, updatedAt: key.updatedAt },
    // Dev only: an env var can stand in for an in-app key.
    envKey: !key.configured && !!p.apiKeyEnv && !!process.env[p.apiKeyEnv]?.trim(),
  };
}

aiControlCenterRouter.get("/state", (_req, res) => {
  const cfg = readAiConfig();
  const stored = storedProviders();
  const ids = [...new Set([...Object.keys(PROVIDER_PRESETS), ...stored.map((p) => p.id)])];
  res.json({
    configured: !!cfg,
    localOnly: cfg?.localOnly ?? false,
    roles: cfg?.roles ?? {},
    effective: describeLlmConfig(),
    providers: ids.map((id) => providerView(resolveProvider(id)!, stored.some((p) => p.id === id))),
  });
});

aiControlCenterRouter.put("/providers/:id", (req, res) => {
  const id = req.params.id;
  if (!ID_RE.test(id)) {
    res.status(400).json({ detail: "Provider id must be 2–40 lowercase letters, digits or dashes" });
    return;
  }
  const { label, baseUrl, kind, local } = req.body as Partial<StoredProvider>;
  const preset = PROVIDER_PRESETS[id];
  if (!preset && !baseUrl) {
    res.status(400).json({ detail: "Custom providers need a base URL" });
    return;
  }
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    res.status(400).json({ detail: "Base URL must start with http:// or https://" });
    return;
  }
  updateAiConfig((cfg) => {
    const next: StoredProvider = {
      id,
      kind: preset?.kind ?? (kind === "anthropic" ? "anthropic" : "openai-compatible"),
      ...(label ? { label: String(label).slice(0, 60) } : {}),
      ...(baseUrl ? { baseUrl: baseUrl.replace(/\/$/, "") } : {}),
      ...(typeof local === "boolean" ? { local } : {}),
    };
    cfg.providers = [...cfg.providers.filter((p) => p.id !== id), next];
  });
  res.json({ ok: true });
});

aiControlCenterRouter.delete("/providers/:id", (req, res) => {
  const id = req.params.id;
  deleteProviderKey(id);
  updateAiConfig((cfg) => {
    cfg.providers = cfg.providers.filter((p) => p.id !== id);
    for (const role of ROLES) if (cfg.roles[role]?.provider === id) delete cfg.roles[role];
  });
  res.json({ ok: true });
});

aiControlCenterRouter.put("/providers/:id/key", (req, res) => {
  const id = req.params.id;
  const apiKey = String((req.body as { apiKey?: unknown }).apiKey ?? "").trim();
  if (!resolveProvider(id)) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    res.status(400).json({ detail: "That does not look like an API key" });
    return;
  }
  setProviderKey(id, apiKey);
  updateAiConfig((cfg) => {
    if (!cfg.providers.some((p) => p.id === id)) {
      const preset = PROVIDER_PRESETS[id];
      cfg.providers.push({ id, kind: preset?.kind ?? "openai-compatible" });
    }
  });
  res.json({ ok: true, key: providerKeyInfo(id) });
});

aiControlCenterRouter.delete("/providers/:id/key", (req, res) => {
  deleteProviderKey(req.params.id);
  res.json({ ok: true });
});

aiControlCenterRouter.get("/providers/:id/models", async (req, res) => {
  const pc = resolveProvider(req.params.id);
  if (!pc) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  try {
    const provider = buildProvider(pc);
    const models = (await provider.listModels?.()) ?? [];
    res.json({ models: models.sort() });
  } catch (err) {
    res.status(502).json({ detail: friendlyLlmError(err) });
  }
});

/** One-shot connectivity + latency check, optionally against a specific model. */
aiControlCenterRouter.post("/providers/:id/test", async (req, res) => {
  const pc = resolveProvider(req.params.id);
  if (!pc) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  const model = (req.body as { model?: string }).model;
  const started = Date.now();
  try {
    const provider = buildProvider(pc);
    if (model) {
      const reply = await provider.complete({
        model,
        maxTokens: 16,
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
      });
      res.json({ ok: true, latencyMs: Date.now() - started, reply: responseText(reply).trim().slice(0, 80) });
    } else {
      const models = (await provider.listModels?.()) ?? [];
      res.json({ ok: true, latencyMs: Date.now() - started, modelCount: models.length });
    }
  } catch (err) {
    res.json({ ok: false, latencyMs: Date.now() - started, error: friendlyLlmError(err) });
  }
});

/** Does this model actually call tools? Forces a trivial tool call and checks. */
aiControlCenterRouter.post("/probe-tools", async (req, res) => {
  const { provider: id, model } = req.body as { provider?: string; model?: string };
  const pc = id ? resolveProvider(id) : null;
  if (!pc || !model) {
    res.status(400).json({ detail: "provider and model are required" });
    return;
  }
  if (pc.id === "ollama") {
    const caps = await ollamaCapabilities(model);
    if (caps) {
      res.json({ supportsTools: caps.includes("tools"), source: "ollama" });
      return;
    }
  }
  try {
    const reply = await buildProvider(pc).complete({
      model,
      maxTokens: 64,
      messages: [{ role: "user", content: "What time is it? Use the tool." }],
      tools: [{ name: "get_time", description: "Returns the current time", input_schema: { type: "object", properties: {} } }],
      toolChoice: { type: "auto" },
    });
    res.json({ supportsTools: reply.content.some((b) => b.type === "tool_use"), source: "probe" });
  } catch (err) {
    const msg = friendlyLlmError(err);
    if (/tool/i.test(msg)) res.json({ supportsTools: false, source: "probe", detail: msg });
    else res.status(502).json({ detail: msg });
  }
});

aiControlCenterRouter.put("/roles", async (req, res) => {
  const body = req.body as Partial<Record<LlmRole, { provider: string; model: string; supportsTools?: boolean } | null>>;
  for (const role of Object.keys(body)) {
    if (!ROLES.includes(role as LlmRole)) {
      res.status(400).json({ detail: `Unknown role "${role}"` });
      return;
    }
  }
  for (const role of ROLES) {
    const b = body[role];
    if (b && (!resolveProvider(b.provider) || !b.model?.trim())) {
      res.status(400).json({ detail: `Role "${role}" needs a known provider and a model` });
      return;
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
      cfg.roles[role] = { provider: b.provider, model: b.model.trim(), ...(b.supportsTools !== undefined ? { supportsTools: b.supportsTools } : {}) };
      if (!cfg.providers.some((p) => p.id === b.provider)) {
        const preset = PROVIDER_PRESETS[b.provider];
        cfg.providers.push({ id: b.provider, kind: preset?.kind ?? "openai-compatible" });
      }
    }
  });
  res.json({ ok: true, effective: describeLlmConfig() });
});

aiControlCenterRouter.put("/policy", (req, res) => {
  const { localOnly } = req.body as { localOnly?: boolean };
  updateAiConfig((cfg) => {
    if (typeof localOnly === "boolean") cfg.localOnly = localOnly;
  });
  res.json({ ok: true, effective: describeLlmConfig() });
});

// ── On-device runtimes ───────────────────────────────────────────────────────

aiControlCenterRouter.get("/local", async (_req, res) => {
  const hw = detectHardware();
  const [ollama, lmstudio] = await Promise.all([ollamaStatus(), lmStudioStatus()]);
  const installed = new Set(ollama.models.map((m) => m.name.replace(/:latest$/, "")));
  res.json({
    hardware: hw,
    ollama,
    lmstudio,
    recommended: recommendedChatModel(hw),
    catalog: MODEL_CATALOG.map((m) => ({ ...m, fit: modelFit(m, hw), installed: installed.has(m.id) })),
  });
});

/** SSE: streams `ollama pull` progress as { status, completed, total, percent }. */
aiControlCenterRouter.post("/local/pull", async (req, res) => {
  const model = String((req.body as { model?: unknown }).model ?? "").trim();
  if (!/^[\w.\-/]+(:[\w.\-]+)?$/.test(model)) {
    res.status(400).json({ detail: "Invalid model name" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);

  try {
    await pullOllamaModel(
      model,
      (p) => {
        const percent = p.total ? Math.round(((p.completed ?? 0) / p.total) * 1000) / 10 : null;
        send({ type: "progress", status: p.status, completed: p.completed ?? null, total: p.total ?? null, percent });
      },
      abort.signal,
    );
    send({ type: "done", model });
  } catch (err) {
    if (!abort.signal.aborted) send({ type: "error", detail: friendlyLlmError(err) });
  }
  res.end();
});

aiControlCenterRouter.delete("/local/models/:name", async (req, res) => {
  try {
    await deleteOllamaModel(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ detail: friendlyLlmError(err) });
  }
});

/**
 * One-click on-device setup: Ollama for chat (best installed tool-capable model)
 * and embeddings, Local-only mode on.
 */
aiControlCenterRouter.post("/quick-setup/local", async (_req, res) => {
  const ollama = await ollamaStatus();
  if (!ollama.running) {
    res.status(409).json({ detail: "Ollama is not running. Install it from ollama.com and open it, then try again." });
    return;
  }
  const names = ollama.models.map((m) => m.name);
  const withTools: Array<{ name: string; sizeGB: number }> = [];
  for (const m of ollama.models) {
    const caps = await ollamaCapabilities(m.name);
    if (caps?.includes("tools")) withTools.push(m);
  }
  const hw = detectHardware();
  // Largest tool-capable model that still fits in memory.
  const chat = withTools
    .filter((m) => m.sizeGB + 2.5 <= hw.totalMemGB)
    .sort((a, b) => b.sizeGB - a.sizeGB)[0]?.name;
  if (!chat) {
    res.status(409).json({
      detail: `No tool-capable chat model is installed. Download ${recommendedChatModel(hw)} from the Local models section first.`,
    });
    return;
  }
  const embed = names.find((n) => /embed/.test(n));

  updateAiConfig((cfg) => {
    if (!cfg.providers.some((p) => p.id === "ollama")) cfg.providers.push({ id: "ollama", kind: "ollama" });
    cfg.roles.agent = { provider: "ollama", model: chat, supportsTools: true };
    cfg.roles.utility = { provider: "ollama", model: chat, supportsTools: true };
    if (embed) cfg.roles.embedding = { provider: "ollama", model: embed };
    cfg.localOnly = true;
  });
  res.json({ ok: true, chat, embed: embed ?? null, effective: describeLlmConfig() });
});
