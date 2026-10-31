import crypto from "crypto";
import type { Types } from "mongoose";
import {
  AuthToken,
  DesktopAuthCode,
  EmailToken,
  TOKEN_TYPES,
  type EmailTokenType,
} from "../../models";

/**
 * Data access for every one-time or bearer secret the auth service issues:
 * refresh tokens, email links and desktop authorization codes. Only SHA-256
 * hashes are stored; callers pass and receive the raw values.
 */

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// ── Refresh tokens ───────────────────────────────────────────────────────────

export async function saveRefreshToken(userId: Types.ObjectId, token: string, expiresAt: Date): Promise<void> {
  await AuthToken.create({
    userId,
    tokenHash: sha256(token),
    type: TOKEN_TYPES.REFRESH,
    expiresAt,
  });
}

/** The stored token's owner, or null when it is unknown, revoked or expired. */
export async function findRefreshTokenOwner(token: string): Promise<Types.ObjectId | null> {
  const doc = await AuthToken.findOne({
    tokenHash: sha256(token),
    type: TOKEN_TYPES.REFRESH,
    blacklisted: false,
  });
  if (!doc || doc.expiresAt.getTime() < Date.now()) return null;
  return doc.userId as Types.ObjectId;
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await AuthToken.deleteOne({ tokenHash: sha256(token), type: TOKEN_TYPES.REFRESH });
}

// ── Email links (verify address, reset password) ─────────────────────────────

/** Stores a new link token, replacing any earlier one of the same type. */
export async function replaceEmailToken(
  userId: Types.ObjectId,
  type: EmailTokenType,
  token: string,
  expiresAt: Date,
): Promise<void> {
  await EmailToken.deleteMany({ userId, type });
  await EmailToken.create({ userId, tokenHash: sha256(token), type, expiresAt });
}

/** Uses up a link token. Returns its user, or null when unknown or expired. */
export async function consumeEmailToken(token: string, type: EmailTokenType): Promise<Types.ObjectId | null> {
  const doc = await EmailToken.findOne({ tokenHash: sha256(token), type });
  if (!doc) return null;
  if (doc.expiresAt.getTime() < Date.now()) {
    await doc.deleteOne();
    return null;
  }
  const userId = doc.userId as Types.ObjectId;
  await EmailToken.deleteMany({ userId, type });
  return userId;
}

// ── Desktop authorization codes ──────────────────────────────────────────────

export type DesktopCodeRecord = {
  userId: Types.ObjectId;
  codeChallenge: string;
  redirectUri: string;
};

export async function saveDesktopCode(code: string, record: DesktopCodeRecord & { expiresAt: Date }): Promise<void> {
  await DesktopAuthCode.create({ codeHash: sha256(code), ...record });
}

/** Atomically marks an unexpired code as used, so it can only be redeemed once. */
export async function claimDesktopCode(code: string): Promise<DesktopCodeRecord | null> {
  return (await DesktopAuthCode.findOneAndUpdate(
    { codeHash: sha256(code), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: false },
  ).lean()) as DesktopCodeRecord | null;
}
