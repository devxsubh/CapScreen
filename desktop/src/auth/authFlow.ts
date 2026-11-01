import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";

/**
 * Desktop sign-in protocol (RFC 8252 loopback redirect + PKCE), independent of
 * Electron so it can be exercised from plain Node:
 *
 *   1. listen on 127.0.0.1:<random>/callback
 *   2. open the browser at <auth>/desktop/authorize?redirect_uri&state&code_challenge
 *   3. receive ?code&state on the loopback, check state
 *   4. exchange code + code_verifier at <auth>/api/auth/desktop/token
 */

export type CloudUser = {
  id: string;
  email: string;
  displayName: string | null;
  organisation: string | null;
  emailVerified: boolean;
};

export type CloudSession = {
  user: CloudUser;
  accessToken: string;
  accessExpires: string;
  refreshToken: string;
  refreshExpires: string;
};

export class AuthHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthHttpError";
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(48));
  return { verifier, challenge: b64url(crypto.createHash("sha256").update(verifier).digest()) };
}

async function postJson<T>(authUrl: string, path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${authUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await resp.json().catch(() => ({}))) as T & { detail?: string };
  if (!resp.ok) throw new AuthHttpError(data.detail ?? `Auth service returned ${resp.status}`, resp.status);
  return data;
}

export type SignInHandle = {
  /** The URL to open in the user's browser. */
  authorizeUrl: string;
  /** Resolves with a session once the browser hands back, or rejects. */
  result: Promise<CloudSession>;
  cancel(): void;
};

export async function startSignIn(opts: {
  authUrl: string;
  /** HTML shown in the browser tab after the redirect lands. */
  donePage: (ok: boolean, message: string) => string;
  timeoutMs?: number;
}): Promise<SignInHandle> {
  const { verifier, challenge } = createPkce();
  const state = b64url(crypto.randomBytes(24));

  let settle!: { resolve: (s: CloudSession) => void; reject: (e: Error) => void };
  const result = new Promise<CloudSession>((resolve, reject) => (settle = { resolve, reject }));

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  let finished = false;
  const finish = (err: Error | null, session?: CloudSession) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    server.close();
    if (err) settle.reject(err);
    else settle.resolve(session!);
  };
  const timer = setTimeout(() => finish(new Error("Sign-in timed out. Try again.")), opts.timeoutMs ?? 5 * 60_000);

  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const reply = (ok: boolean, message: string) => {
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(opts.donePage(ok, message));
    };
    const code = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || !code) {
      // Don't finish: a stray/forged request must not cancel the real sign-in.
      reply(false, "This sign-in link doesn't match the request from CapScreen. Start again from the app.");
      return;
    }
    postJson<CloudSession>(opts.authUrl, "/api/auth/desktop/token", {
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }).then(
      (session) => {
        reply(true, "You can close this tab and return to CapScreen.");
        finish(null, session);
      },
      (err: Error) => {
        reply(false, err.message);
        finish(err);
      },
    );
  });

  const authorize = new URL("/desktop/authorize", opts.authUrl);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return {
    authorizeUrl: authorize.toString(),
    result,
    cancel: () => finish(new Error("Sign-in cancelled")),
  };
}

export function refreshSession(authUrl: string, refreshToken: string): Promise<CloudSession> {
  return postJson<CloudSession>(authUrl, "/api/auth/desktop/refresh", { refreshToken });
}

export async function revokeSession(authUrl: string, refreshToken: string): Promise<void> {
  await postJson(authUrl, "/api/auth/desktop/revoke", { refreshToken }).catch(() => {});
}
