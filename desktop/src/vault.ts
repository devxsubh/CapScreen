import crypto from "crypto";
import fs from "fs";
import { safeStorage } from "electron";
import { userData } from "./paths";

/**
 * 32-byte master key for encrypting API keys at rest (backend: lib/llm/controlCenter/store.ts).
 * Sealed with the OS keychain (macOS Keychain, Windows DPAPI, libsecret on Linux).
 */
export function loadMasterKey(): string {
  fs.mkdirSync(userData("vault"), { recursive: true, mode: 0o700 });
  const sealedFile = userData("vault", "master.key.sealed");
  const plainFile = userData("vault", "master.key");
  const canSeal = safeStorage.isEncryptionAvailable();

  if (fs.existsSync(sealedFile) && canSeal) {
    return safeStorage.decryptString(fs.readFileSync(sealedFile));
  }
  if (fs.existsSync(plainFile)) {
    const key = fs.readFileSync(plainFile, "utf8").trim();
    if (canSeal) {
      // Upgrade: keychain became available (e.g. Linux keyring unlocked).
      fs.writeFileSync(sealedFile, safeStorage.encryptString(key), { mode: 0o600 });
      fs.rmSync(plainFile);
    }
    return key;
  }

  const key = crypto.randomBytes(32).toString("base64");
  if (canSeal) {
    fs.writeFileSync(sealedFile, safeStorage.encryptString(key), { mode: 0o600 });
  } else {
    console.warn("[vault] OS keychain unavailable — master key stored with file permissions only");
    fs.writeFileSync(plainFile, key, { mode: 0o600 });
  }
  return key;
}
