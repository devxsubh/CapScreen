/** Shared domain types for cap-table parsing and sanctions screening. */

export type EntityType = "person" | "company";
export type RiskLevel = "clear" | "review" | "flagged";
export type ParseStatus = "pending" | "valid" | "invalid" | "needs_review";
export type CsvKind =
  | "ownership_cap_table"
  | "entity_roster"
  | "reference_metadata"
  | "unknown";
export type ParseSource = "strict" | "heuristic" | "ai";
export type ScreeningMode = "ownership_graph" | "entity_roster";
export type OwnershipRuleFlag = "ofac_50" | "ubo_25";

export interface OwnershipPathStep {
  name: string;
  edgePct: number | null;
}
export type RosterPurpose =
  | "cap_table"
  | "co_investor"
  | "vendor"
  | "entity_roster";

export interface OwnershipRecord {
  entity: string;
  entityType: EntityType;
  owner: string;
  ownerType: EntityType;
  ownershipPct: number;
}

export interface ParseError {
  row: number;
  field?: string;
  message: string;
}

export interface ParseResult {
  records: OwnershipRecord[];
  errors: ParseError[];
}

export type WatchmanHitSource = "sdn" | "altName" | "v2";

export interface WatchmanAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface WatchmanScorePiece {
  pieceType: string;
  score: number;
  weight: number;
  matched: boolean;
  required?: boolean;
  exact?: boolean;
  fieldsCompared?: number;
}

/** One Watchman hit — preserves raw API fields for auditor review. */
export interface WatchmanMatch {
  /** Display name: SDN primary name or alias name. */
  sdnName: string;
  sdnType: string;
  match: number;
  programs: string[];
  remarks?: string;
  /** Whether this hit came from the SDNs or altNames array in the Watchman response. */
  hitSource: WatchmanHitSource;
  entityID?: string;
  matchedName?: string;
  title?: string;
  /** Present when hitSource is "altName". */
  alternateID?: string;
  alternateType?: string;
  alternateName?: string;
  alternateRemarks?: string;
  callSign?: string;
  vesselType?: string;
  tonnage?: string;
  grossRegisteredTonnage?: string;
  vesselFlag?: string;
  vesselOwner?: string;
  /** v2 generalized entity fields */
  sourceList?: string;
  sourceID?: string;
  entityType?: string;
  secondarySanctions?: boolean;
  addresses?: WatchmanAddress[];
  affiliations?: string[];
  cryptoAddresses?: string[];
  matchDetails?: WatchmanScorePiece[];
}

/** Sanctions list metadata from GET /v2/listinfo. */
export interface WatchmanListInfo {
  lists: Record<string, number>;
  listHashes?: Record<string, string>;
  startedAt?: string;
  endedAt?: string;
  version?: string;
  fetchedAt: string;
}

/** Optional CSV-derived fields sent to Watchman for tighter matching. */
export interface EntityScreeningQuery {
  altNames?: string[];
  birthDate?: string;
  address?: string;
  country?: string;
  registrationId?: string;
  requestId?: string;
}

export interface EntityResult {
  name: string;
  type: EntityType;
  riskLevel: RiskLevel;
  topScore: number | null;
  matches: WatchmanMatch[];
  ownershipPath: string[];
  /** Effective economic stake in the portfolio company (0–100), aggregated across paths. */
  indirectOwnershipPct?: number | null;
  ownershipPathSteps?: OwnershipPathStep[];
  ownershipRuleFlags?: OwnershipRuleFlag[];
  /** Pre-computed VC-native exposure line for reviewers. */
  exposureStatement?: string;
  /** Optional role for roster entities (founder, board, LP, etc.). */
  role?: string;
  /** Person/entity at the top of the ownership chain with no further owner. */
  isUltimateOwner?: boolean;
  ultimateOwner?: string;
  explanation?: string;
  /** Fields actually sent to Watchman for this entity (audit trail). */
  screeningQuery?: EntityScreeningQuery;
}

export interface OwnershipEdge {
  from: string;
  to: string;
  pct: number;
}

export interface ColumnMapping {
  entity?: string;
  entity_type?: string;
  owner?: string;
  owner_type?: string;
  ownership_pct?: string;
  name?: string;
  type?: string;
  role?: string;
  /** Optional columns for richer Watchman queries */
  alt_name?: string;
  birth_date?: string;
  address?: string;
  country?: string;
  registration_id?: string;
}

export interface RosterEntity {
  name: string;
  type: EntityType;
  role?: string;
}

export interface CsvIngestResult {
  csvKind: CsvKind;
  parseSource: ParseSource;
  confidence: number;
  columnMapping: ColumnMapping | null;
  records: OwnershipRecord[];
  rosterEntities: RosterEntity[];
  normalizedContent: string | null;
  warnings: string[];
  errors: ParseError[];
  missingRequiredFields: string[];
  canScreen: boolean;
  userMessage: string;
  explanation?: string;
}

export interface ScreeningResult {
  totalEntities: number;
  flaggedCount: number;
  reviewCount: number;
  clearCount: number;
  entities: EntityResult[];
  edges: OwnershipEdge[];
  /** Portfolio company node name (ownership-graph mode). */
  startupName?: string;
  /** Highest indirect sanctioned stake in the portfolio company (%). */
  maxSanctionedExposurePct?: number | null;
  /** One-line portfolio exposure summary for dashboards. */
  sanctionedExposureSummary?: string;
  /** ISO timestamp set when the screen completes. */
  screenedAt?: string;
  /** CapTableCsv document used for this run. */
  csvId?: string;
  screeningMode?: ScreeningMode;
  csvKind?: CsvKind;
  /** False when Watchman was unreachable — results must not be treated as cleared. */
  dataSourceAvailable?: boolean;
  /** 0–100 deterministic aggregate score — computed in code, not by the LLM. */
  screeningConfidence?: number;
  /** Loaded sanctions lists at screen time (GET /v2/listinfo). */
  watchmanListInfo?: WatchmanListInfo;
  /** Max hits requested per entity from Watchman. */
  watchmanSearchLimit?: number;
  /** Thresholds this result was classified with ("settings" = user-tuned in Settings → Screening). */
  screeningThresholds?: {
    watchmanMinMatch: number;
    reviewMinScore: number;
    flaggedMinScore: number;
    beneficialOwnerPct: number;
    ofacOwnershipRulePct: number;
    watchmanResultLimit: number;
    source: "settings" | "default";
  };
}

export interface ScreeningSummary {
  startupId: string;
  startupName: string;
  lastScreenedAt: string | null;
  totalEntities: number;
  flaggedCount: number;
  reviewCount: number;
  highestRiskEntity: string | null;
  highestRiskLevel: RiskLevel | null;
}
