import { desktop } from "./desktop";

/**
 * Backend origin. The desktop shell picks a free loopback port at launch and
 * hands it over through the preload bridge; `pnpm dev` uses the env var.
 */
export function apiBase(): string {
  const fromDesktop = desktop()?.apiBase;
  return (fromDesktop ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
