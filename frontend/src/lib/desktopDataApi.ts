import { apiBase } from "@/lib/apiBase";

export type AppSettings = {
  backgroundScreening: { enabled: boolean; intervalHours: number };
  sanctionsLists: string[];
};

export type SanctionsInfo = {
  engineUrl: string;
  available: boolean;
  configured: string[];
  /** "offline" when screening from the on-device list snapshot. */
  mode: "online" | "offline";
  cached: Record<string, string>;
  info: {
    lists?: Record<string, number>;
    listHashes?: Record<string, string>;
    startedAt?: string;
    endedAt?: string;
    version?: string;
  } | null;
};

export type WatchFolder = { path: string; lastScanAt?: string; lastError: string | null; ingestedCount: number } | null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${apiBase()}/api/desktop${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await resp.json().catch(() => ({}))) as T & { detail?: string };
  if (!resp.ok) throw new Error(body.detail ?? `Request failed (${resp.status})`);
  return body;
}

async function download(path: string, init?: RequestInit): Promise<{ data: ArrayBuffer; filename: string }> {
  const resp = await fetch(`${apiBase()}/api/desktop${path}`, init);
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Request failed (${resp.status})`);
  }
  const disposition = resp.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "download";
  return { data: await resp.arrayBuffer(), filename };
}

export const desktopDataApi = {
  settings: () =>
    request<{ settings: AppSettings; availableLists: Array<{ id: string; label: string }>; databaseFile: string }>("/settings"),
  saveSettings: (patch: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
  sanctions: () => request<SanctionsInfo>("/sanctions"),

  backup: (password: string) =>
    download("/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }),
  restore: (file: ArrayBuffer, password: string) =>
    request<{ ok: true; createdAt: string; entries: number }>("/restore", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "x-backup-password": encodeURIComponent(password) },
      body: file,
    }),

  auditExport: (startupId?: string) => download(`/audit-export${startupId ? `?startupId=${encodeURIComponent(startupId)}` : ""}`),

  watchFolder: (startupId: string) => request<{ watch: WatchFolder }>(`/watch-folders/${startupId}`),
  setWatchFolder: (startupId: string, path: string | null) =>
    request<{ watch: WatchFolder }>(`/watch-folders/${startupId}`, { method: "PUT", body: JSON.stringify({ path }) }),
};

/** Save bytes through the native dialog on desktop, or a browser download otherwise. */
export async function saveDownload(data: ArrayBuffer | string, filename: string): Promise<string | null> {
  const bridge = typeof window !== "undefined" ? window.capscreenDesktop : undefined;
  if (bridge) return bridge.saveFile({ defaultName: filename, data });
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
