import { ingestCsv } from "./csvIngest";
import { buildEntityHintsMap } from "./entityHints";
import {
  buildOwnershipGraph,
  computeEffectiveStakeInStartup,
  findOwnershipPath,
  getAllNodes,
  getEdges,
  getStartupNode,
  isUltimateOwner,
  resolveUltimateOwners,
} from "./graph";
import {
  assertWatchmanAvailable,
  entityScreeningQueryFromHints,
  fetchWatchmanListInfo,
  getWatchmanBaseUrl,
  searchWatchman,
  type WatchmanSearchOptions,
} from "./watchman";
import { classifyScore } from "./classify";
import { explainMatch } from "./explain";
import {
  buildPortfolioExposureSummary,
  computeMaxSanctionedExposure,
  enrichEntityWithOwnershipExposure,
} from "./ownershipExposure";
import { scoreScreeningConfidence } from "./screeningConfidence";
import {
  progressStage,
  type ScreeningProgressFn,
} from "./screeningProgress";
import { screeningLog } from "./screeningLog";
import { getScreeningThresholds, screeningThresholdsSnapshot } from "./screeningConfig";
import { wrapEntityName } from "../shared/promptDelimiters";
import type {
  CsvIngestResult,
  EntityResult,
  EntityScreeningQuery,
  OwnershipEdge,
  RosterEntity,
  ScreeningResult,
  WatchmanListInfo,
} from "../../types/screening";

export type {
  EntityResult,
  OwnershipEdge,
  ScreeningResult,
  WatchmanMatch,
} from "../../types/screening";

export interface RunScreeningOptions {
  csvId?: string;
  filename?: string;
  onProgress?: ScreeningProgressFn;
  /** Skip parallel Claude narratives — fetch per entity on demand instead. */
  skipNarratives?: boolean;
}

interface ScreenEntityContext {
  hintsMap?: Map<string, EntityScreeningQuery>;
  screeningRunId?: string;
  watchmanListInfo?: WatchmanListInfo | null;
}

function slugRequestPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function watchmanOptionsForNode(
  node: { name: string; type: "person" | "company" },
  ctx: ScreenEntityContext,
): WatchmanSearchOptions {
  const hints = ctx.hintsMap?.get(node.name);
  const requestId = ctx.screeningRunId
    ? `${ctx.screeningRunId}:${slugRequestPart(node.name)}`
    : undefined;
  const thresholds = getScreeningThresholds();
  return {
    altNames: hints?.altNames,
    birthDate: hints?.birthDate,
    address: hints?.address,
    country: hints?.country,
    registrationId: hints?.registrationId,
    requestId,
    limit: thresholds.watchmanResultLimit,
    debug: thresholds.watchmanDebug,
  };
}

async function screenEntityNodes(
  nodes: { name: string; type: "person" | "company"; role?: string }[],
  graphContext: {
    graph: ReturnType<typeof buildOwnershipGraph> | null;
    startup: string | null;
    edges: OwnershipEdge[];
  },
  screenCtx: ScreenEntityContext = {},
  onProgress?: ScreeningProgressFn,
  skipNarratives = false,
): Promise<EntityResult[]> {
  const { graph, startup, edges } = graphContext;
  const total = nodes.length;

  progressStage(onProgress, "screen", "start", undefined, {
    current: 0,
    total,
  });

  // Run all Watchman searches in parallel — major speedup for large cap tables
  let screenedCount = 0;
  const watchmanSettled = await Promise.allSettled(
    nodes.map(async (node) => {
      const searchOptions = watchmanOptionsForNode(node, screenCtx);
      const matches = await searchWatchman(node.name, node.type, searchOptions);
      const hints = screenCtx.hintsMap?.get(node.name);
      const screeningQuery = entityScreeningQueryFromHints(
        hints,
        searchOptions.requestId,
      );
      screenedCount += 1;
      progressStage(onProgress, "screen", "start", node.name, {
        current: screenedCount,
        total,
      });
      return { node, matches, screeningQuery };
    }),
  );

  progressStage(onProgress, "screen", "done", `${total} entities screened`);

  const rawResults = watchmanSettled.map((r, i) => {
    const node = nodes[i];
    const matches = r.status === "fulfilled" ? r.value.matches : [];
    const screeningQuery =
      r.status === "fulfilled" ? r.value.screeningQuery : undefined;
    const topScore =
      matches.length > 0 ? Math.max(...matches.map((m) => m.match)) : null;
    const riskLevel = classifyScore(topScore);
    const ownershipPath =
      graph && startup ? findOwnershipPath(graph, startup, node.name) : [];
    const ultimateOwners = graph ? resolveUltimateOwners(graph, node.name) : [];
    return {
      node,
      matches,
      screeningQuery,
      topScore,
      riskLevel,
      ownershipPath,
      ultimateOwners,
    };
  });

  const needsExplain = rawResults.filter((r) => r.riskLevel !== "clear");
  const explanationMap = new Map<string, string>();

  if (skipNarratives) {
    progressStage(onProgress, "explain", "done", "Deferred — open an entity for details");
  } else {
    progressStage(onProgress, "explain", "start", undefined, {
      current: 0,
      total: needsExplain.length,
    });

    // Run all Claude narrative calls in parallel
    let explainCount = 0;
    const explainSettled = await Promise.allSettled(
      needsExplain.map(async ({ node, matches, ownershipPath, riskLevel }) => {
        const indirectOwnershipPct =
          graph && startup
            ? computeEffectiveStakeInStartup(graph, startup, node.name)
            : null;
        const explanation = await explainMatch(node, matches, ownershipPath, riskLevel, {
          startupName: startup ?? undefined,
          role: node.role,
          indirectOwnershipPct,
        });
        explainCount += 1;
        progressStage(onProgress, "explain", "start", node.name, {
          current: explainCount,
          total: needsExplain.length,
        });
        return { name: node.name, explanation };
      }),
    );

    for (const r of explainSettled) {
      if (r.status === "fulfilled") {
        explanationMap.set(r.value.name, r.value.explanation);
      }
    }

    if (needsExplain.length > 0) {
      progressStage(
        onProgress,
        "explain",
        "done",
        `${needsExplain.length} narratives written`,
      );
    } else {
      progressStage(onProgress, "explain", "done", "No narratives needed");
    }
  }

  const entityResults: EntityResult[] = rawResults.map(
    ({
      node,
      matches,
      screeningQuery,
      topScore,
      riskLevel,
      ownershipPath,
      ultimateOwners,
    }) => {
      const ubo = graph ? isUltimateOwner(graph, node.name) : false;
      return {
        name: node.name,
        type: node.type,
        role: node.role,
        riskLevel,
        topScore,
        matches,
        ownershipPath,
        isUltimateOwner: ubo,
        ultimateOwner: ubo ? node.name : ultimateOwners.join(", "),
        explanation: explanationMap.get(node.name),
        screeningQuery,
      };
    },
  );

  progressStage(onProgress, "exposure", "start");
  const sanctionedNames = new Set(
    entityResults.filter((e) => e.riskLevel !== "clear").map((e) => e.name),
  );
  const blockedCache = new Map<string, boolean>();

  const enriched = entityResults.map((entity) =>
    enrichEntityWithOwnershipExposure(
      entity,
      graph,
      startup,
      sanctionedNames,
      blockedCache,
    ),
  );

  progressStage(onProgress, "exposure", "done");

  const order: Record<string, number> = { flagged: 0, review: 1, clear: 2 };
  enriched.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);

  void edges;
  return enriched;
}

function attachConfidence(result: Omit<ScreeningResult, "screeningConfidence">): ScreeningResult {
  const coverage = scoreScreeningConfidence(result.entities);
  return { ...result, screeningConfidence: coverage.confidence };
}

async function runRosterScreening(
  entities: RosterEntity[],
  ingest: CsvIngestResult,
  options: RunScreeningOptions,
  screenCtx: ScreenEntityContext,
): Promise<ScreeningResult> {
  screeningLog("Starting entity-roster screen", {
    entities: entities.length,
    watchmanUrl: getWatchmanBaseUrl(),
    dataSource: "watchman-docker (deterministic matching)",
    aiRole: "Claude narrates flagged/review entities only — does not decide matches",
  });

  const entityResults = await screenEntityNodes(
    entities,
    { graph: null, startup: null, edges: [] },
    screenCtx,
    options.onProgress,
    options.skipNarratives ?? false,
  );

  const withWatchmanHits = entityResults.filter((e) => e.matches.length > 0);
  screeningLog("Roster screen complete", {
    total: entityResults.length,
    flagged: entityResults.filter((e) => e.riskLevel === "flagged").length,
    review: entityResults.filter((e) => e.riskLevel === "review").length,
    clear: entityResults.filter((e) => e.riskLevel === "clear").length,
    watchmanHits: withWatchmanHits.length,
  });

  const flaggedCount = entityResults.filter((e) => e.riskLevel === "flagged").length;
  const reviewCount = entityResults.filter((e) => e.riskLevel === "review").length;

  return attachConfidence({
    totalEntities: entityResults.length,
    flaggedCount,
    reviewCount,
    clearCount: entityResults.filter((e) => e.riskLevel === "clear").length,
    entities: entityResults,
    edges: [],
    maxSanctionedExposurePct: computeMaxSanctionedExposure(entityResults),
    screenedAt: new Date().toISOString(),
    csvId: options.csvId,
    screeningMode: "entity_roster",
    csvKind: ingest.csvKind,
    dataSourceAvailable: true,
    watchmanListInfo: screenCtx.watchmanListInfo ?? undefined,
    watchmanSearchLimit: getScreeningThresholds().watchmanResultLimit,
    screeningThresholds: screeningThresholdsSnapshot(),
  });
}

async function runOwnershipScreening(
  ingest: CsvIngestResult,
  options: RunScreeningOptions,
  screenCtx: ScreenEntityContext,
): Promise<ScreeningResult> {
  const records = ingest.records;

  progressStage(options.onProgress, "graph", "start");
  const graph = buildOwnershipGraph(records);
  const nodes = getAllNodes(graph);
  const edges = getEdges(graph);
  const startup = getStartupNode(graph);
  progressStage(options.onProgress, "graph", "done", `${nodes.length} entities`);

  screeningLog("Starting cap-table screen", {
    entities: nodes.length,
    startup: startup ?? "unknown",
    watchmanUrl: getWatchmanBaseUrl(),
    dataSource: "watchman-docker (deterministic matching)",
    aiRole: "Claude narrates flagged/review entities only — does not decide matches",
  });

  const entityResults = await screenEntityNodes(
    nodes,
    { graph, startup, edges },
    screenCtx,
    options.onProgress,
    options.skipNarratives ?? false,
  );

  const withWatchmanHits = entityResults.filter((e) => e.matches.length > 0);
  screeningLog("Screen complete", {
    total: entityResults.length,
    flagged: entityResults.filter((e) => e.riskLevel === "flagged").length,
    review: entityResults.filter((e) => e.riskLevel === "review").length,
    clear: entityResults.filter((e) => e.riskLevel === "clear").length,
    watchmanHits: withWatchmanHits.length,
    watchmanEntities: withWatchmanHits.map((e) => ({
      name: e.name,
      risk: e.riskLevel,
      matched: e.matches[0]?.sdnName,
      score: e.topScore !== null ? `${(e.topScore * 100).toFixed(0)}%` : null,
    })),
    aiNarratives: entityResults.filter((e) => e.explanation).length,
  });

  const flaggedCount = entityResults.filter((e) => e.riskLevel === "flagged").length;
  const reviewCount = entityResults.filter((e) => e.riskLevel === "review").length;

  return attachConfidence({
    totalEntities: nodes.length,
    flaggedCount,
    reviewCount,
    clearCount: entityResults.filter((e) => e.riskLevel === "clear").length,
    entities: entityResults,
    edges,
    startupName: startup ?? undefined,
    maxSanctionedExposurePct: computeMaxSanctionedExposure(entityResults),
    sanctionedExposureSummary: startup
      ? buildPortfolioExposureSummary(startup, entityResults)
      : undefined,
    screenedAt: new Date().toISOString(),
    csvId: options.csvId,
    screeningMode: "ownership_graph",
    csvKind: ingest.csvKind,
    dataSourceAvailable: true,
    watchmanListInfo: screenCtx.watchmanListInfo ?? undefined,
    watchmanSearchLimit: getScreeningThresholds().watchmanResultLimit,
    screeningThresholds: screeningThresholdsSnapshot(),
  });
}

export async function runScreening(
  csv: string,
  options: RunScreeningOptions = {},
): Promise<ScreeningResult> {
  await assertWatchmanAvailable();

  const [watchmanListInfo] = await Promise.all([fetchWatchmanListInfo()]);
  const screeningRunId = `scr-${Date.now().toString(36)}`;

  progressStage(options.onProgress, "parse", "start");
  const ingest = await ingestCsv(csv, options.filename);
  const hintsMap = buildEntityHintsMap(csv, ingest.columnMapping);

  const screenCtx: ScreenEntityContext = {
    hintsMap,
    screeningRunId,
    watchmanListInfo,
  };

  if (!ingest.canScreen) {
    progressStage(options.onProgress, "parse", "warn", ingest.userMessage);
    throw new Error(
      ingest.userMessage ||
        ingest.explanation ||
        "CSV cannot be screened — fix missing fields and try again.",
    );
  }

  const recordCount =
    ingest.csvKind === "entity_roster"
      ? ingest.rosterEntities.length
      : ingest.records.length;
  progressStage(
    options.onProgress,
    "parse",
    "done",
    `${recordCount} records`,
  );

  if (ingest.csvKind === "entity_roster") {
    if (ingest.rosterEntities.length === 0) {
      throw new Error("CSV has no valid entity names");
    }
    return runRosterScreening(ingest.rosterEntities, ingest, options, screenCtx);
  }

  if (ingest.csvKind === "ownership_cap_table") {
    if (ingest.records.length === 0) {
      throw new Error("CSV has no valid ownership records");
    }
    return runOwnershipScreening(ingest, options, screenCtx);
  }

  throw new Error(
    ingest.userMessage ||
      ingest.explanation ||
      "This file type cannot be screened.",
  );
}

export function screeningSummaryBrief(result: ScreeningResult): string {
  const lines = [
    `Entities: ${result.totalEntities}`,
    `Flagged: ${result.flaggedCount}`,
    `Review: ${result.reviewCount}`,
    `Clear: ${result.clearCount}`,
  ];
  if (result.screeningConfidence != null) {
    lines.push(`Screening confidence: ${result.screeningConfidence}%`);
  }
  if (result.screeningMode === "entity_roster") {
    lines.unshift("Mode: entity roster (no ownership graph)");
  }
  if (result.sanctionedExposureSummary) {
    lines.push(result.sanctionedExposureSummary);
  }
  if (result.maxSanctionedExposurePct != null) {
    lines.push(
      `Max sanctioned indirect stake: ${result.maxSanctionedExposurePct.toFixed(1)}%`,
    );
  }
  lines.push(
    "Full ownership graph and entity risk table are in the screening side panel — click an entity there for match details.",
  );
  return lines.join("\n");
}

export function screeningSummary(result: ScreeningResult): string {
  const lines = [
    `Entities: ${result.totalEntities}`,
    `Flagged: ${result.flaggedCount}`,
    `Review: ${result.reviewCount}`,
    `Clear: ${result.clearCount}`,
  ];
  if (result.screeningConfidence != null) {
    lines.push(`Screening confidence: ${result.screeningConfidence}%`);
  }
  if (result.screeningMode === "entity_roster") {
    lines.unshift("Mode: entity roster (no ownership graph)");
  }
  if (result.sanctionedExposureSummary) {
    lines.push(result.sanctionedExposureSummary);
  }
  if (result.maxSanctionedExposurePct != null) {
    lines.push(
      `Max sanctioned indirect stake: ${result.maxSanctionedExposurePct.toFixed(1)}%`,
    );
  }
  const nonClear = result.entities.filter((e) => e.riskLevel !== "clear");
  for (const e of nonClear.slice(0, 20)) {
    const score =
      e.topScore !== null
        ? ` ${(e.topScore * 100).toFixed(0)}%`
        : "";
    const stake =
      e.indirectOwnershipPct != null
        ? ` · ${e.indirectOwnershipPct.toFixed(1)}% of portco`
        : "";
    const exposure = e.exposureStatement ? `\n  ${e.exposureStatement}` : "";
    lines.push(`- ${wrapEntityName(e.name)} [${e.riskLevel}]${score}${stake}${exposure}`);
  }
  if (nonClear.length > 20) {
    lines.push(`… and ${nonClear.length - 20} more non-clear entities`);
  }
  return lines.join("\n");
}
