import { getLlm } from "./providers";

const ANTHROPIC_PLACEHOLDERS = new Set([
  "",
  "your-anthropic-key",
  "sk-ant-your-key-here",
]);

/** One-token ping of the agent model — fails fast on boot if the provider rejects us. */
export async function validateLlmLive(): Promise<void> {
  let llm;
  try {
    llm = getLlm("agent");
  } catch (err) {
    console.error(`[startup] LLM config: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const label = `${llm.providerId}/${llm.model}${llm.local ? " (local)" : ""}`;
  if (
    llm.providerId === "anthropic" &&
    ANTHROPIC_PLACEHOLDERS.has(process.env.ANTHROPIC_API_KEY?.trim() ?? "") &&
    !process.env.LLM_API_KEY?.trim()
  ) {
    console.error("[startup] ANTHROPIC_API_KEY is missing or still the .env.example placeholder");
    return;
  }

  // Local models: confirm it is installed, but don't load gigabytes of weights
  // into memory at every launch just to say "ping".
  if (llm.local && llm.provider.listModels) {
    try {
      const models = await llm.provider.listModels();
      const ok = models.some((m) => m === llm.model || m.replace(/:latest$/, "") === llm.model);
      if (ok) console.log(`[startup] LLM installed: ${label}`);
      else console.error(`[startup] ${label} is not installed — download it in the AI Control Center`);
    } catch (err) {
      console.error(`[startup] Local model server unreachable for ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  try {
    await llm.provider.complete({
      model: llm.model,
      maxTokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    console.log(`[startup] LLM reachable: ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[startup] LLM check failed for ${label}. Fix the provider config and restart — tsx watch does not reload .env changes.\n  ${msg}`,
    );
  }
}
