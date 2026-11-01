import { API_PREFIX, APP_ORIGIN } from "./bridge/protocol";
import { isDev } from "./paths";

/** Where the running sidecars listen, plus the per-launch token the backend requires. */
export type RuntimeInfo = {
  watchmanUrl: string;
  backendUrl: string;
  frontendUrl: string;
  token: string;
};

let runtime: RuntimeInfo | null = null;

/** Null until boot completes. */
export function getRuntime(): RuntimeInfo | null {
  return runtime;
}

export function setRuntime(info: RuntimeInfo): void {
  runtime = info;
}

/** The URL the main window loads once the app is running. */
export const appUrl = (): string => (isDev ? runtime!.frontendUrl : `${APP_ORIGIN}/`);

/** Backend origin for the renderer. Empty until boot completes (the splash page's preload asks too). */
export const apiBase = (): string => (!runtime ? "" : isDev ? runtime.backendUrl : `${APP_ORIGIN}${API_PREFIX}`);
