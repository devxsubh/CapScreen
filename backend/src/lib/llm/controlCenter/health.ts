import { buildProvider, getLlmConfig, isProviderLocal, type LlmRole, type ProviderConfig } from "../providers/registry";
import { classifyLlmError, type LlmErrorKind } from "../friendlyError";
import { findOllamaInstall, ollamaIsLocal, sameOllamaModel } from "./localRuntime";
import { providerHasKey, providerNeedsKey } from "./providers";

/**
 * "Is the AI actually going to work?" — one check per role that goes past the
 * saved config: is the runtime up, is the model there, is the key accepted.
 * Every problem carries the one action that fixes it, for the UI to offer.
 */

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
  /** ok: works · warning: works with limits · error: won't work · off: not used (embedding only) */
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

type Listing = { models: string[] } | { error: { kind: LlmErrorKind; message: string } };

const LIST_TTL_MS = 20_000;
const LIST_TIMEOUT_MS = 8_000;
const listCache = new Map<string, { at: number; value: Promise<Listing> }>();

function listModels(pc: ProviderConfig, fresh: boolean): Promise<Listing> {
  const key = JSON.stringify([pc.id, pc.kind, pc.baseUrl, pc.apiKey]);
  const hit = listCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < LIST_TTL_MS) return hit.value;

  const value = (async (): Promise<Listing> => {
    try {
      const provider = buildProvider(pc);
      if (!provider.listModels) return { models: [] };
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })), LIST_TIMEOUT_MS),
      );
      return { models: await Promise.race([provider.listModels(), timeout]) };
    } catch (err) {
      return { error: classifyLlmError(err) };
    }
  })();
  listCache.set(key, { at: Date.now(), value });
  return value;
}

/** Forget cached listings, e.g. right after a key or download changes. */
export function invalidateHealthCache(): void {
  listCache.clear();
}

const ROLE_NAME: Record<LlmRole, string> = {
  agent: "the assistant",
  utility: "background tasks",
  embedding: "document search",
};

function runtimeName(pc: ProviderConfig): string {
  if (pc.id === "ollama") return "Ollama";
  if (pc.id === "lmstudio") return "LM Studio";
  if (pc.id === "llamacpp") return "the llama.cpp server";
  return pc.label ?? pc.id;
}

function ollamaDownFix(): FixAction {
  if (!ollamaIsLocal()) return { action: "edit-role", label: "Change model" };
  return findOllamaInstall() ? { action: "start-ollama", label: "Start Ollama" } : { action: "get-ollama", label: "Install Ollama" };
}

async function checkRole(role: LlmRole, fresh: boolean): Promise<RoleHealth> {
  const config = getLlmConfig();
  const own = config.roles[role];
  const binding = own ?? (role === "utility" ? config.roles.agent : undefined);

  if (!binding) {
    if (role === "embedding") {
      return {
        role,
        status: "off",
        binding: null,
        title: "Keyword search",
        detail: "No embedding model, so document search matches words rather than meaning. Optional.",
      };
    }
    return {
      role,
      status: "error",
      binding: null,
      title: "Not set up",
      detail: `Choose a model so ${ROLE_NAME[role]} can work.`,
      fix: { action: "setup", label: "Set up AI" },
    };
  }

  const pc = config.providers.find((p) => p.id === binding.provider);
  const view = {
    provider: binding.provider,
    label: pc?.label ?? binding.provider,
    model: binding.model,
    local: pc ? isProviderLocal(pc) : false,
    inherited: !own,
  };
  const fail = (title: string, detail: string, fix?: FixAction): RoleHealth => ({
    role,
    status: "error",
    binding: view,
    title,
    detail,
    fix,
  });

  if (!pc) {
    return fail("Provider missing", `"${binding.provider}" was removed. Pick another model.`, { action: "edit-role", label: "Change model" });
  }
  if (config.localOnly && !view.local) {
    return fail(
      "Blocked by Local-only mode",
      `${view.label} is a cloud provider, and Local-only mode blocks anything that leaves this computer.`,
      { action: "turn-off-local-only", label: "Allow cloud AI" },
    );
  }
  if (providerNeedsKey(pc) && !providerHasKey(pc)) {
    return fail("API key missing", `There's no API key saved for ${view.label}.`, {
      action: "add-key",
      label: "Add key",
      provider: pc.id,
    });
  }
  if (role === "embedding" && !buildProvider(pc).embed) {
    return fail("Can't do document search", `${view.label} has no embedding models. Use an on-device model or turn document search off.`, {
      action: "edit-role",
      label: "Change model",
    });
  }

  const listing = await listModels(pc, fresh);
  if ("error" in listing) {
    const { kind, message } = listing.error;
    if (kind === "local-down" || (view.local && (kind === "offline" || kind === "unreachable" || kind === "timeout"))) {
      return pc.id === "ollama"
        ? fail("Ollama isn't running", "Ollama runs the on-device models. Start it and this fixes itself.", ollamaDownFix())
        : fail(`${runtimeName(pc)} isn't running`, `Open ${runtimeName(pc)} and start its server, then check again.`);
    }
    if (kind === "auth") {
      return fail("API key rejected", `${view.label} didn't accept the saved key. It may have been revoked or mistyped.`, {
        action: "add-key",
        label: "Replace key",
        provider: pc.id,
      });
    }
    if (kind === "quota") {
      return fail("Out of credit", message);
    }
    if (kind === "offline" || kind === "timeout") {
      return fail(`Can't reach ${view.label}`, "Check your internet connection. Screening still works; AI features wait until you're back online.");
    }
    return fail(`${view.label} isn't responding`, message, { action: "edit-role", label: "Change model" });
  }

  const { models } = listing;
  const installed =
    !models.length || models.some((m) => (pc.kind === "ollama" ? sameOllamaModel(m, binding.model) : m === binding.model));
  if (!installed) {
    if (pc.kind === "ollama") {
      return fail(`${binding.model} isn't downloaded`, "The model was removed from Ollama, or hasn't been downloaded yet.", {
        action: "download-model",
        label: "Download",
        model: binding.model,
      });
    }
    return fail(
      "Model not available",
      `${view.label} doesn't offer "${binding.model}" to your account. It may be retired — pick another model.`,
      { action: "edit-role", label: "Change model" },
    );
  }

  if (role === "agent" && binding.supportsTools === false) {
    return {
      role,
      status: "warning",
      binding: view,
      title: "Chat only",
      detail: "This model can't use tools, so the assistant can answer questions but can't run screenings for you.",
      fix: { action: "edit-role", label: "Change model" },
    };
  }

  return { role, status: "ok", binding: view, title: "Ready" };
}

export async function checkAiHealth(opts: { fresh?: boolean } = {}): Promise<AiHealth> {
  const fresh = !!opts.fresh;
  let localOnly = false;
  let roles: Record<LlmRole, RoleHealth>;
  try {
    localOnly = !!getLlmConfig().localOnly;
    const [agent, utility, embedding] = await Promise.all(
      (["agent", "utility", "embedding"] as const).map((r) => checkRole(r, fresh)),
    );
    roles = { agent, utility, embedding };
  } catch (err) {
    // A broken config file shouldn't take the page down with it.
    const broken = (role: LlmRole): RoleHealth => ({
      role,
      status: "error",
      binding: null,
      title: "Settings couldn't be read",
      detail: err instanceof Error ? err.message : String(err),
      fix: { action: "setup", label: "Set up again" },
    });
    roles = { agent: broken("agent"), utility: broken("utility"), embedding: broken("embedding") };
  }

  const all = Object.values(roles);
  const overall =
    !roles.agent.binding && roles.agent.status === "error"
      ? "not-set-up"
      : all.some((r) => r.status === "error" || r.status === "warning")
        ? "attention"
        : "ready";
  return { overall, localOnly, roles, checkedAt: new Date().toISOString() };
}
