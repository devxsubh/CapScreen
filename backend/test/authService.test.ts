/**
 * HTTP contract of the cloud auth service: accounts, cookie sessions and the
 * desktop PKCE sign-in. Runs on SQLite with throwaway JWT keys and no email
 * provider (so signups are confirmed straight away).
 */
import "./authEnv";
import assert from "node:assert/strict";
import crypto from "crypto";
import { describe, test } from "node:test";
import { createAuthApp } from "../src/authApp";
import { useTempDatabase } from "./helpers";
import { serveForTests } from "./http";

useTempDatabase();
const api = serveForTests(createAuthApp);

type Json = Record<string, unknown>;
const EMAIL = "analyst@example.com";
const PASSWORD = "Correct-horse-9";

function refreshCookie(headers: Headers): string {
  const cookie = headers.get("set-cookie") ?? "";
  const match = /^([^=]+=[^;]+)/.exec(cookie);
  assert.ok(match, "refresh cookie set");
  return match[1];
}

describe("accounts", () => {
  let accessToken = "";
  let cookie = "";

  test("signup", async () => {
    assert.equal((await api("POST", "/api/auth/signup", { email: "nope", password: PASSWORD })).status, 400);
    assert.equal((await api("POST", "/api/auth/signup", { email: EMAIL, password: "short" })).status, 400);

    const res = await api("POST", "/api/auth/signup", { email: EMAIL, password: PASSWORD, name: "Ana" });
    assert.equal(res.status, 201);
    const body = res.body as { user: Json; tokens: Json };
    assert.equal(body.user.email, EMAIL);
    assert.equal(body.user.displayName, "Ana");
    assert.equal(body.user.emailVerified, true);
    assert.ok(body.tokens);

    assert.equal((await api("POST", "/api/auth/signup", { email: EMAIL, password: PASSWORD })).status, 409);
  });

  test("signin", async () => {
    assert.equal((await api("POST", "/api/auth/signin", { email: EMAIL })).status, 400);
    assert.equal((await api("POST", "/api/auth/signin", { email: "who@example.com", password: PASSWORD })).status, 401);
    assert.equal((await api("POST", "/api/auth/signin", { email: EMAIL, password: "Wrong-pass-9" })).status, 401);

    const res = await api("POST", "/api/auth/signin", { email: EMAIL.toUpperCase(), password: PASSWORD });
    assert.equal(res.status, 200);
    const tokens = (res.body as { tokens: { accessToken: { token: string } } }).tokens;
    accessToken = tokens.accessToken.token;
    cookie = refreshCookie(res.headers);
  });

  test("me", async () => {
    assert.equal((await api("GET", "/api/auth/me")).status, 401);
    assert.equal((await api("GET", "/api/auth/me", undefined, { authorization: "Bearer junk" })).status, 401);
    const me = await api("GET", "/api/auth/me", undefined, { authorization: `Bearer ${accessToken}` });
    assert.equal((me.body as Json).email, EMAIL);
  });

  test("refresh rotates the cookie and signout revokes it", async () => {
    assert.equal((await api("POST", "/api/auth/refresh-tokens")).status, 401);

    const refreshed = await api("POST", "/api/auth/refresh-tokens", undefined, { cookie });
    assert.equal(refreshed.status, 200);
    assert.ok((refreshed.body as Json).tokens);
    const next = refreshCookie(refreshed.headers);

    // The old refresh token was consumed.
    assert.equal((await api("POST", "/api/auth/refresh-tokens", undefined, { cookie })).status, 401);

    const auth = { authorization: `Bearer ${accessToken}` };
    assert.deepEqual((await api("POST", "/api/auth/signout", undefined, { ...auth, cookie: next })).body, { ok: true });
    assert.equal((await api("POST", "/api/auth/refresh-tokens", undefined, { cookie: next })).status, 401);
  });

  test("email flows", async () => {
    assert.equal((await api("POST", "/api/auth/verify-email", {})).status, 400);
    assert.equal((await api("POST", "/api/auth/verify-email", { token: "nope" })).status, 400);
    assert.equal((await api("POST", "/api/auth/forgot-password", { email: "bad" })).status, 400);
    assert.equal((await api("POST", "/api/auth/reset-password", { token: "nope", password: PASSWORD })).status, 400);
    assert.equal((await api("POST", "/api/auth/resend-verification", { email: "bad" })).status, 400);
  });
});

describe("desktop sign-in (PKCE)", () => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = "http://127.0.0.1:53682/callback";
  const state = crypto.randomBytes(16).toString("hex");
  let auth: Record<string, string> = {};

  test("authorize-code validates the request", async () => {
    const signin = await api("POST", "/api/auth/signin", { email: EMAIL, password: PASSWORD });
    auth = { authorization: `Bearer ${(signin.body as { tokens: { accessToken: { token: string } } }).tokens.accessToken.token}` };

    const base = { redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" };
    assert.equal((await api("POST", "/api/auth/desktop/authorize-code", base)).status, 401);
    assert.equal((await api("POST", "/api/auth/desktop/authorize-code", { ...base, redirect_uri: "https://evil.example/callback" }, auth)).status, 400);
    assert.equal((await api("POST", "/api/auth/desktop/authorize-code", { ...base, code_challenge_method: "plain" }, auth)).status, 400);
    assert.equal((await api("POST", "/api/auth/desktop/authorize-code", { ...base, state: "short" }, auth)).status, 400);
  });

  test("code → session → refresh → revoke", async () => {
    const authorized = await api(
      "POST",
      "/api/auth/desktop/authorize-code",
      { redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" },
      auth,
    );
    const redirect = new URL((authorized.body as { redirect: string }).redirect);
    assert.equal(redirect.searchParams.get("state"), state);
    const code = redirect.searchParams.get("code")!;

    assert.equal((await api("POST", "/api/auth/desktop/token", { code })).status, 400);
    assert.equal(
      (await api("POST", "/api/auth/desktop/token", { code, code_verifier: "x".repeat(50), redirect_uri: redirectUri })).status,
      400,
    );

    // A failed verifier still burns the code: request a fresh one.
    const again = await api(
      "POST",
      "/api/auth/desktop/authorize-code",
      { redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" },
      auth,
    );
    const code2 = new URL((again.body as { redirect: string }).redirect).searchParams.get("code")!;
    const session = await api("POST", "/api/auth/desktop/token", { code: code2, code_verifier: verifier, redirect_uri: redirectUri });
    assert.equal(session.status, 200);
    const s = session.body as Json;
    assert.equal((s.user as Json).email, EMAIL);
    assert.equal(typeof s.refreshToken, "string");

    // Codes are single-use.
    assert.equal(
      (await api("POST", "/api/auth/desktop/token", { code: code2, code_verifier: verifier, redirect_uri: redirectUri })).status,
      400,
    );

    const refreshed = await api("POST", "/api/auth/desktop/refresh", { refreshToken: s.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.equal((await api("POST", "/api/auth/desktop/refresh", { refreshToken: s.refreshToken })).status, 401);

    const newRefresh = (refreshed.body as Json).refreshToken;
    assert.deepEqual((await api("POST", "/api/auth/desktop/revoke", { refreshToken: newRefresh })).body, { ok: true });
    assert.equal((await api("POST", "/api/auth/desktop/refresh", { refreshToken: newRefresh })).status, 401);
  });

  test("portal pages", async () => {
    const page = await api("GET", "/desktop/authorize");
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.deepEqual((await api("GET", "/health")).body, { ok: true });
  });
});
