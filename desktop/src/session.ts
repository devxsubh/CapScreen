import fs from "fs";
import { safeStorage } from "electron";
import { AuthHttpError, refreshSession, revokeSession, startSignIn, type CloudSession, type CloudUser, type SignInHandle } from "./authFlow";
import { isDev, userData } from "./paths";
import { authDonePage } from "./splash";

/**
 * Signed-in CapScreen account, Claude-Code style: sign in through the browser,
 * keep the refresh token sealed by the OS keychain, work offline for a grace
 * period. The account gates access only — screening data never leaves the machine.
 */

const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const REFRESH_EVERY_MS = 12 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { capscreenAuthUrl?: string };

/** Hosted auth service (backend/src/authService on Vercel). */
export const AUTH_URL = (
  process.env.CAPSCREEN_AUTH_URL?.trim() ||
  (isDev ? "http://127.0.0.1:4100" : pkg.capscreenAuthUrl) ||
  ""
).replace(/\/$/, "");

type StoredSession = {
  user: CloudUser;
  refreshToken: string;
  refreshExpires: string;
  lastValidatedAt: string;
};

export type ActiveSession = { user: CloudUser; offline: boolean };

const sessionFile = () => userData("vault", "session.sealed");
const identityFile = () => userData("identity.json");

function load(): StoredSession | null {
  try {
    const raw = fs.readFileSync(sessionFile());
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    return JSON.parse(json) as StoredSession;
  } catch {
    return null;
  }
}

function save(s: CloudSession): StoredSession {
  const stored: StoredSession = {
    user: s.user,
    refreshToken: s.refreshToken,
    refreshExpires: s.refreshExpires,
    lastValidatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(userData("vault"), { recursive: true, mode: 0o700 });
  const json = JSON.stringify(stored);
  fs.writeFileSync(sessionFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json, { mode: 0o600 });
  return stored;
}

/** Non-secret identity for the local backend (audit "performed by"). */
function writeIdentity(user: CloudUser | null): void {
  if (!user) {
    fs.rmSync(identityFile(), { force: true });
    return;
  }
  fs.writeFileSync(
    identityFile(),
    JSON.stringify({ email: user.email, displayName: user.displayName, organisation: user.organisation }, null, 2),
    { mode: 0o600 },
  );
}

function clear(): void {
  fs.rmSync(sessionFile(), { force: true });
  writeIdentity(null);
}

let current: ActiveSession | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let onExpired: (() => void) | null = null;

export function currentSession(): ActiveSession | null {
  return current;
}

/** Called when the server rejects the session mid-run (revoked, account deleted). */
export function onSessionExpired(fn: () => void): void {
  onExpired = fn;
}

function activate(user: CloudUser, offline: boolean): ActiveSession {
  current = { user, offline };
  writeIdentity(user);
  if (!refreshTimer) {
    refreshTimer = setInterval(() => void backgroundRefresh(), REFRESH_EVERY_MS);
    refreshTimer.unref();
  }
  return current;
}

async function backgroundRefresh(): Promise<void> {
  const stored = load();
  if (!stored || !AUTH_URL) return;
  try {
    const s = save(await refreshSession(AUTH_URL, stored.refreshToken));
    activate(s.user, false);
  } catch (err) {
    if (err instanceof AuthHttpError && (err.status === 400 || err.status === 401)) {
      clear();
      current = null;
      onExpired?.();
    }
    // Network errors: keep working within the offline grace window.
  }
}

/** Restore at launch: refresh online, fall back to the offline grace window. */
export async function restoreSession(): Promise<ActiveSession | null> {
  const stored = load();
  if (!stored) return null;
  if (Date.parse(stored.refreshExpires) <= Date.now()) {
    clear();
    return null;
  }
  try {
    const s = save(await refreshSession(AUTH_URL, stored.refreshToken));
    return activate(s.user, false);
  } catch (err) {
    if (err instanceof AuthHttpError && (err.status === 400 || err.status === 401)) {
      clear();
      return null;
    }
    const lastOk = Date.parse(stored.lastValidatedAt);
    if (Date.now() - lastOk < OFFLINE_GRACE_MS) return activate(stored.user, true);
    return null;
  }
}

/** Begin browser sign-in. The caller opens handle.authorizeUrl and awaits completion. */
export async function beginSignIn(): Promise<{ handle: SignInHandle; done: Promise<ActiveSession> }> {
  if (!AUTH_URL) throw new Error("This build has no sign-in service configured (capscreenAuthUrl).");
  const handle = await startSignIn({ authUrl: AUTH_URL, donePage: authDonePage });
  const done = handle.result.then((s) => {
    save(s);
    return activate(s.user, false);
  });
  return { handle, done };
}

export async function signOut(): Promise<void> {
  const stored = load();
  clear();
  current = null;
  if (stored && AUTH_URL) await revokeSession(AUTH_URL, stored.refreshToken);
}
