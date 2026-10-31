import mongoose from "mongoose";

export const TOKEN_TYPES = {
  REFRESH: "refresh",
} as const;

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
      enum: [TOKEN_TYPES.REFRESH],
      required: true,
    },
    blacklisted: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index({ tokenHash: 1, type: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthToken =
  mongoose.models["AuthToken"] ?? mongoose.model("AuthToken", schema);
