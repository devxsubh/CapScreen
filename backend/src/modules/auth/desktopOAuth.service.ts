import crypto from "crypto";
import { Types } from "mongoose";
import { badRequest, unauthorized } from "../../http/httpError";
import type { UserDocument } from "../../models";
import { DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS } from "./config";
import { issueSession, type Session } from "./session";
import * as tokens from "./token.repository";
import * as users from "./user.repository";
import type { AuthorizeRequest, TokenRequest } from "./desktopOAuth.validation";

/**
 * Desktop sign-in, the way native apps (and Claude Code) do it — RFC 8252:
 *
 *  1. The app opens the browser at /desktop/authorize with a loopback
 *     redirect_uri, a random state, and a PKCE S256 code_challenge.
 *  2. The user signs in on the portal; the portal calls POST /authorize-code
 *     with their access token and gets a one-time code.
 *  3. The browser is sent to http://127.0.0.1:<port>/callback?code&state.
 *  4. The app exchanges code + code_verifier at POST /token for a session.
 */

const CODE_TTL_MS = 2 * 60 * 1000;
const INVALID_SESSION = "Invalid or expired session";

type DesktopSession = { user: UserDocument; session: Session };

/** Step 2: returns the loopback URL (with code and state) to send the browser to. */
export async function createAuthorizationCode(userId: string, req: AuthorizeRequest): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  await tokens.saveDesktopCode(code, {
    userId: new Types.ObjectId(userId),
    codeChallenge: req.codeChallenge,
    redirectUri: req.redirectUri,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const target = new URL(req.redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", req.state);
  return target.toString();
}

/** Step 4: a code is single-use, bound to its redirect_uri, and needs the matching PKCE verifier. */
export async function exchangeCode(req: TokenRequest): Promise<DesktopSession> {
  const record = await tokens.claimDesktopCode(req.code);
  if (!record || record.redirectUri !== req.redirectUri) {
    throw badRequest("Invalid or expired code");
  }
  if (!pkceMatches(req.codeVerifier, record.codeChallenge)) {
    throw badRequest("PKCE verification failed");
  }
  const user = await users.findById(record.userId);
  if (!user) throw badRequest("Account no longer exists");
  return { user, session: await issueSession(user, DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS) };
}

function pkceMatches(codeVerifier: string, codeChallenge: string): boolean {
  const a = Buffer.from(crypto.createHash("sha256").update(codeVerifier).digest("base64url"));
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Rotates a desktop refresh token. */
export async function refreshSession(refreshToken: string): Promise<DesktopSession> {
  const userId = await tokens.findRefreshTokenOwner(refreshToken);
  if (!userId) throw unauthorized(INVALID_SESSION);
  const user = await users.findById(userId);
  await tokens.deleteRefreshToken(refreshToken);
  if (!user) throw unauthorized(INVALID_SESSION);
  return { user, session: await issueSession(user, DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS) };
}

export async function revoke(refreshToken: string): Promise<void> {
  await tokens.deleteRefreshToken(refreshToken).catch(() => {});
}
