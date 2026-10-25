import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { connectDb } from "../lib/infra/db";
import { generateAuthTokens } from "../lib/auth/tokens";
import { requireJwt } from "../middleware/requireJwt";
import {
  DesktopAuthCode,
  findUserById,
  findValidRefreshToken,
  hashAuthCode,
  revokeRefreshToken,
  serializePublicUser,
} from "../models";

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
export const desktopOAuthRouter = Router();

const CODE_TTL_MS = 2 * 60 * 1000;
const DESKTOP_REFRESH_DAYS = Number.parseInt(process.env.DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS ?? "30", 10);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many requests. Please try again later." },
});

desktopOAuthRouter.use(limiter);
desktopOAuthRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

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

desktopOAuthRouter.post("/authorize-code", requireJwt, async (req, res) => {
  const { redirect_uri, state, code_challenge, code_challenge_method } = req.body as Record<string, unknown>;
  if (!isLoopbackRedirect(redirect_uri)) {
    res.status(400).json({ detail: "redirect_uri must be a loopback /callback URL" });
    return;
  }
  if (code_challenge_method !== "S256" || typeof code_challenge !== "string" || !B64URL.test(code_challenge)) {
    res.status(400).json({ detail: "A PKCE S256 code_challenge is required" });
    return;
  }
  if (typeof state !== "string" || state.length < 16 || state.length > 256) {
    res.status(400).json({ detail: "Invalid state" });
    return;
  }

  const code = crypto.randomBytes(32).toString("base64url");
  await DesktopAuthCode.create({
    codeHash: hashAuthCode(code),
    userId: res.locals.userId,
    codeChallenge: code_challenge,
    redirectUri: redirect_uri,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const target = new URL(redirect_uri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  res.json({ redirect: target.toString() });
});

async function sessionResponse(user: Parameters<typeof generateAuthTokens>[0]) {
  const issued = await generateAuthTokens(user, DESKTOP_REFRESH_DAYS);
  return {
    user: serializePublicUser(user),
    accessToken: issued.accessToken.token,
    accessExpires: issued.accessToken.expires,
    refreshToken: issued.refreshTokenValue,
    refreshExpires: issued.refreshExpires.toISOString(),
  };
}

desktopOAuthRouter.post("/token", async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body as Record<string, unknown>;
  if (typeof code !== "string" || typeof code_verifier !== "string" || typeof redirect_uri !== "string") {
    res.status(400).json({ detail: "code, code_verifier and redirect_uri are required" });
    return;
  }
  // Atomically claim the code so it can only ever be redeemed once.
  const record = (await DesktopAuthCode.findOneAndUpdate(
    { codeHash: hashAuthCode(code), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: false },
  ).lean()) as { userId: unknown; codeChallenge: string; redirectUri: string } | null;
  if (!record || record.redirectUri !== redirect_uri) {
    res.status(400).json({ detail: "Invalid or expired code" });
    return;
  }
  const challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
  const a = Buffer.from(challenge);
  const b = Buffer.from(record.codeChallenge);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(400).json({ detail: "PKCE verification failed" });
    return;
  }
  const user = await findUserById(String(record.userId));
  if (!user) {
    res.status(400).json({ detail: "Account no longer exists" });
    return;
  }
  res.json(await sessionResponse(user));
});

/** Rotate a desktop refresh token (sent in the body; desktops have no cookie jar). */
desktopOAuthRouter.post("/refresh", async (req, res) => {
  const refreshToken = (req.body as { refreshToken?: unknown }).refreshToken;
  if (typeof refreshToken !== "string" || !refreshToken) {
    res.status(401).json({ detail: "Invalid or expired session" });
    return;
  }
  const tokenDoc = await findValidRefreshToken(refreshToken);
  if (!tokenDoc) {
    res.status(401).json({ detail: "Invalid or expired session" });
    return;
  }
  const user = await findUserById(tokenDoc.userId.toString());
  await tokenDoc.deleteOne();
  if (!user) {
    res.status(401).json({ detail: "Invalid or expired session" });
    return;
  }
  res.json(await sessionResponse(user));
});

desktopOAuthRouter.post("/revoke", async (req, res) => {
  const refreshToken = (req.body as { refreshToken?: unknown }).refreshToken;
  if (typeof refreshToken === "string" && refreshToken) await revokeRefreshToken(refreshToken).catch(() => {});
  res.json({ ok: true });
});
