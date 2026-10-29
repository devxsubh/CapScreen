import { screeningSummary } from "../screening/runScreening";
import { wrapEntityName, wrapUntrustedText } from "../shared/promptDelimiters";
import { resolveScreeningForStartup } from "./_shared";
import type { ToolDefinition } from "./registry";
import type { ScreeningResult } from "../screening/runScreening";
import type { ToolContext, ToolExecutorResult } from "./types";

async function handleSummary(
  filters: { startup_id?: string },
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  const { result, label } = await resolveScreeningForStartup(ctx, filters.startup_id);
  if (!result) {
    return {
      content:
        "No screening results for that context. @-mention a startup with a completed screen, attach a CSV, or pass startup_id from list_mentioned_startups.",
    };
  }
  const prefix = label ? `Startup: ${label}\n` : "";
  return { content: prefix + screeningSummary(result) };
}

async function handleListEntities(
  filters: { risk_filter?: string; startup_id?: string },
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  const { result, label } = await resolveScreeningForStartup(ctx, filters.startup_id);
  if (!result) {
    return { content: "No screening results for that context." };
  }
  const filter = filters.risk_filter ?? "all";
  let list = result.entities;
  if (filter !== "all") {
    list = list.filter((e) => e.riskLevel === filter);
  }
  if (list.length === 0) {
    return { content: `No entities with risk_filter=${filter}.` };
  }
  const body = list
    .slice(0, 50)
    .map((e) => {
      const score = e.topScore !== null ? ` ${(e.topScore * 100).toFixed(0)}%` : "";
      const stake =
        e.indirectOwnershipPct != null
          ? ` · ${e.indirectOwnershipPct.toFixed(1)}% indirect`
          : "";
      return `- ${wrapEntityName(e.name)} (${e.type}) [${e.riskLevel}]${score}${stake}`;
    })
    .join("\n");
  const suffix = list.length > 50 ? `\n… ${list.length - 50} more` : "";
  const prefix = label ? `Startup: ${label}\n` : "";
  return { content: prefix + body + suffix };
}

async function handleEntityDetail(
  filters: { entity_name?: string; startup_id?: string },
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  const { result } = await resolveScreeningForStartup(ctx, filters.startup_id);
  if (!result) {
    return { content: "No screening results for that context." };
  }
  const nameQ = filters.entity_name?.trim();
  if (!nameQ) return { content: "Error: entity_name is required for entity_detail." };
  const entity = result.entities.find(
    (e) => e.name.toLowerCase() === nameQ.toLowerCase(),
  );
  if (!entity) {
    return {
      content: `Entity "${nameQ}" not found. Use query_screening_data with query_type="list_entities" to see available names.`,
    };
  }
  const lines = [
    `Name: ${wrapEntityName(entity.name)}`,
    `Type: ${entity.type}`,
    entity.role ? `Role: ${wrapUntrustedText("entity_role", entity.role)}` : "",
    `Risk: ${entity.riskLevel}`,
    entity.topScore !== null
      ? `Top match score: ${(entity.topScore * 100).toFixed(1)}%`
      : "Top match score: none",
    entity.indirectOwnershipPct != null
      ? `Indirect ownership in portco: ${entity.indirectOwnershipPct.toFixed(1)}%`
      : "",
    entity.ownershipRuleFlags?.length
      ? `Ownership rules: ${entity.ownershipRuleFlags.join(", ")}`
      : "",
    entity.exposureStatement
      ? `Exposure: ${wrapUntrustedText("exposure_statement", entity.exposureStatement)}`
      : "",
    entity.ownershipPath.length > 0
      ? `Ownership path: ${entity.ownershipPath.map(wrapEntityName).join(" → ")}`
      : "",
  ];
  if (entity.matches.length > 0) {
    const m = entity.matches[0];
    lines.push(
      `Top SDN match: ${wrapEntityName(m.sdnName)} (${m.programs.join(", ") || "no programs"})`,
    );
  }
  if (entity.explanation) {
    lines.push(`Analyst note: ${entity.explanation}`);
  }
  return { content: lines.filter(Boolean).join("\n") };
}

async function handleSanctionedExposure(
  filters: { startup_id?: string; min_indirect_pct?: number },
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  const minPct = filters.min_indirect_pct ?? 0;

  const sources: Array<{ label: string; result: ScreeningResult }> = [];

  if (filters.startup_id?.trim()) {
    const { result, label } = await resolveScreeningForStartup(ctx, filters.startup_id);
    if (result) sources.push({ label, result });
  } else if (ctx.screeningResult) {
    sources.push({
      label: ctx.screeningResult.startupName ?? "active session",
      result: ctx.screeningResult,
    });
  } else if (ctx.mentionedStartups?.length) {
    for (const s of ctx.mentionedStartups) {
      if (s.screeningResult) {
        sources.push({ label: s.name, result: s.screeningResult });
      }
    }
  }

  if (sources.length === 0) {
    return {
      content:
        "No screening results available. @-mention a startup, attach a CSV, or pass startup_id.",
    };
  }

  const lines: string[] = [];
  for (const { label, result } of sources) {
    const hits = result.entities
      .filter((e) => e.riskLevel !== "clear")
      .filter(
        (e) =>
          (e.indirectOwnershipPct ?? 0) >= minPct ||
          (e.ownershipRuleFlags?.length ?? 0) > 0,
      )
      .sort((a, b) => (b.indirectOwnershipPct ?? 0) - (a.indirectOwnershipPct ?? 0));

    if (hits.length === 0) {
      lines.push(`${label}: no sanctioned exposure above ${minPct}%.`);
      continue;
    }

    lines.push(`${label}${result.startupName ? ` (${result.startupName})` : ""}:`);
    if (result.sanctionedExposureSummary) {
      lines.push(`  ${result.sanctionedExposureSummary}`);
    }
    for (const e of hits.slice(0, 15)) {
      const stake =
        e.indirectOwnershipPct != null
          ? ` · ${e.indirectOwnershipPct.toFixed(1)}% indirect`
          : "";
      const exposure = e.exposureStatement ? `\n    ${e.exposureStatement}` : "";
      lines.push(`  - ${wrapEntityName(e.name)} [${e.riskLevel}]${stake}${exposure}`);
    }
    if (hits.length > 15) lines.push(`  … ${hits.length - 15} more`);
  }

  return { content: lines.join("\n") };
}

export const queryScreeningDataTool: ToolDefinition = {
  name: "query_screening_data",
  readOnly: true,
  schema: {
    name: "query_screening_data",
    description:
      "Query the current screening results. Handles aggregate summaries, entity lists " +
      "(optionally filtered by risk), single-entity detail, and sanctioned ownership exposure. " +
      "Use this for ANY question about screening results — never invent data, always call this tool.",
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: ["summary", "list_entities", "entity_detail", "sanctioned_exposure"],
          description:
            "'summary' → aggregate counts and narrative ('how many flagged?', 'give me a summary'). " +
            "'list_entities' → list entity names, use risk_filter to narrow ('show me flagged entities'). " +
            "'entity_detail' → full detail on one entity by name, requires entity_name ('tell me about Acme Corp'). " +
            "'sanctioned_exposure' → ownership exposure questions ('who has indirect sanctions exposure?').",
        },
        filters: {
          type: "object",
          description: "Optional query-specific filters.",
          properties: {
            entity_name: {
              type: "string",
              description: "Entity name. Required for entity_detail.",
            },
            risk_filter: {
              type: "string",
              enum: ["all", "flagged", "review", "clear"],
              description: "For list_entities. Default: all.",
            },
            startup_id: {
              type: "string",
              description: "Scope to a specific @-mentioned startup.",
            },
            min_indirect_pct: {
              type: "number",
              description: "For sanctioned_exposure. Default 0.",
            },
          },
        },
      },
      required: ["query_type"],
    },
  },
  handler: async (input, ctx) => {
    const args = input as {
      query_type: "summary" | "list_entities" | "entity_detail" | "sanctioned_exposure";
      filters?: {
        entity_name?: string;
        risk_filter?: string;
        startup_id?: string;
        min_indirect_pct?: number;
      };
    };
    const filters = args.filters ?? {};
    switch (args.query_type) {
      case "summary":
        return handleSummary(filters, ctx);
      case "list_entities":
        return handleListEntities(filters, ctx);
      case "entity_detail":
        return handleEntityDetail(filters, ctx);
      case "sanctioned_exposure":
        return handleSanctionedExposure(filters, ctx);
      default:
        return { content: `Unknown query_type: ${String(args.query_type)}` };
    }
  },
  routingHint: `### query_screening_data
Use for ALL questions about screening results — never invent data, always call this tool. Set query_type to:
- "summary" → aggregate counts and overview ("how many flagged?", "give me a summary", "what is the overall risk?")
- "list_entities" → show a list of entity names ("show me all flagged entities" → risk_filter="flagged", "show me everything" → risk_filter="all")
- "entity_detail" → full detail on ONE named entity ("tell me about Acme Corp" → entity_name="Acme Corp")
- "sanctioned_exposure" → indirect/direct ownership exposure ("who has indirect sanctions exposure?", "sanctioned ownership")`,
};
