import mongoose from "mongoose";

export const watchmanMatchSchema = new mongoose.Schema(
  {
    sdnName: { type: String, required: true },
    sdnType: { type: String, required: true },
    match: { type: Number, required: true },
    programs: { type: [String], default: [] },
    remarks: { type: String, default: null },
    hitSource: { type: String, enum: ["sdn", "altName"], default: "sdn" },
    entityID: { type: String, default: null },
    matchedName: { type: String, default: null },
    title: { type: String, default: null },
    alternateID: { type: String, default: null },
    alternateType: { type: String, default: null },
    alternateName: { type: String, default: null },
    alternateRemarks: { type: String, default: null },
    callSign: { type: String, default: null },
    vesselType: { type: String, default: null },
    tonnage: { type: String, default: null },
    grossRegisteredTonnage: { type: String, default: null },
    vesselFlag: { type: String, default: null },
    vesselOwner: { type: String, default: null },
  },
  { _id: false },
);

const ownershipPathStepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    edgePct: { type: Number, default: null },
  },
  { _id: false },
);

export const entityResultSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["person", "company"], required: true },
    riskLevel: {
      type: String,
      enum: ["clear", "review", "flagged"],
      required: true,
    },
    topScore: { type: Number, default: null },
    matches: { type: [watchmanMatchSchema], default: [] },
    ownershipPath: { type: [String], default: [] },
    indirectOwnershipPct: { type: Number, default: null },
    ownershipPathSteps: { type: [ownershipPathStepSchema], default: [] },
    ownershipRuleFlags: { type: [String], default: [] },
    exposureStatement: { type: String, default: null },
    role: { type: String, default: null },
    isUltimateOwner: { type: Boolean, default: false },
    ultimateOwner: { type: String, default: null },
    explanation: { type: String, default: null },
  },
  { _id: false },
);

export const ownershipEdgeSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    pct: { type: Number, required: true },
  },
  { _id: false },
);

export const screeningResultSchema = new mongoose.Schema(
  {
    totalEntities: { type: Number, required: true },
    flaggedCount: { type: Number, required: true },
    reviewCount: { type: Number, required: true },
    clearCount: { type: Number, required: true },
    entities: { type: [entityResultSchema], default: [] },
    edges: { type: [ownershipEdgeSchema], default: [] },
    startupName: { type: String, default: null },
    maxSanctionedExposurePct: { type: Number, default: null },
    sanctionedExposureSummary: { type: String, default: null },
    screenedAt: { type: String, default: null },
    csvId: { type: String, default: null },
    screeningMode: {
      type: String,
      enum: ["ownership_graph", "entity_roster"],
      default: null,
    },
    csvKind: { type: String, default: null },
    // Which sanctions-list versions this result was checked against (counts,
    // SHA-256 per list, load time) — audit evidence for "as of" screening.
    watchmanListInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    // Match-score and ownership thresholds this result was classified with.
    screeningThresholds: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

export const parseErrorSchema = new mongoose.Schema(
  {
    row: { type: Number, required: true },
    field: { type: String, default: null },
    message: { type: String, required: true },
  },
  { _id: false },
);

export const ownershipRecordSchema = new mongoose.Schema(
  {
    entity: { type: String, required: true },
    entityType: { type: String, enum: ["person", "company"], required: true },
    owner: { type: String, required: true },
    ownerType: { type: String, enum: ["person", "company"], required: true },
    ownershipPct: { type: Number, required: true },
  },
  { _id: false },
);
