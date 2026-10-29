import express from "express";
import {
  buildProvider,
  describeLlmConfig,
  isProviderLocal,
  PROVIDER_PRESETS,
  responseText,
  type LlmRole,
  type ProviderConfig,
} from "../lib/llm/providers";
import {
  deleteProviderKey,
  providerKeyInfo,
  readAiConfig,
  setProviderKey,
  updateAiConfig,
  type StoredProvider,
} from "../lib/llm/controlCenter/store";
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
} from "../lib/llm/controlCenter/localRuntime";
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
} from "../lib/llm/controlCenter/providers";
import { checkAiHealth, invalidateHealthCache } from "../lib/llm/controlCenter/health";
import { classifyLlmError, friendlyLlmError } from "../lib/llm/friendlyError";

/**
 * AI Control Center — the user's own model providers, keys, and assignments.
 * Keys go in, never out: responses carry only "configured" + a 4-char hint.
 */
export const aiControlCenterRouter = express.Router();

const ROLES: LlmRole[] = ["agent", "utility", "embedding"];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function providerView(p: ProviderConfig, enabled: boolean) {
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

/** Roles currently bound to a provider (utility counts when it inherits the agent's). */
function rolesUsing(providerId: string): LlmRole[] {
  const roles = readAiConfig()?.roles ?? {};
  return ROLES.filter((r) => (roles[r] ?? (r === "utility" ? roles.agent : undefined))?.provider === providerId);
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

/** Live check of every role: runtime up, model present, key accepted. `?fresh=1` skips the 20 s cache. */
aiControlCenterRouter.get("/health", async (req, res) => {
  res.json(await checkAiHealth({ fresh: req.query.fresh === "1" }));
});

aiControlCenterRouter.put("/providers/:id", (req, res) => {
  const id = req.params.id;
  if (!ID_RE.test(id)) {
    res.status(400).json({ detail: "Provider id must be 2–40 lowercase letters, digits or dashes" });
    return;
  }
  const { label, baseUrl: rawUrl, kind, local } = req.body as Partial<StoredProvider>;
  const baseUrl = typeof rawUrl === "string" ? rawUrl.trim() : undefined;
  const preset = PROVIDER_PRESETS[id];
  if (!preset && !baseUrl) {
    res.status(400).json({ detail: "Custom providers need a base URL" });
    return;
  }
  if (baseUrl) {
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      res.status(400).json({ detail: "Enter a full URL starting with http:// or https://, e.g. http://127.0.0.1:8000/v1" });
      return;
    }
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
  invalidateHealthCache();
  res.json({ ok: true });
});

aiControlCenterRouter.delete("/providers/:id", (req, res) => {
  const id = req.params.id;
  deleteProviderKey(id);
  updateAiConfig((cfg) => {
    cfg.providers = cfg.providers.filter((p) => p.id !== id);
    for (const role of ROLES) if (cfg.roles[role]?.provider === id) delete cfg.roles[role];
  });
  invalidateHealthCache();
  res.json({ ok: true });
});

/**
 * Save an API key. The key is checked against the provider first and is only
 * stored if the provider accepts it; `skipVerify` saves without that check
 * (offline, or a gateway that has no model listing).
 */
aiControlCenterRouter.put("/providers/:id/key", async (req, res) => {
  const id = req.params.id;
  const body = req.body as { apiKey?: unknown; skipVerify?: unknown };
  const apiKey = normalizeApiKey(String(body.apiKey ?? ""));
  const pc = resolveProvider(id);
  if (!pc) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  const problem = keyFormatProblem(id, apiKey);
  if (problem) {
    res.status(400).json({ detail: problem, reason: "format" });
    return;
  }

  let modelCount: number | null = null;
  if (body.skipVerify !== true) {
    try {
      const provider = buildProvider({ ...pc, apiKey });
      modelCount = (await provider.listModels?.())?.length ?? null;
    } catch (err) {
      const { kind, message } = classifyLlmError(err);
      // Rejected keys are never stored; network trouble can be saved anyway.
      const reason = kind === "auth" || kind === "quota" ? "rejected" : "unverified";
      res.status(reason === "rejected" ? 422 : 503).json({ detail: message, reason, kind });
      return;
    }
  }

  setProviderKey(id, apiKey);
  updateAiConfig((cfg) => {
    if (!cfg.providers.some((p) => p.id === id)) {
      const preset = PROVIDER_PRESETS[id];
      cfg.providers.push({ id, kind: preset?.kind ?? "openai-compatible" });
    }
  });
  invalidateHealthCache();
  res.json({ ok: true, key: providerKeyInfo(id), verified: body.skipVerify !== true, modelCount });
});

aiControlCenterRouter.delete("/providers/:id/key", (req, res) => {
  deleteProviderKey(req.params.id);
  invalidateHealthCache();
  res.json({ ok: true, affectedRoles: rolesUsing(req.params.id) });
});

aiControlCenterRouter.get("/providers/:id/models", async (req, res) => {
  const pc = resolveProvider(req.params.id);
  if (!pc) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  try {
    const provider = buildProvider(pc);
    const models = ((await provider.listModels?.()) ?? []).sort();
    res.json({
      models,
      chatModels: pc.kind === "ollama" ? models.filter((m) => !/embed/i.test(m)) : chatModels(pc.id, models, !isProviderLocal(pc)),
      recommended: pc.kind === "ollama" ? null : recommendedCloudModel(pc.id, models, !isProviderLocal(pc)),
    });
  } catch (err) {
    res.status(502).json({ detail: friendlyLlmError(err), kind: classifyLlmError(err).kind });
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
    if (b && role === "embedding" && !buildProvider(resolveProvider(b.provider)!).embed) {
      res.status(400).json({ detail: `${resolveProvider(b.provider)!.label ?? b.provider} has no embedding models` });
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
  res.json({
    hardware: hw,
    ollama: { ...ollama, installed: ollama.running || !!findOllamaInstall(), canStart: ollamaIsLocal() && !!findOllamaInstall() },
    lmstudio,
    recommended: recommendedChatModel(hw),
    catalog: MODEL_CATALOG.map((m) => ({
      ...m,
      fit: modelFit(m, hw),
      installed: ollama.models.some((i) => sameOllamaModel(i.name, m.id)),
    })),
  });
});

/** Launch an installed Ollama and wait until it answers. */
aiControlCenterRouter.post("/local/start", async (_req, res) => {
  const r = await startOllama();
  invalidateHealthCache();
  if (r.started) res.json({ ok: true });
  else res.status(409).json({ detail: r.detail });
});

/** SSE: streams `ollama pull` progress as { status, completed, total, percent }. */
aiControlCenterRouter.post("/local/pull", async (req, res) => {
  const model = String((req.body as { model?: unknown }).model ?? "").trim();
  if (!/^[\w.\-/]+(:[\w.\-]+)?$/.test(model)) {
    res.status(400).json({ detail: "Invalid model name" });
    return;
  }
  if (!(await ollamaStatus()).running) {
    res.status(409).json({ detail: "Ollama isn't running. Start it, then download again." });
    return;
  }
  const known = MODEL_CATALOG.find((m) => sameOllamaModel(m.id, model));
  const disk = detectHardware().freeDiskGB;
  if (known && disk !== null && disk < known.sizeGB + DISK_HEADROOM_GB) {
    res.status(507).json({
      detail: `Not enough disk space: ${model} needs about ${known.sizeGB + DISK_HEADROOM_GB} GB free and this computer has ${disk} GB.`,
    });
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
  invalidateHealthCache();
  res.end();
});

aiControlCenterRouter.delete("/local/models/:name", async (req, res) => {
  try {
    await deleteOllamaModel(req.params.name);
    invalidateHealthCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ detail: friendlyLlmError(err) });
  }
});

/**
 * One-click on-device setup: Ollama for chat (the given model, or the best
 * installed tool-capable one) and embeddings, Local-only mode on.
 */
aiControlCenterRouter.post("/quick-setup/local", async (req, res) => {
  const requested = String((req.body as { model?: unknown } | undefined)?.model ?? "").trim();
  const ollama = await ollamaStatus();
  if (!ollama.running) {
    res.status(409).json({ detail: "Ollama isn't running. Start it, then try again." });
    return;
  }
  const names = ollama.models.map((m) => m.name);
  const hw = detectHardware();

  let chat: string | undefined;
  if (requested) {
    chat = names.find((n) => sameOllamaModel(n, requested));
    if (!chat) {
      res.status(409).json({ detail: `${requested} isn't downloaded yet.` });
      return;
    }
    const caps = await ollamaCapabilities(chat);
    if (caps && !caps.includes("tools")) {
      res.status(409).json({ detail: `${requested} can't use tools, so the assistant couldn't run screenings. Pick a model marked "tools".` });
      return;
    }
  } else {
    const withTools: Array<{ name: string; sizeGB: number }> = [];
    for (const m of ollama.models) {
      const caps = await ollamaCapabilities(m.name);
      if (caps?.includes("tools")) withTools.push(m);
    }
    // Largest tool-capable model that still fits in memory.
    chat = withTools
      .filter((m) => m.sizeGB + 2.5 <= hw.totalMemGB)
      .sort((a, b) => b.sizeGB - a.sizeGB)[0]?.name;
    if (!chat) {
      res.status(409).json({
        detail: `No tool-capable chat model is downloaded yet. Download ${recommendedChatModel(hw)} first.`,
      });
      return;
    }
  }
  const embed = names.find((n) => /embed/.test(n));

  updateAiConfig((cfg) => {
    if (!cfg.providers.some((p) => p.id === "ollama")) cfg.providers.push({ id: "ollama", kind: "ollama" });
    cfg.roles.agent = { provider: "ollama", model: chat, supportsTools: true };
    cfg.roles.utility = { provider: "ollama", model: chat, supportsTools: true };
    if (embed) cfg.roles.embedding = { provider: "ollama", model: embed };
    else delete cfg.roles.embedding;
    cfg.localOnly = true;
  });
  invalidateHealthCache();
  res.json({ ok: true, chat, embed: embed ?? null, effective: describeLlmConfig() });
});

/**
 * One-click cloud setup: the provider's model for chat and background tasks,
 * Local-only mode off. Document search uses the provider's embeddings when it
 * has them, otherwise keyword search — people choosing cloud often can't run
 * local models, so nothing here depends on Ollama.
 */
aiControlCenterRouter.post("/quick-setup/cloud", async (req, res) => {
  const { provider: id, model: requested } = req.body as { provider?: string; model?: string };
  const pc = id ? resolveProvider(id) : null;
  if (!pc || !id) {
    res.status(404).json({ detail: "Unknown provider" });
    return;
  }
  if (providerNeedsKey(pc) && !providerHasKey(pc)) {
    res.status(409).json({ detail: `Save your ${pc.label ?? id} API key first.` });
    return;
  }

  let listed: string[] = [];
  try {
    listed = (await buildProvider(pc).listModels?.()) ?? [];
  } catch (err) {
    const { kind, message } = classifyLlmError(err);
    if (kind === "auth" || kind === "quota") {
      res.status(422).json({ detail: message });
      return;
    }
    // Offline: still save the choice; the status card shows the connection problem.
  }
  const model = requested?.trim() || recommendedCloudModel(id, listed);
  if (!model) {
    res.status(409).json({ detail: `${pc.label ?? id} didn't list any chat models. Type a model name under Advanced settings.` });
    return;
  }
  if (listed.length && !listed.includes(model)) {
    res.status(409).json({ detail: `${pc.label ?? id} doesn't offer "${model}" to your account. Pick one from the list.` });
    return;
  }

  const embedding = CLOUD_EMBEDDING[id] ? { provider: id, model: CLOUD_EMBEDDING[id] } : null;
  const embeddingNote = embedding ? `${pc.label ?? id} (${embedding.model})` : "keyword search";

  updateAiConfig((cfg) => {
    for (const p of [id, ...(embedding ? [embedding.provider] : [])]) {
      if (!cfg.providers.some((s) => s.id === p)) cfg.providers.push({ id: p, kind: PROVIDER_PRESETS[p]?.kind ?? "openai-compatible" });
    }
    cfg.roles.agent = { provider: id, model, supportsTools: true };
    cfg.roles.utility = { provider: id, model, supportsTools: true };
    if (embedding) cfg.roles.embedding = embedding;
    else delete cfg.roles.embedding;
    cfg.localOnly = false;
  });
  invalidateHealthCache();
  res.json({ ok: true, chat: model, embedding: embeddingNote, effective: describeLlmConfig() });
});
