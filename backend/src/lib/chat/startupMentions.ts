import mongoose from "mongoose";
import { connectDb } from "../infra/db";
import { visibleStartupFilter } from "../sample/sampleAssets";
import { Startup } from "../../models";
import { screeningSummary } from "../screening/runScreening";
import type { ScreeningResult } from "../../types/screening";

export type MentionedStartup = {
  id: string;
  name: string;
  lastScreenedAt: string | null;
  screeningResult: ScreeningResult | null;
};

/** Extract @mentions: @"Quoted Name", @objectId, or @TokenName */
export function extractStartupMentions(text: string): string[] {
  const pattern =
    /@(?:"([^"]+)"|([a-f0-9]{24})|([A-Za-z0-9][A-Za-z0-9_.-]*))/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const token = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (token) found.push(token);
  }
  return [...new Set(found)];
}

export function extractMentionsFromMessages(
  messages: Array<{ role: string; content: string }>,
): string[] {
  const tokens: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    tokens.push(...extractStartupMentions(m.content));
  }
  return [...new Set(tokens)];
}

export async function resolveStartupMentions(
  tokens: string[],
  userId?: string,
): Promise<MentionedStartup[]> {
  if (tokens.length === 0) return [];
  await connectDb();

  const startups = userId
    ? await Startup.find(visibleStartupFilter(userId)).lean()
    : await Startup.find({ isSample: true }).lean();
  const byId = new Map<string, Record<string, unknown>>();
  const byName = new Map<string, Record<string, unknown>>();
  for (const s of startups as Array<Record<string, unknown>>) {
    byId.set(String(s._id), s);
    const name = String(s.name ?? "").trim().toLowerCase();
    if (name) byName.set(name, s);
  }

  const resolved: MentionedStartup[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    let doc: Record<string, unknown> | undefined;
    if (mongoose.Types.ObjectId.isValid(token) && token.length === 24) {
      doc = byId.get(token);
    } else {
      doc = byName.get(token.toLowerCase());
    }
    if (!doc) continue;

    const id = String(doc._id);
    if (seen.has(id)) continue;
    seen.add(id);

    resolved.push({
      id,
      name: String(doc.name),
      lastScreenedAt: doc.lastScreenedAt
        ? new Date(doc.lastScreenedAt as string).toISOString()
        : null,
      screeningResult: (doc.lastScreeningResult as ScreeningResult | null) ?? null,
    });
  }

  return resolved;
}

export function formatMentionedStartupsContext(
  startups: MentionedStartup[],
): string {
  if (startups.length === 0) return "";

  const blocks = startups.map((s) => {
    const header = `## Startup: ${s.name} (id: ${s.id})`;
    if (!s.screeningResult) {
      return `${header}\nLast screened: never\nNo screening result on file.`;
    }

    const r = s.screeningResult;
    const lines = [
      header,
      `Last screened: ${s.lastScreenedAt ?? r.screenedAt ?? "unknown"}`,
      screeningSummary(r),
    ];

    const flagged = r.entities.filter((e) => e.riskLevel !== "clear");
    if (flagged.length > 0) {
      lines.push("\nFlagged / review entities:");
      for (const e of flagged.slice(0, 15)) {
        const score =
          e.topScore !== null
            ? ` ${(e.topScore * 100).toFixed(0)}%`
            : "";
        lines.push(
          `- ${e.name} [${e.riskLevel}]${score}` +
            (e.ultimateOwner ? ` | UBO: ${e.ultimateOwner}` : "") +
            (e.ownershipPath.length > 1
              ? ` | path: ${e.ownershipPath.join(" → ")}`
              : ""),
        );
        if (e.explanation) lines.push(`  Note: ${e.explanation}`);
      }
      if (flagged.length > 15) {
        lines.push(`… and ${flagged.length - 15} more non-clear entities`);
      }
    }

    return lines.join("\n");
  });

  return (
    "\n\nThe user @-mentioned startup workspace(s). Use this screening data for portfolio questions — do not invent entities or scores.\n\n" +
    blocks.join("\n\n")
  );
}
