import { runScreening, screeningSummaryBrief } from "../screening/runScreening";
import {
  saveScreeningSnapshot,
  computeScreeningDelta,
} from "../../modules/screening/screeningDelta.service";
import * as startupsRepository from "../../modules/startups/startups.repository";
import { loadStartupCapTableCsvContent } from "./_shared";
import type { ToolDefinition } from "./registry";

export const SCREEN_CAP_TABLE_TOOL_NAME = "screen_cap_table";

export const screenCapTableTool: ToolDefinition = {
  name: SCREEN_CAP_TABLE_TOOL_NAME,
  schema: {
    name: SCREEN_CAP_TABLE_TOOL_NAME,
    description:
      "Run a fresh sanctions screen of the attached cap-table CSV against Watchman. " +
      "ONLY call this when: (a) the user explicitly uploads or pastes a new CSV and asks to screen it, OR (b) a CSV is attached but no screeningResult exists yet, OR (c) the user explicitly asks to re-screen or refresh. " +
      "DO NOT call this if screening results already exist and the user is just asking questions about them — use query_screening_data instead.",
    input_schema: { type: "object", properties: {} },
  },
  handler: async (_input, ctx) => {
    let csvText = ctx.csvContent?.trim() ?? "";
    if (!csvText && ctx.startupId) {
      const loaded = await loadStartupCapTableCsvContent(ctx.startupId, ctx.userId);
      if (loaded) {
        csvText = loaded;
        ctx.csvContent = loaded;
      }
    }
    if (!csvText) {
      return {
        content:
          "Error: No CSV attached. Ask the user to attach a CSV — we auto-detect cap tables and entity lists.",
      };
    }
    const result = await runScreening(csvText, {
      onProgress: ctx.onScreeningProgress,
      skipNarratives: true,
    });
    ctx.screeningResult = result;
    if (ctx.startupId && ctx.userId) {
      const updated = await startupsRepository.updateOwned(ctx.startupId, ctx.userId, {
        lastScreeningResult: result,
        lastScreenedAt: new Date(),
      });
      if (updated) {
        await saveScreeningSnapshot(ctx.startupId, "cap_table", result).catch(() => {});
        await computeScreeningDelta(ctx.startupId, result).catch(() => {});
      }
    }
    return {
      content: `Screening complete.\n${screeningSummaryBrief(result)}`,
      screeningResult: result,
    };
  },
  routingHint: `### screen_cap_table
Call ONLY when:
- User uploads/pastes a new CSV and no screening result exists yet ("screen this", "run screening", "check this cap table")
- User explicitly asks to re-screen or refresh ("re-run the screen", "screen again")
DO NOT call if screening results already exist and the user is asking questions about those results.`,
};
