import mongoose from "mongoose";

function auditRetentionSeconds(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : 1825;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 1825;
  return safeDays * 86_400;
}

export type AuditEventType =
  | "screening_completed"
  | "csv_uploaded"
  | "csv_updated"
  | "entity_reviewed"
  | "portfolio_reviewed"
  | "ic_memo_generated"
  | "screening_analysis_generated"
  | "document_generated"
  | "document_uploaded"
  | "document_deleted"
  | "agent_tool_approval";

const schema = new mongoose.Schema({
  startupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Startup",
    index: true,
    default: null,
  },
  eventType: {
    type: String,
    enum: [
      "screening_completed",
      "csv_uploaded",
      "csv_updated",
      "entity_reviewed",
      "portfolio_reviewed",
      "ic_memo_generated",
      "screening_analysis_generated",
      "document_generated",
      "document_uploaded",
      "document_deleted",
      "agent_tool_approval",
    ],
    required: true,
  },
  performedBy: { type: String, required: true },
  performedByEmail: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

schema.index({ createdAt: 1 }, { expireAfterSeconds: auditRetentionSeconds() });

export const AuditLog =
  mongoose.models["AuditLog"] ?? mongoose.model("AuditLog", schema);
