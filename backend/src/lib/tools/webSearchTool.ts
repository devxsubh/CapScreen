import type { ToolDefinition } from "./registry";

const TAVILY_URL = "https://api.tavily.com/search";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  readOnly: true,
  // Sends the query to an outside search service, so the user approves it first.
  needsApproval: true,
  schema: {
    name: "web_search",
    description:
      "Search the public web for current information about an entity, company, or topic — news, ownership, background, recent sanctions activity. Use when the user asks about something not in the screening data.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Specific search query. Include entity names, company names, or key terms.",
        },
        max_results: {
          type: "number",
          description: "Results to return (1–10, default 5).",
        },
      },
      required: ["query"],
    },
  },
  handler: async (input, _ctx) => {
    const args = input as { query?: string; max_results?: number };
    const q = args.query?.trim();
    if (!q) return { content: "Error: query is required." };

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey || apiKey.includes("NEXT_PUBLIC_")) {
      return {
        content:
          "Web search unavailable — TAVILY_API_KEY is not set or is malformed in the server environment. Add a valid key to the root `.env` on its own line and restart the backend.",
      };
    }

    const maxResults = Math.min(Math.max(1, args.max_results ?? 5), 10);

    let data: {
      answer?: string;
      results?: Array<{ title: string; url: string; content?: string }>;
    };
    try {
      const res = await fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          max_results: maxResults,
          include_answer: true,
          search_depth: "basic",
        }),
      });
      if (!res.ok) return { content: `Web search failed: HTTP ${res.status}` };
      data = (await res.json()) as typeof data;
    } catch (err) {
      return { content: `Web search error: ${String(err)}` };
    }

    const lines: string[] = [`**Web search: "${q}"**\n`];
    if (data.answer) lines.push(`**Summary:** ${data.answer}\n`);

    const results = data.results ?? [];
    if (results.length === 0) return { content: `No results found for "${q}".` };

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`**[${r.title}](${r.url})**`);
      if (r.content)
        lines.push(r.content.slice(0, 400) + (r.content.length > 400 ? "…" : ""));
      lines.push(`> Source ${i + 1}: ${r.url}`);
      lines.push("");
    }

    lines.push(
      "---\n**INSTRUCTION: Your response MUST include every source URL above as a markdown hyperlink `[text](url)`. Do not drop any citations.**",
    );

    return { content: lines.join("\n") };
  },
  routingHint: `### web_search
Call for current public information — available in every chat, with or without a cap table attached:
- news, adverse media, or background on an entity → web_search
- "who owns [company]?" when not in screening data → web_search
- recent OFAC/EU sanctions announcements → web_search
- any question requiring live web sources when query_screening_data cannot answer
Do NOT call if query_screening_data already has the answer from loaded screening results.
After calling web_search, ALWAYS include each source URL as a markdown link in your response — never drop citations.`,
};
