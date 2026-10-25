import { completeText } from "../llm/complete";
import type { ScreeningResult } from "../../types/screening";
import { wrapEntityName } from "../shared/promptDelimiters";
import { buildFactsBlock } from "./generateIcMemo";

export function screeningAnalysisTitle(
  startupName: string,
  screenedAt?: string,
): string {
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
  return `Screening Analysis — ${startupName} — ${date}`;
}

export async function generateScreeningAnalysisContent(
  startupName: string,
  result: ScreeningResult,
): Promise<string> {
  const facts = buildFactsBlock(startupName, result);

  const prompt = `Write a sanctions screening analysis document in Markdown using ONLY the facts below. This is an analyst write-up of the current screening — NOT an Investment Committee memo.

${facts}

Structure:
1. # Screening Analysis — ${startupName}
2. ## Overview (short paragraph on scope and headline risk)
3. ## Screening Snapshot (bullet counts: total, flagged, review, clear; confidence if present)
4. ## Key Findings (table: Entity | Risk tier | Match score | Exposure / ownership path)
5. ## Flagged & Review Entities (one subsection per non-clear entity with analyst-style notes)
6. ## Suggested Follow-ups (human review steps — no legal conclusions)
7. ## Disclaimer (decision support only — not a legal determination)

Use clear analyst tone. Do not use "Investment Committee" headings. Be concise.`;

  try {
    return await completeText({
      systemPrompt:
        "You write sanctions screening analysis documents for VC compliance analysts. Use only provided facts. Never confirm guilt or sanctions violations.",
      user: prompt,
      maxTokens: 2000,
    });
  } catch {
    const nonClear = result.entities.filter((e) => e.riskLevel !== "clear");
    const entityLines =
      nonClear.length === 0
        ? ["No flagged or review-tier entities."]
        : nonClear.map((e) => {
            const score =
              e.topScore != null
                ? `${(e.topScore * 100).toFixed(0)}%`
                : "n/a";
            return `- ${wrapEntityName(e.name)} [${e.riskLevel}] — match ${score}`;
          });

    return [
      `# Screening Analysis — ${startupName}`,
      ``,
      `## Overview`,
      `Screening completed with ${result.flaggedCount} flagged and ${result.reviewCount} review-tier entities (${result.totalEntities} total).`,
      ``,
      `## Screening Snapshot`,
      `- Total entities: ${result.totalEntities}`,
      `- Flagged: ${result.flaggedCount}`,
      `- Review: ${result.reviewCount}`,
      `- Clear: ${result.clearCount}`,
      result.screeningConfidence != null
        ? `- Confidence: ${result.screeningConfidence}%`
        : "",
      ``,
      `## Key Findings`,
      ...entityLines,
      ``,
      `## Disclaimer`,
      `This analysis is decision support only and does not constitute a legal determination.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}

export async function buildScreeningAnalysis(
  startupName: string,
  result: ScreeningResult,
): Promise<{ title: string; content: string; screeningScreenedAt: string | null }> {
  const content = await generateScreeningAnalysisContent(startupName, result);
  return {
    title: screeningAnalysisTitle(startupName, result.screenedAt),
    content,
    screeningScreenedAt: result.screenedAt ?? null,
  };
}
