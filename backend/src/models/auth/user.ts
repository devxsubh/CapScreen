import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, default: null, trim: true },
    organisation: { type: String, default: null, trim: true },
    confirmed: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDocument = mongoose.HydratedDocument<
  mongoose.InferSchemaType<typeof schema>
>;

export const User =
  mongoose.models["User"] ?? mongoose.model("User", schema);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function findUserByEmail(email: string) {
  return User.findOne({ email: email.toLowerCase().trim() });
}

export async function findUserByEmailWithPassword(email: string) {
  return User.findOne({ email: email.toLowerCase().trim() }).select(
    "+passwordHash",
  );
}

export async function findUserById(id: string) {
  return User.findById(id);
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
  organisation?: string | null;
  confirmed?: boolean;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("Email already exists");
  }
  return User.create({
    email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName?.trim() || null,
    organisation: input.organisation?.trim() || null,
    confirmed: input.confirmed ?? false,
  });
}

export async function confirmUserEmail(userId: string): Promise<boolean> {
  const user = await User.findByIdAndUpdate(
    userId,
    { confirmed: true },
    { new: true },
  );
  return Boolean(user);
}

export async function updateUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw new Error("User not found");
  user.passwordHash = await hashPassword(password);
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();
}

export function serializePublicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    organisation: user.organisation,
    emailVerified: Boolean(user.confirmed),
  };
}
