import { WatchmanUnavailableError } from "../screening/watchman";

export type LlmErrorKind =
  | "auth"
  | "quota"
  | "rate-limit"
  | "overloaded"
  | "no-key"
  | "no-tools"
  | "model-missing"
  | "local-down"
  | "unreachable"
  | "offline"
  | "timeout"
  | "unknown";

const LOCAL_PORTS = /:(11434|1234|8080)\b/;

function errorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown; cause?: { code?: unknown } } } | null;
  const code = e?.code ?? e?.cause?.code ?? e?.cause?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

function httpStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

/** Classify provider and network errors so callers can offer the right fix. */
export function classifyLlmError(err: unknown): { kind: LlmErrorKind; message: string } {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Request failed";
  const code = errorCode(err);
  const status = httpStatus(err);
  // fetch() puts the useful part ("connect ECONNREFUSED 127.0.0.1:11434") on the cause.
  const causeMsg = (err as { cause?: { message?: unknown } } | null)?.cause?.message;
  const detail = typeof causeMsg === "string" ? `${msg} ${causeMsg}` : msg;
  const lower = detail.toLowerCase();

  if (lower.includes("api key for provider")) {
    return { kind: "no-key", message: "No API key is saved for this provider. Add one in the AI Control Center." };
  }
  if (lower.includes("does not support tools")) {
    return {
      kind: "no-tools",
      message: "This model can't call tools. Pick a tool-capable model, or turn tool calling off for it in the AI Control Center.",
    };
  }
  if (
    status === 402 ||
    lower.includes("insufficient_quota") ||
    lower.includes("credit balance") ||
    lower.includes("billing") ||
    lower.includes("exceeded your current quota")
  ) {
    return {
      kind: "quota",
      message: "Your account with this provider is out of credit or has no billing set up. Check billing on the provider's website.",
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("authentication_error") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("api key not valid") ||
    /\b401\b/.test(msg)
  ) {
    return { kind: "auth", message: "The provider rejected the API key. Paste a new key in the AI Control Center." };
  }
  if (status === 429 || lower.includes("rate_limit") || /\b429\b/.test(msg)) {
    return { kind: "rate-limit", message: "AI rate limit reached. Wait a moment and try again." };
  }
  if (status === 529 || lower.includes("overloaded")) {
    return { kind: "overloaded", message: "The AI service is temporarily overloaded. Try again shortly." };
  }
  if (
    status === 404 ||
    /model ['"]?[^'"]+['"]? not found/i.test(msg) ||
    lower.includes("model_not_found") ||
    (lower.includes("model") && lower.includes("does not exist"))
  ) {
    return {
      kind: "model-missing",
      message: "That model isn't available. It may not be downloaded, may be retired, or your key may not have access to it.",
    };
  }
  if (code === "ECONNREFUSED" || lower.includes("econnrefused")) {
    return LOCAL_PORTS.test(detail)
      ?{ kind: "local-down", message: "The local model server isn't running. Start Ollama / LM Studio and try again." }
      : { kind: "unreachable", message: "The model server refused the connection. Check that it's running and the URL is right." };
  }
  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ENETUNREACH" ||
    code === "ECONNRESET" ||
    lower.includes("connection error") ||
    lower.includes("fetch failed")
  ) {
    return { kind: "offline", message: "Couldn't reach the provider. Check your internet connection and try again." };
  }
  if (
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    (err as { name?: string } | null)?.name === "TimeoutError" ||
    lower.includes("timed out")
  ) {
    return { kind: "timeout", message: "The provider took too long to answer. Try again." };
  }
  return { kind: "unknown", message: msg };
}

/** Map provider and infra errors to user-readable messages. */
export function friendlyLlmError(err: unknown): string {
  if (err instanceof WatchmanUnavailableError) {
    return err.message;
  }
  return classifyLlmError(err).message;
}
