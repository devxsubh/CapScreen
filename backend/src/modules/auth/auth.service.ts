import crypto from "crypto";
import type { Types } from "mongoose";
import { HttpError, conflict, badRequest, notFound, unauthorized } from "../../http/httpError";
import { EMAIL_TOKEN_TYPES, type EmailTokenType, type UserDocument } from "../../models";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import {
  emailConfigured,
  PASSWORD_RESET_EXPIRY_HOURS,
  VERIFY_EMAIL_EXPIRY_HOURS,
} from "./emailConfig";
import { hashPassword, verifyPassword } from "./password";
import { issueSession, type Session } from "./session";
import * as tokens from "./token.repository";
import * as users from "./user.repository";
import type { SignUpInput } from "./auth.validation";

/** Account rules for the cloud auth service: sign-up, sign-in, sessions, email links. */

export const INVALID_REFRESH_DETAIL = "Invalid or expired refresh token";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export type SignUpResult =
  | { user: UserDocument; verificationRequired: true }
  | { user: UserDocument; verificationRequired: false; session: Session };

/**
 * With an email provider configured, new accounts must verify their address
 * before signing in; without one (dev) they are confirmed straight away.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  if (await users.findByEmail(input.email)) {
    throw conflict("Email already exists");
  }
  const verificationRequired = emailConfigured();
  const user = await users.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName?.trim() || null,
    organisation: input.organisation?.trim() || null,
    confirmed: !verificationRequired,
  });

  if (verificationRequired) {
    await sendVerificationLink(user);
    return { user, verificationRequired };
  }
  return { user, verificationRequired, session: await issueSession(user) };
}

/** Five wrong passwords lock the account for 15 minutes. */
export async function signIn(email: string, password: string): Promise<{ user: UserDocument; session: Session }> {
  const user = await users.findByEmailWithPassword(email);
  if (!user) throw unauthorized("Incorrect email or password");

  if (!user.confirmed && emailConfigured()) {
    throw new HttpError(403, "Email not verified. Check your inbox or request a new verification link.", {
      emailVerificationRequired: true,
    });
  }

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    throw new HttpError(423, lockoutMessage(user.lockUntil));
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await users.saveLoginAttempts(user, 0, new Date(Date.now() + LOCKOUT_DURATION_MS));
    } else {
      await users.saveLoginAttempts(user, attempts, user.lockUntil ?? null);
    }
    throw unauthorized("Incorrect email or password");
  }

  if (user.failedLoginAttempts || user.lockUntil) {
    await users.saveLoginAttempts(user, 0, null);
  }
  return { user, session: await issueSession(user) };
}

function lockoutMessage(lockUntil: Date): string {
  const minutesLeft = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60_000));
  return `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;
}

/** Rotates a refresh token: the old one is deleted whether or not a new session is issued. */
export async function refreshSession(refreshToken: string): Promise<Session> {
  const userId = await tokens.findRefreshTokenOwner(refreshToken);
  if (!userId) throw unauthorized(INVALID_REFRESH_DETAIL);

  const user = await users.findById(userId);
  await tokens.deleteRefreshToken(refreshToken);
  if (!user) throw unauthorized(INVALID_REFRESH_DETAIL);

  try {
    return await issueSession(user);
  } catch {
    throw new HttpError(500, "Failed to refresh session");
  }
}

/** Revokes the caller's own refresh token. */
export async function signOut(userId: string, refreshToken: string): Promise<void> {
  const owner = await tokens.findRefreshTokenOwner(refreshToken);
  if (!owner || owner.toString() !== userId) {
    throw unauthorized(INVALID_REFRESH_DETAIL);
  }
  await tokens.deleteRefreshToken(refreshToken);
}

export async function getProfile(userId: string): Promise<UserDocument> {
  const user = await users.findById(userId);
  if (!user) throw unauthorized("Invalid or expired token");
  return user;
}

// ── Email links ──────────────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<UserDocument> {
  const userId = await tokens.consumeEmailToken(token, EMAIL_TOKEN_TYPES.VERIFY_EMAIL);
  if (!userId) throw badRequest("Invalid or expired verification link");
  const user = await users.markEmailConfirmed(userId);
  if (!user) throw notFound("User not found");
  return user;
}

/** Silent when the address is unknown or already verified, so it can't be used to probe accounts. */
export async function resendVerification(email: string): Promise<void> {
  const user = await users.findByEmail(email);
  if (!user || user.confirmed) return;
  try {
    await sendVerificationLink(user);
  } catch {
    throw new HttpError(500, "Failed to send verification email");
  }
}

/** Silent when the address is unknown, so it can't be used to probe accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await users.findByEmail(email);
  if (!user) return;
  try {
    const token = await issueEmailLink(user._id, EMAIL_TOKEN_TYPES.PASSWORD_RESET);
    await sendPasswordResetEmail(user.email, token);
  } catch {
    throw new HttpError(500, "Failed to send password reset email");
  }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const userId = await tokens.consumeEmailToken(token, EMAIL_TOKEN_TYPES.PASSWORD_RESET);
  if (!userId) throw badRequest("Invalid or expired reset link");
  const updated = await users.updatePasswordHash(userId, await hashPassword(password)).catch(() => false);
  if (!updated) throw new HttpError(500, "Failed to update password");
}

async function sendVerificationLink(user: UserDocument): Promise<void> {
  const token = await issueEmailLink(user._id, EMAIL_TOKEN_TYPES.VERIFY_EMAIL);
  await sendVerificationEmail(user.email, token);
}

async function issueEmailLink(userId: Types.ObjectId, type: EmailTokenType): Promise<string> {
  const hours = type === EMAIL_TOKEN_TYPES.VERIFY_EMAIL ? VERIFY_EMAIL_EXPIRY_HOURS : PASSWORD_RESET_EXPIRY_HOURS;
  const token = crypto.randomBytes(32).toString("hex");
  await tokens.replaceEmailToken(userId, type, token, new Date(Date.now() + hours * 60 * 60 * 1000));
  return token;
}
