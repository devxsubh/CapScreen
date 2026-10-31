import mongoose from "mongoose";

export const EMAIL_TOKEN_TYPES = {
  VERIFY_EMAIL: "verify_email",
  PASSWORD_RESET: "password_reset",
} as const;

export type EmailTokenType =
  (typeof EMAIL_TOKEN_TYPES)[keyof typeof EMAIL_TOKEN_TYPES];

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: Object.values(EMAIL_TOKEN_TYPES),
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index({ tokenHash: 1, type: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailToken =
  mongoose.models["EmailToken"] ?? mongoose.model("EmailToken", schema);
