import { asBody } from "../../http/body";
import { badRequest, unauthorized } from "../../http/httpError";

/** Only loopback HTTP callbacks — the code can never be sent to another host. */
export function isLoopbackRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  try {
    const u = new URL(uri);
    return (
      u.protocol === "http:" &&
      (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]") &&
      u.port !== "" &&
      u.pathname === "/callback" &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]{43,128}$/;

export type AuthorizeRequest = { redirectUri: string; state: string; codeChallenge: string };

export function parseAuthorizeRequest(raw: unknown): AuthorizeRequest {
  const { redirect_uri, state, code_challenge, code_challenge_method } = asBody(raw);
  if (!isLoopbackRedirect(redirect_uri)) {
    throw badRequest("redirect_uri must be a loopback /callback URL");
  }
  if (code_challenge_method !== "S256" || typeof code_challenge !== "string" || !B64URL.test(code_challenge)) {
    throw badRequest("A PKCE S256 code_challenge is required");
  }
  if (typeof state !== "string" || state.length < 16 || state.length > 256) {
    throw badRequest("Invalid state");
  }
  return { redirectUri: redirect_uri, state, codeChallenge: code_challenge };
}

export type TokenRequest = { code: string; codeVerifier: string; redirectUri: string };

export function parseTokenRequest(raw: unknown): TokenRequest {
  const { code, code_verifier, redirect_uri } = asBody(raw);
  if (typeof code !== "string" || typeof code_verifier !== "string" || typeof redirect_uri !== "string") {
    throw badRequest("code, code_verifier and redirect_uri are required");
  }
  return { code, codeVerifier: code_verifier, redirectUri: redirect_uri };
}

/** Desktops have no cookie jar, so the refresh token comes in the body. */
export function parseRefreshToken(raw: unknown): string {
  const { refreshToken } = asBody(raw);
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw unauthorized("Invalid or expired session");
  }
  return refreshToken;
}
