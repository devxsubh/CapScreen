import mongoose from "mongoose";

export type TabularReviewKind =
  | "standard"
  | "portfolio_monitoring"
  | "entity_screening";

const rowSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const schema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userEmail: { type: String, required: true },
  title: { type: String, default: null },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Startup",
    default: null,
    index: true,
  },
  workflowId: { type: String, default: null },
  reviewKind: {
    type: String,
    enum: ["standard", "portfolio_monitoring", "entity_screening"],
    default: "standard",
    index: true,
  },
  columnsConfig: { type: mongoose.Schema.Types.Mixed, default: [] },
  rowIds: { type: [String], default: [] },
  rows: { type: [rowSchema], default: [] },
  isSample: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

schema.index({ userId: 1, reviewKind: 1 });

export const TabularReview =
  mongoose.models["TabularReview"] ??
  mongoose.model("TabularReview", schema);
