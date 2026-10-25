import { completeText } from "../llm/complete";
import { describeLlmConfig } from "../llm/providers";
import type { WatchmanMatch } from "./watchman";
import type { GraphNode } from "./graph";
import type { RiskLevel } from "./classify";
import { screeningLog } from "./screeningLog";
import {
  UNTRUSTED_DATA_PROMPT_GUARD,
  wrapEntityName,
} from "../shared/promptDelimiters";
import { isExternalLlmBlocked } from "../shared/dataResidency";

export async function explainMatch(
  entity: GraphNode,
  matches: WatchmanMatch[],
  ownershipPath: string[],
  riskLevel: RiskLevel,
  context?: {
    indirectOwnershipPct?: number | null;
    exposureStatement?: string;
    ownershipRuleFlags?: string[];
    startupName?: string;
    role?: string;
  },
): Promise<string> {
  if (isExternalLlmBlocked()) {
    const top = matches[0];
    const score = top ? `${(top.match * 100).toFixed(0)}%` : "n/a";
    return (
      `Possible ${riskLevel} match (${score} top score). ` +
      "AI narrative generation is disabled for data-residency compliance — review Watchman match data directly."
    );
  }

  const matchLines = matches
    .slice(0, 3)
    .map(
      (m) =>
        `  • ${wrapEntityName(m.sdnName)} | type: ${m.sdnType || "N/A"} | program: ${m.programs.join(", ") || "N/A"} | score: ${(m.match * 100).toFixed(0)}%`,
    )
    .join("\n");

  const pathStr =
    ownershipPath.length > 1
      ? ownershipPath.map(wrapEntityName).join(" → ")
      : "(direct owner or standalone entity)";

  const exposureLines: string[] = [];
  if (context?.startupName && context.indirectOwnershipPct != null) {
    exposureLines.push(
      `Effective stake in portfolio company (${context.startupName}): ${context.indirectOwnershipPct.toFixed(1)}%`,
    );
  }
  if (context?.exposureStatement) {
    exposureLines.push(`Exposure summary: ${context.exposureStatement}`);
  }
  if (context?.ownershipRuleFlags?.length) {
    exposureLines.push(
      `Ownership rules triggered: ${context.ownershipRuleFlags.join(", ")}`,
    );
  }
  if (context?.role) {
    exposureLines.push(`Entity role: ${context.role}`);
  }

  const prompt = `${UNTRUSTED_DATA_PROMPT_GUARD}

You are a compliance analyst's assistant. A sanctions screening tool found a possible match for an entity in a venture capital cap table.

Entity: ${wrapEntityName(entity.name)} (${entity.type})
Risk level: ${riskLevel.toUpperCase()}
Ownership chain from the portfolio company: ${pathStr}
${exposureLines.length > 0 ? `\nOwnership exposure:\n${exposureLines.map((l) => `- ${l}`).join("\n")}` : ""}

Top Watchman matches:
${matchLines}

Write exactly 3–4 plain-English sentences for a human compliance reviewer (plain text only — no markdown, no headings, no bullet lists):
1. WHO this entity is in the ownership chain (their structural role) and what % of the portfolio company they effectively represent, if known.
2. WHY they were flagged (what the match suggests — name similarity, sanctions program, etc.).
3. Your CONFIDENCE in the match (high / medium / low — justify briefly based on score and name similarity).
4. The recommended NEXT STEP for the human reviewer.

Do NOT make a legal determination or confirm a sanctions violation. You are narrating a screening signal for human review, not deciding guilt.`;

  screeningLog("LLM narrative (AI explains Watchman match — does not create the match)", {
    entity: entity.name,
    riskLevel,
    watchmanMatches: matches.slice(0, 3).map((m) => ({
      name: m.sdnName,
      score: `${(m.match * 100).toFixed(0)}%`,
      program: m.programs.join(", ") || "n/a",
    })),
    source: describeLlmConfig().roles.utility?.provider ?? "unconfigured",
  });

  try {
    return await completeText({
      systemPrompt:
        "You are a cautious compliance analyst. Always recommend human verification. Never conclude guilt.",
      user: prompt,
      maxTokens: 300,
    });
  } catch {
    return `${riskLevel === "flagged" ? "High" : "Medium"}-confidence match found against the Watchman database. Recommend manual review by a qualified compliance officer before proceeding.`;
  }
}
