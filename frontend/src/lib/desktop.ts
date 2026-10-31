import { useSyncExternalStore } from "react";

/**
 * Bridge exposed by the Electron preload script (desktop/src/preload.ts).
 * Absent under plain `pnpm dev` in a browser — every helper degrades gracefully.
 */
export type DesktopBridge = {
  apiBase: string;
  platform: NodeJS.Platform;
  appVersion: string;
  dataDir: string;
  /** Signed-in CapScreen account (cloud identity; gates access only). */
  user: { email: string; displayName: string | null; organisation: string | null } | null;
  /** True when working within the offline grace period. */
  offline: boolean;
  signOut(): Promise<void>;
  /** Open the account portal (password, profile) in the browser. */
  openAccount(): Promise<void>;
  openExternal(url: string): Promise<void>;
  revealInFolder(path: string): Promise<void>;
  saveFile(opts: { defaultName: string; data: ArrayBuffer | string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  pickFolder(opts?: { title?: string }): Promise<string | null>;
  pickFile(opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;
  notify(opts: { title: string; body: string; route?: string }): Promise<void>;
  printToPdf(opts: { html: string; defaultName: string }): Promise<string | null>;
  onNavigate(cb: (route: string) => void): () => void;
};

declare global {
  interface Window {
    capscreenDesktop?: DesktopBridge;
  }
}

export function desktop(): DesktopBridge | null {
  return typeof window !== "undefined" ? (window.capscreenDesktop ?? null) : null;
}

const noopSubscribe = () => () => {};

/**
 * The bridge for use during render. The server snapshot is always null, so the
 * hydration pass matches the server HTML and React re-renders with the bridge.
 */
export function useDesktop(): DesktopBridge | null {
  return useSyncExternalStore(noopSubscribe, desktop, () => null);
}
