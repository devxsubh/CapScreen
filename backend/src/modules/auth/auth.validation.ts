import { asBody, optionalStr, str } from "../../http/body";
import { badRequest } from "../../http/httpError";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const PASSWORD_RULES = [
  {
    test: (p: string) => p.length >= 12,
    message: "Password must be at least 12 characters",
  },
  {
    test: (p: string) => /[a-z]/.test(p),
    message: "Password must include a lowercase letter",
  },
  {
    test: (p: string) => /[A-Z]/.test(p),
    message: "Password must include an uppercase letter",
  },
  {
    test: (p: string) => /[0-9]/.test(p),
    message: "Password must include a number",
  },
  {
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
    message: "Password must include a special character",
  },
] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) {
    return "A valid email address is required";
  }
  if (!EMAIL_RE.test(normalized)) {
    return "A valid email address is required";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) return rule.message;
  }
  return null;
}

// ── Request bodies ───────────────────────────────────────────────────────────
// Each parser returns typed input or throws a 400 with the message the
// portal shows.


export type SignUpInput = {
  email: string;
  password: string;
  displayName: string | null;
  organisation: string | null;
};

export function parseSignUp(raw: unknown): SignUpInput {
  const body = asBody(raw);
  const email = str(body.email);
  const password = str(body.password);
  const emailError = validateEmail(email);
  if (emailError) throw badRequest(emailError);
  const passwordError = validatePassword(password);
  if (passwordError) throw badRequest(passwordError);
  return {
    email: normalizeEmail(email),
    password,
    displayName: optionalStr(body.displayName) ?? optionalStr(body.name),
    organisation: optionalStr(body.organisation),
  };
}

export function parseSignIn(raw: unknown): { email: string; password: string } {
  const body = asBody(raw);
  const email = str(body.email);
  const password = str(body.password);
  if (validateEmail(email) || !password) {
    throw badRequest("Email and password are required");
  }
  return { email: normalizeEmail(email), password };
}

export function parseEmail(raw: unknown): string {
  const email = str(asBody(raw).email);
  const emailError = validateEmail(email);
  if (emailError) throw badRequest(emailError);
  return normalizeEmail(email);
}

export function parseEmailLinkToken(raw: unknown): string {
  const token = str(asBody(raw).token).trim();
  if (!token) throw badRequest("token is required");
  return token;
}

export function parseResetPassword(raw: unknown): { token: string; password: string } {
  const token = parseEmailLinkToken(raw);
  const password = str(asBody(raw).password);
  const passwordError = validatePassword(password);
  if (passwordError) throw badRequest(passwordError);
  return { token, password };
}
