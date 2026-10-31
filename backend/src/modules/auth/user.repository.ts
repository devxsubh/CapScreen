import type { Types } from "mongoose";
import { User, type UserDocument } from "../../models";

/** Data access for accounts. Emails are stored lowercased and trimmed. */

const normalize = (email: string) => email.toLowerCase().trim();

export async function findByEmail(email: string): Promise<UserDocument | null> {
  return User.findOne({ email: normalize(email) });
}

/** Same as findByEmail, plus the password hash (excluded by default). */
export async function findByEmailWithPassword(email: string): Promise<UserDocument | null> {
  return User.findOne({ email: normalize(email) }).select("+passwordHash");
}

export async function findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
  return User.findById(id);
}

export async function create(input: {
  email: string;
  passwordHash: string;
  displayName: string | null;
  organisation: string | null;
  confirmed: boolean;
}): Promise<UserDocument> {
  return User.create({ ...input, email: normalize(input.email) });
}

export async function markEmailConfirmed(id: Types.ObjectId): Promise<UserDocument | null> {
  return User.findByIdAndUpdate(id, { confirmed: true }, { new: true });
}

/** Sets a new password and lifts any login lockout. False when the user is gone. */
export async function updatePasswordHash(id: Types.ObjectId, passwordHash: string): Promise<boolean> {
  const user = await User.findById(id).select("+passwordHash");
  if (!user) return false;
  user.passwordHash = passwordHash;
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();
  return true;
}

export async function saveLoginAttempts(
  user: UserDocument,
  failedLoginAttempts: number,
  lockUntil: Date | null,
): Promise<void> {
  user.failedLoginAttempts = failedLoginAttempts;
  user.lockUntil = lockUntil;
  await user.save();
}
