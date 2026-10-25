import crypto from "crypto";
import fs from "fs";
import { dataFile } from "../../infra/dataDir";
import type { LlmRole, ProviderConfig, RoleBinding } from "../providers/registry";

/**
 * AI Control Center persistence.
 *
 *   <data>/ai/config.json   providers, role bindings, privacy policy (no secrets)
 *   <data>/ai/secrets.json  API keys, AES-256-GCM encrypted with the master key
 *
 * The master key comes from the Electron shell (CAPSCREEN_MASTER_KEY, itself
 * sealed by the OS keychain via safeStorage). Under `pnpm dev` a key file is
 * generated next to the data instead.
 */

export type StoredProvider = Omit<ProviderConfig, "apiKey" | "apiKeyEnv">;

export type AiConfig = {
  version: 1;
  providers: StoredProvider[];
  roles: Partial<Record<LlmRole, RoleBinding>>;
  /** When true, only on-device providers may be used. */
  localOnly: boolean;
  updatedAt: string;
};

type SealedSecret = { iv: string; tag: string; data: string; hint: string; updatedAt: string };
type SecretsFile = Record<string, SealedSecret>;

const configPath = () => dataFile("ai", "config.json");
const secretsPath = () => dataFile("ai", "secrets.json");

let masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const fromEnv = process.env.CAPSCREEN_MASTER_KEY?.trim();
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("CAPSCREEN_MASTER_KEY must be 32 bytes (base64)");
    masterKey = key;
    return key;
  }
  const devKeyFile = dataFile("ai", "dev-master.key");
  if (!fs.existsSync(devKeyFile)) {
    fs.writeFileSync(devKeyFile, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
    console.warn(`[ai] No CAPSCREEN_MASTER_KEY — generated dev key at ${devKeyFile} (the desktop app uses the OS keychain)`);
  }
  masterKey = Buffer.from(fs.readFileSync(devKeyFile, "utf8").trim(), "base64");
  return masterKey;
}

function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

// ── config ───────────────────────────────────────────────────────────────────

let configCache: { mtimeMs: number; value: AiConfig } | null = null;

export function readAiConfig(): AiConfig | null {
  const file = configPath();
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  if (configCache?.mtimeMs === mtimeMs) return configCache.value;
  const value = readJson<AiConfig>(file);
  if (!value) return null;
  configCache = { mtimeMs, value };
  return value;
}

export function writeAiConfig(next: Omit<AiConfig, "version" | "updatedAt">): AiConfig {
  const value: AiConfig = { version: 1, ...next, updatedAt: new Date().toISOString() };
  writeJsonAtomic(configPath(), value);
  configCache = null;
  return value;
}

export function updateAiConfig(fn: (cfg: Omit<AiConfig, "version" | "updatedAt">) => void): AiConfig {
  const cur = readAiConfig() ?? { version: 1 as const, providers: [], roles: {}, localOnly: false, updatedAt: "" };
  const draft = structuredClone({ providers: cur.providers, roles: cur.roles, localOnly: cur.localOnly });
  fn(draft);
  return writeAiConfig(draft);
}

// ── secrets ──────────────────────────────────────────────────────────────────

let secretsCache: SecretsFile | null = null;

function readSecrets(): SecretsFile {
  secretsCache ??= readJson<SecretsFile>(secretsPath()) ?? {};
  return secretsCache;
}

export function setProviderKey(providerId: string, apiKey: string): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
  cipher.setAAD(Buffer.from(providerId));
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const secrets = { ...readSecrets() };
  secrets[providerId] = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    hint: apiKey.length > 8 ? `…${apiKey.slice(-4)}` : "set",
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(secretsPath(), secrets);
  secretsCache = secrets;
  configCache = null; // force registry rebuild with the new key
}

export function deleteProviderKey(providerId: string): void {
  const secrets = { ...readSecrets() };
  delete secrets[providerId];
  writeJsonAtomic(secretsPath(), secrets);
  secretsCache = secrets;
  configCache = null;
}

export function getProviderKey(providerId: string): string | null {
  const sealed = readSecrets()[providerId];
  if (!sealed) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(Buffer.from(providerId));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    console.error(`[ai] Could not decrypt key for "${providerId}" — re-enter it in the AI Control Center`);
    return null;
  }
}

export function providerKeyInfo(providerId: string): { configured: boolean; hint: string | null; updatedAt: string | null } {
  const sealed = readSecrets()[providerId];
  return { configured: !!sealed, hint: sealed?.hint ?? null, updatedAt: sealed?.updatedAt ?? null };
}
