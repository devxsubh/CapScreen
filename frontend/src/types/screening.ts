/**
 * Screening domain types. The shared contract lives in the backend
 * (backend/src/types/screening.ts) and is re-exported here — type-only, so
 * nothing from the backend is bundled into the UI.
 */
export type * from "../../../backend/src/types/screening";

import type {
  ColumnMapping,
  CsvKind,
  ParseError,
  ParseSource,
  ParseStatus,
} from "../../../backend/src/types/screening";

/** Mirrors GraphPreview in backend/src/lib/screening/screeningPreview.ts. */
export interface GraphPreview {
  entityCount: number;
  edgeCount: number;
  startupName: string | null;
  ownershipDepth: number;
  hasCircularOwnership: boolean;
  circularOwnershipCount: number;
}

/** Response of POST /api/startups/:id/csvs/analyze (toIngestApiResponse + preview). */
export interface CsvIngestAnalysis {
  csvKind: CsvKind;
  parseSource: ParseSource;
  confidence: number;
  columnMapping: ColumnMapping | null;
  recordCount: number;
  normalizedContent: string | null;
  warnings: string[];
  errors: ParseError[];
  missingRequiredFields: string[];
  canScreen: boolean;
  userMessage: string;
  explanation?: string;
  parseStatus: ParseStatus;
  graphPreview?: GraphPreview | null;
  estimatedScreenSeconds?: number;
}

/** Mirrors backend/src/lib/screening/screeningProgress.ts. */
export type ScreeningStage = "parse" | "graph" | "screen" | "explain" | "exposure";

export interface ScreeningProgressEvent {
  stage: ScreeningStage;
  status: "start" | "done" | "warn";
  detail?: string;
  current?: number;
  total?: number;
}
