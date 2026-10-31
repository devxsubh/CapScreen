import mongoose from "mongoose";

/**
 * One-time authorization codes for the desktop sign-in flow (RFC 8252 + PKCE).
 * Stored hashed; valid for 2 minutes; single use.
 */
const schema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  codeChallenge: { type: String, required: true },
  redirectUri: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DesktopAuthCode =
  mongoose.models["DesktopAuthCode"] ?? mongoose.model("DesktopAuthCode", schema);
