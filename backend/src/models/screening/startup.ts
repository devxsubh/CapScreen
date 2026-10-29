import mongoose from "mongoose";
import { screeningResultSchema } from "./schemas/screening";

const schema = new mongoose.Schema(
  {
  name: { type: String, required: true, trim: true },
  ownerId: { type: String, index: true, default: null },
  deletedAt: { type: Date, default: null },
  latestCsvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CapTableCsv",
    default: null,
  },
  lastScreeningResult: { type: screeningResultSchema, default: null },
  lastScreenedAt: { type: Date, default: null },
  lastScreenedCsvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CapTableCsv",
    default: null,
  },
  lastCoInvestorScreeningResult: {
    type: screeningResultSchema,
    default: null,
  },
  lastCoInvestorScreenedAt: { type: Date, default: null },
  lastVendorScreeningResult: {
    type: screeningResultSchema,
    default: null,
  },
  lastVendorScreenedAt: { type: Date, default: null },
  latestCsvByPurpose: { type: mongoose.Schema.Types.Mixed, default: {} },
  portfolioReviewStatus: {
    type: String,
    enum: ["pending", "cleared", "escalated", "blocked"],
    default: "pending",
  },
  portfolioReviewNotes: { type: String, default: null },
  /** Global demo workspace (read-only). Deleting it soft-deletes like any startup. */
  isSample: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

schema.index({ deletedAt: 1 }, { sparse: true });
schema.index({ isSample: 1, name: 1 });

function excludeDeleted(this: mongoose.Query<unknown, unknown>): void {
  if (!("deletedAt" in (this.getFilter() as Record<string, unknown>))) {
    this.where({ deletedAt: null });
  }
}
schema.pre("find", excludeDeleted);
schema.pre("findOne", excludeDeleted);
schema.pre("findOneAndUpdate", excludeDeleted);
schema.pre("countDocuments", excludeDeleted);

export const Startup =
  mongoose.models["Startup"] ?? mongoose.model("Startup", schema);
