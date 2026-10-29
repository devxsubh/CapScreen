import type { ToolDefinition } from "./registry";

export const listMentionedStartupsTool: ToolDefinition = {
  name: "list_mentioned_startups",
  readOnly: true,
  schema: {
    name: "list_mentioned_startups",
    description:
      "List startups the user @-mentioned in this chat with screening status.",
    input_schema: { type: "object", properties: {} },
  },
  handler: async (_input, ctx) => {
    const list = ctx.mentionedStartups ?? [];
    if (list.length === 0) {
      return {
        content:
          "No @-mentioned startups in this chat. User can type @StartupName to pull a workspace screening into context.",
      };
    }
    const lines = list.map((s) => {
      const status = s.screeningResult
        ? `screened (${s.screeningResult.flaggedCount} flagged, ${s.screeningResult.reviewCount} review)`
        : "not screened";
      return `- ${s.name} (id: ${s.id}) — ${status}`;
    });
    return { content: lines.join("\n") };
  },
};
