import { WatchmanUnavailableError } from "../screening/watchman";

/** Map provider and infra errors to user-readable messages. */
export function friendlyLlmError(err: unknown): string {
  if (err instanceof WatchmanUnavailableError) {
    return err.message;
  }

  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Request failed";

  if (
    msg.includes("authentication_error") ||
    msg.includes("invalid x-api-key") ||
    msg.includes("401")
  ) {
    return "The model provider rejected the API key. Update the key in model settings (or `.env`) and restart the backend.";
  }

  if (msg.includes("rate_limit") || msg.includes("429")) {
    return "AI rate limit reached. Wait a moment and try again.";
  }

  if (msg.includes("overloaded") || msg.includes("529")) {
    return "AI service is temporarily overloaded. Try again shortly.";
  }

  if (msg.includes("API key for provider")) {
    return "No API key is configured for the selected model provider.";
  }

  if (msg.includes("does not support tools")) {
    return "The selected local model does not support tool calling. Pick a tool-capable model or disable tools for it in model settings.";
  }

  if (msg.includes("ECONNREFUSED") && /:(11434|1234|8080)\b/.test(msg)) {
    return "The local model server is not running. Start Ollama / LM Studio and try again.";
  }


  return msg;
}
