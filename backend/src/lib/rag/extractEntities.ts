import { completeText } from "../llm/complete";

export type ExtractedEntity = {
  name: string;
  type: "person" | "company";
  context: string;
};

const MAX_TEXT_CHARS = 18000; // ~4500 tokens — fits small local models too

export async function extractEntitiesFromText(
  text: string,
  filename: string,
): Promise<ExtractedEntity[]> {
  const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + "\n…[truncated]" : text;

  const prompt = `Extract all named persons and legal entities (companies, funds, LLCs, trusts, partnerships) from the document below.

Return ONLY a JSON array. Each item: {"name": string, "type": "person"|"company", "context": one-sentence description of their role in the document}

Rules:
- Include only concrete named parties, not generic terms like "the Investor" or "the Company"
- If a person's full name is present, use it
- Omit duplicates (keep the first occurrence)
- Maximum 80 entities

Document: ${filename}

<document>
${truncated}
</document>

Respond with JSON only, no prose.`;

  const raw = await completeText({ user: prompt, maxTokens: 2048 });

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    return parsed
      .filter(
        (e): e is ExtractedEntity =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as ExtractedEntity).name === "string" &&
          ((e as ExtractedEntity).type === "person" || (e as ExtractedEntity).type === "company"),
      )
      .slice(0, 80);
  } catch {
    return [];
  }
}
