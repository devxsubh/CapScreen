import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { isLoopbackUrl } from "../providers/registry";

/**
 * On-device model runtimes (Ollama, LM Studio) — detection, hardware fit, and
 * model management. Everything here talks to 127.0.0.1 only.
 */

export const OLLAMA_URL = (process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
const LMSTUDIO_URL = "http://127.0.0.1:1234";

export type Hardware = {
  platform: NodeJS.Platform;
  arch: string;
  cpu: string;
  cores: number;
  totalMemGB: number;
  freeMemGB: number;
  /** Apple Silicon shares RAM with the GPU, so most of it is usable for models. */
  unifiedMemory: boolean;
  /** Free space where Ollama stores models; null when it can't be read. */
  freeDiskGB: number | null;
};

const gb = (n: number) => Math.round((n / 1024 ** 3) * 10) / 10;

function freeDiskGB(): number | null {
  // Ollama keeps models under ~/.ollama/models unless OLLAMA_MODELS moves them.
  const candidates = [process.env.OLLAMA_MODELS?.trim(), path.join(os.homedir(), ".ollama"), os.homedir()];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      const s = fs.statfsSync(dir);
      return gb(s.bavail * s.bsize);
    } catch {
      // try the next one
    }
  }
  return null;
}

export function detectHardware(): Hardware {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    cpu: cpus[0]?.model ?? "unknown",
    cores: cpus.length,
    totalMemGB: gb(os.totalmem()),
    freeMemGB: gb(os.freemem()),
    unifiedMemory: process.platform === "darwin" && process.arch === "arm64",
    freeDiskGB: freeDiskGB(),
  };
}

/** Disk headroom kept free beyond the model itself. */
export const DISK_HEADROOM_GB = 2;

export type CatalogModel = {
  id: string;
  label: string;
  family: string;
  sizeGB: number;
  /** RAM needed to run alongside the app comfortably. */
  minRamGB: number;
  tools: boolean;
  kind: "chat" | "embedding";
  note: string;
};

/** Curated Ollama models known to work with CapScreen's tool-calling agent. */
export const MODEL_CATALOG: CatalogModel[] = [
  { id: "qwen3:4b", label: "Qwen3 4B", family: "Qwen", sizeGB: 2.5, minRamGB: 8, tools: true, kind: "chat", note: "Best fit for 8 GB machines. Solid tool calling." },
  { id: "qwen3:8b", label: "Qwen3 8B", family: "Qwen", sizeGB: 5.2, minRamGB: 12, tools: true, kind: "chat", note: "Stronger reasoning; runs on 8 GB but slowly." },
  { id: "llama3.1:8b", label: "Llama 3.1 8B", family: "Llama", sizeGB: 4.9, minRamGB: 12, tools: true, kind: "chat", note: "Reliable general model with tool support." },
  { id: "qwen3:14b", label: "Qwen3 14B", family: "Qwen", sizeGB: 9.3, minRamGB: 20, tools: true, kind: "chat", note: "Noticeably better analysis; needs 24 GB+." },
  { id: "gpt-oss:20b", label: "gpt-oss 20B", family: "OpenAI", sizeGB: 14, minRamGB: 24, tools: true, kind: "chat", note: "Open-weight reasoning model; 24 GB+." },
  { id: "qwen3:30b", label: "Qwen3 30B (MoE)", family: "Qwen", sizeGB: 19, minRamGB: 32, tools: true, kind: "chat", note: "Fast mixture-of-experts; 32 GB+." },
  { id: "gemma3:4b", label: "Gemma 3 4B", family: "Gemma", sizeGB: 3.3, minRamGB: 8, tools: false, kind: "chat", note: "No tool calling — use only for narratives/utility." },
  { id: "nomic-embed-text", label: "Nomic Embed", family: "Nomic", sizeGB: 0.3, minRamGB: 4, tools: false, kind: "embedding", note: "Document search embeddings (768-dim)." },
  { id: "mxbai-embed-large", label: "mxbai Embed Large", family: "Mixedbread", sizeGB: 0.7, minRamGB: 6, tools: false, kind: "embedding", note: "Higher-quality embeddings (1024-dim)." },
];

export type Fit = "great" | "ok" | "tight" | "too-large";

export function modelFit(model: CatalogModel, hw: Hardware): Fit {
  // Discrete-GPU PCs keep weights in RAM too; be a little more conservative.
  const usable = hw.unifiedMemory ? hw.totalMemGB : hw.totalMemGB * 0.9;
  if (usable >= model.minRamGB * 1.5) return "great";
  if (usable >= model.minRamGB) return "ok";
  if (usable >= model.sizeGB + 2.5) return "tight";
  return "too-large";
}

export function recommendedChatModel(hw: Hardware): string {
  const fits = MODEL_CATALOG.filter((m) => m.kind === "chat" && m.tools && ["great", "ok"].includes(modelFit(m, hw)));
  return fits.sort((a, b) => b.sizeGB - a.sizeGB)[0]?.id ?? "qwen3:4b";
}

async function getJson<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

export type InstalledModel = { name: string; sizeGB: number; family: string | null; parameterSize: string | null; modifiedAt: string };

export async function ollamaStatus(): Promise<{ running: boolean; version: string | null; models: InstalledModel[] }> {
  const version = await getJson<{ version: string }>(`${OLLAMA_URL}/api/version`);
  if (!version) return { running: false, version: null, models: [] };
  const tags = await getJson<{
    models: Array<{ name: string; size: number; modified_at: string; details?: { family?: string; parameter_size?: string } }>;
  }>(`${OLLAMA_URL}/api/tags`);
  return {
    running: true,
    version: version.version,
    models: (tags?.models ?? []).map((m) => ({
      name: m.name,
      sizeGB: Math.round((m.size / 1024 ** 3) * 10) / 10,
      family: m.details?.family ?? null,
      parameterSize: m.details?.parameter_size ?? null,
      modifiedAt: m.modified_at,
    })),
  };
}

type OllamaInstall = { kind: "app" | "binary"; path: string };

/** Where Ollama is installed on this computer, if anywhere. */
export function findOllamaInstall(): OllamaInstall | null {
  const home = os.homedir();
  const apps: string[] = [];
  const bins: string[] = [];
  if (process.platform === "darwin") {
    apps.push("/Applications/Ollama.app", path.join(home, "Applications", "Ollama.app"));
    bins.push("/opt/homebrew/bin/ollama", "/usr/local/bin/ollama");
  } else if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    apps.push(path.join(local, "Programs", "Ollama", "ollama app.exe"));
    bins.push(path.join(local, "Programs", "Ollama", "ollama.exe"));
  } else {
    bins.push("/usr/local/bin/ollama", "/usr/bin/ollama", path.join(home, ".local", "bin", "ollama"));
  }
  for (const p of apps) if (fs.existsSync(p)) return { kind: "app", path: p };
  for (const p of bins) if (fs.existsSync(p)) return { kind: "binary", path: p };
  return null;
}

/** Ollama is only ours to start when it is meant to run on this machine. */
export function ollamaIsLocal(): boolean {
  return isLoopbackUrl(OLLAMA_URL);
}

/**
 * Launch the installed Ollama and wait for its API. The desktop app (macOS,
 * Windows) also starts its menu-bar helper; a bare binary runs `ollama serve`.
 */
export async function startOllama(timeoutMs = 20_000): Promise<{ started: boolean; detail?: string }> {
  if ((await ollamaStatus()).running) return { started: true };
  if (!ollamaIsLocal()) return { started: false, detail: `Ollama is configured at ${OLLAMA_URL}, which isn't this computer.` };
  const install = findOllamaInstall();
  if (!install) return { started: false, detail: "Ollama isn't installed. Download it from ollama.com, then try again." };

  const [cmd, args] =
    install.kind === "app"
      ? process.platform === "darwin"
        ? ["open", ["-g", "-a", install.path]]
        : [install.path, []]
      : [install.path, ["serve"]];
  try {
    const child = spawn(cmd, args as string[], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch (err) {
    return { started: false, detail: `Couldn't launch Ollama: ${err instanceof Error ? err.message : String(err)}` };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    if ((await ollamaStatus()).running) return { started: true };
  }
  return { started: false, detail: "Ollama was launched but didn't respond yet. Give it a few seconds, then check again." };
}

/** Ollama treats "qwen3:4b" and "nomic-embed-text" (= ":latest") as tags of one name. */
export function sameOllamaModel(a: string, b: string): boolean {
  const tag = (s: string) => (s.includes(":") ? s : `${s}:latest`);
  return tag(a) === tag(b);
}

export async function lmStudioStatus(): Promise<{ running: boolean; models: string[] }> {
  const models = await getJson<{ data: Array<{ id: string }> }>(`${LMSTUDIO_URL}/v1/models`, 1500);
  return { running: !!models, models: models?.data.map((m) => m.id) ?? [] };
}

/** Ollama model capabilities ("tools", "embedding", "completion", …) where the server reports them. */
export async function ollamaCapabilities(model: string): Promise<string[] | null> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { capabilities?: string[] };
    return body.capabilities ?? null;
  } catch {
    return null;
  }
}

export type PullProgress = { status: string; completed?: number; total?: number; error?: string };

/** Stream `ollama pull` progress. Resolves when the pull ends or fails. */
export async function pullOllamaModel(model: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  const resp = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error(`Ollama pull failed (${resp.status})`);

  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (!line) continue;
      const p = JSON.parse(line) as PullProgress;
      if (p.error) throw new Error(p.error);
      onProgress(p);
    }
  }
}

export async function deleteOllamaModel(model: string): Promise<void> {
  const resp = await fetch(`${OLLAMA_URL}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!resp.ok) throw new Error(`Ollama delete failed (${resp.status})`);
}
