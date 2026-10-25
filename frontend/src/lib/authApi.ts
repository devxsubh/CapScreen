import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

const ACCESS_TOKEN_KEY = "vc_screener_access_token";
const TOKEN_EXPIRES_KEY = "vc_screener_token_expires";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  organisation: string | null;
  emailVerified?: boolean;
}

export type SignUpResult =
  | { user: AuthUser; tokens: AuthTokens; emailVerificationRequired?: false }
  | {
      message: string;
      emailVerificationRequired: true;
      user: AuthUser;
    };

export interface AuthTokens {
  accessToken: { token: string; expires: string };
  refreshToken?: { expires: string };
}

function readStoredAccessToken(): {
  accessToken: string | null;
  expiresAt: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, expiresAt: null };
  }
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    expiresAt: localStorage.getItem(TOKEN_EXPIRES_KEY),
  };
}

export function storeAccessToken(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken.token);
  localStorage.setItem(TOKEN_EXPIRES_KEY, tokens.accessToken.expires);
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
}

export function getStoredAccessToken(): string | null {
  return readStoredAccessToken().accessToken;
}

async function authRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let detail = `Auth error: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function signUp(input: {
  email: string;
  password: string;
  displayName?: string;
  organisation?: string;
}): Promise<SignUpResult> {
  const result = await authRequest<SignUpResult>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if ("tokens" in result && result.tokens) {
    storeAccessToken(result.tokens);
  }
  return result;
}

export async function verifyEmail(
  token: string,
): Promise<{ message: string; user: AuthUser }> {
  return authRequest("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendVerificationEmail(email: string): Promise<{ message: string }> {
  return authRequest("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return authRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return authRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const result = await authRequest<{ user: AuthUser; tokens: AuthTokens }>(
    "/auth/signin",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
  storeAccessToken(result.tokens);
  return result;
}

export async function signOut(): Promise<void> {
  const token = getStoredAccessToken();
  clearAuthTokens();
  if (!token) return;
  try {
    await authRequest("/auth/signout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort server signout
  }
}

export async function refreshTokens(): Promise<AuthTokens | null> {
  try {
    const result = await authRequest<{ tokens: AuthTokens }>(
      "/auth/refresh-tokens",
      { method: "POST" },
    );
    storeAccessToken(result.tokens);
    return result.tokens;
  } catch {
    clearAuthTokens();
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    return await authRequest<AuthUser>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    clearAuthTokens();
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, expiresAt } = readStoredAccessToken();
  if (!accessToken) return null;

  const expiresMs = expiresAt ? Date.parse(expiresAt) : 0;
  const refreshThresholdMs = 60 * 1000;
  if (!expiresMs || expiresMs - Date.now() > refreshThresholdMs) {
    return accessToken;
  }

  const refreshed = await refreshTokens();
  return refreshed?.accessToken.token ?? null;
}
