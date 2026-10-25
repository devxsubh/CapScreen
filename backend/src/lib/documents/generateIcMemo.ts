import { completeText } from "../llm/complete";
import type { ScreeningResult } from "../../types/screening";
import { wrapEntityName } from "../shared/promptDelimiters";

export function buildFactsBlock(
  startupName: string,
  result: ScreeningResult,
): string {
  const lines: string[] = [
    `Portfolio company: ${result.startupName ?? startupName}`,
    `Screened at: ${result.screenedAt ?? "unknown"}`,
    `Total entities: ${result.totalEntities}`,
    `Flagged: ${result.flaggedCount} | Review: ${result.reviewCount} | Clear: ${result.clearCount}`,
  ];
  if (result.screeningConfidence != null) {
    lines.push(`Screening confidence: ${result.screeningConfidence}%`);
  }

  if (result.sanctionedExposureSummary) {
    lines.push(`Exposure summary: ${result.sanctionedExposureSummary}`);
  }
  if (result.maxSanctionedExposurePct != null) {
    lines.push(
      `Max sanctioned indirect stake: ${result.maxSanctionedExposurePct.toFixed(1)}%`,
    );
  }

  if (result.watchmanListInfo) {
    const info = result.watchmanListInfo;
    const listSummary = Object.entries(info.lists)
      .map(([k, n]) => `${k}: ${n.toLocaleString()}`)
      .join(", ");
    lines.push(
      `Sanctions lists (Watchman ${info.version ?? "unknown"}): ${listSummary || "none reported"}`,
    );
    if (info.endedAt) {
      lines.push(`List data refreshed: ${info.endedAt}`);
    }
  }
  if (result.watchmanSearchLimit != null) {
    lines.push(`Watchman hits per entity (max): ${result.watchmanSearchLimit}`);
  }

  const nonClear = result.entities.filter((e) => e.riskLevel !== "clear");
  if (nonClear.length === 0) {
    lines.push("No flagged or review-tier entities.");
  } else {
    lines.push("", "Entities requiring review:");
    for (const e of nonClear) {
      const score =
        e.topScore != null ? `${(e.topScore * 100).toFixed(0)}%` : "n/a";
      const stake =
        e.indirectOwnershipPct != null
          ? `${e.indirectOwnershipPct.toFixed(1)}% indirect in portco`
          : "n/a";
      const path =
        e.ownershipPath.length > 1
          ? e.ownershipPath.map(wrapEntityName).join(" → ")
          : "direct / standalone";
      const match = e.matches[0]?.sdnName
        ? wrapEntityName(e.matches[0].sdnName)
        : "none";
      lines.push(
        `- ${wrapEntityName(e.name)} (${e.type}) [${e.riskLevel}] | match ${score} vs ${match} | ${stake} | path: ${path}`,
      );
      if (e.exposureStatement) {
        lines.push(`  Exposure: ${e.exposureStatement}`);
      }
      if (e.ownershipRuleFlags?.length) {
        lines.push(`  Rules: ${e.ownershipRuleFlags.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}

export function icMemoTitle(startupName: string, screenedAt?: string): string {
  const date = screenedAt
    ? new Date(screenedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `IC Compliance Memo — ${startupName} — ${date}`;
}

export async function generateIcMemoContent(
  startupName: string,
  result: ScreeningResult,
): Promise<string> {
  const facts = buildFactsBlock(startupName, result);

  const prompt = `Write an Investment Committee Compliance Memo in Markdown using ONLY the facts below. Do not invent entities, scores, or ownership percentages.

${facts}

Structure:
1. # Investment Committee Compliance Memo
2. ## Executive Summary (one short paragraph)
3. ## Screening Scope & Methodology
4. ## Findings (table: Entity | Risk | Match score | Indirect % | Ownership path)
5. ## Ownership Exposure Highlights (bullet list for flagged/review entities with exposure statements)
6. ## Recommended Next Steps
7. ## Open Questions / Human Review Items
8. ## Disclaimer (decision support only — not a legal determination)

Use professional compliance tone. Be concise.`;

  try {
    return await completeText({
      systemPrompt:
        "You draft IC compliance memos for VC associates. Use only provided screening facts. Never confirm guilt or sanctions violations.",
      user: prompt,
      maxTokens: 2000,
    });
  } catch {
    return [
      `# Investment Committee Compliance Memo`,
      ``,
      `**${startupName}**`,
      ``,
      `## Executive Summary`,
      `Screening completed with ${result.flaggedCount} flagged and ${result.reviewCount} review-tier entities (${result.totalEntities} total). Human compliance review required before investment committee approval.`,
      ``,
      `## Screening facts`,
      ``,
      facts,
      ``,
      `## Disclaimer`,
      `This memo is decision support only and does not constitute a legal determination.`,
    ].join("\n");
  }
}

export interface GeneratedIcMemo {
  title: string;
  content: string;
  screeningScreenedAt: string | null;
}

export async function buildIcMemo(
  startupName: string,
  result: ScreeningResult,
): Promise<GeneratedIcMemo> {
  const content = await generateIcMemoContent(startupName, result);
  return {
    title: icMemoTitle(startupName, result.screenedAt),
    content,
    screeningScreenedAt: result.screenedAt ?? null,
  };
}
