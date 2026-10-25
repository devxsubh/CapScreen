import { getLlm, type LlmRole } from "../llm/providers";

/** When set, PII may not be sent to LLM APIs that run off this machine. */
export function isDataResidencyRestricted(): boolean {
  const value = process.env.DATA_RESIDENCY?.trim().toLowerCase();
  return value === "restricted" || value === "eu" || value === "in";
}

/**
 * True when the model bound to `role` may not receive PII: residency is
 * restricted and the provider is remote. Local providers are always allowed.
 */
export function isExternalLlmBlocked(role: LlmRole = "utility"): boolean {
  if (!isDataResidencyRestricted()) return false;
  try {
    return !getLlm(role).local;
  } catch {
    return true;
  }
}
