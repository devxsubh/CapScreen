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

type UserFields = mongoose.InferSchemaType<typeof schema>;

export type UserDocument = mongoose.HydratedDocument<UserFields>;

export const User: mongoose.Model<UserFields> =
  mongoose.models["User"] ?? mongoose.model("User", schema);
