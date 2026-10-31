import type { ColumnFormat } from "../shared/types";

export interface ColumnPreset {
    name: string;
    matches: RegExp;
    prompt: string;
    format: ColumnFormat;
    tags?: string[];
}

/** Column presets for VC sanctions / AML tabular reviews — not legal-contract extraction. */
export const PROMPT_PRESETS: ColumnPreset[] = [
    {
        name: "Entity",
        matches: /\bentit(y|ies)\b|\bshareholder\b|\bowner\b/i,
        format: "text",
        prompt:
            "State the full legal name of this entity exactly as it appears in the cap table or roster.",
    },
    {
        name: "Entity Type",
        matches: /\btype\b|\bperson or company\b/i,
        format: "text",
        prompt: "Is this entity a person or a company?",
    },
    {
        name: "Role",
        matches: /\brole\b|\bcapacity\b/i,
        format: "text",
        prompt:
            "What is this entity's role (e.g. founder, angel investor, seed fund, Series A lead, SPV, LP, vendor, co-investor)?",
    },
    {
        name: "Ownership %",
        matches: /\bownership\s*%|\bownership percent|\bdirect\s*%|\bstake\b/i,
        format: "percentage",
        prompt:
            "What is this entity's direct ownership percentage in the portfolio company?",
    },
    {
        name: "Indirect %",
        matches: /\bindirect\s*%|\beffective\s*%|\bindirect stake\b/i,
        format: "percentage",
        prompt:
            "What is the effective indirect ownership stake in the portfolio company (%), summed across ownership paths?",
    },
    {
        name: "Ownership Path",
        matches: /\bownership path\b|\bownership chain\b|\bchain\b/i,
        format: "text",
        prompt:
            "Describe the full ownership chain from this entity up to the portfolio company, including intermediate SPVs, holdings, and trusts.",
    },
    {
        name: "Ultimate Owner?",
        matches: /\bultimate owner\b|\bubo\b|\bbeneficial owner\b/i,
        format: "yes_no",
        prompt: "Is this entity the ultimate beneficial owner (no further owner in the graph)?",
    },
    {
        name: "Jurisdiction",
        matches: /\bjurisdiction\b|\bcountry\b|\bnationality\b/i,
        format: "text",
        prompt:
            "Country or jurisdiction of incorporation or residence for this entity, if known from the document.",
    },
    {
        name: "Sanctions Match",
        matches: /\bsanctions match\b|\blist match\b|\bwatchman\b/i,
        format: "text",
        prompt:
            "What is the closest match found on sanctions lists (OFAC SDN, EU Consolidated, etc.) for this entity? Write 'No match' if none.",
    },
    {
        name: "Match Score",
        matches: /\bmatch score\b|\bconfidence\b|\bscore\b/i,
        format: "percentage",
        prompt: "What is the match confidence score (0–100%)? Write 'N/A' if no match.",
    },
    {
        name: "Source List",
        matches: /\bsource list\b|\bsanctions list\b|\bofac\b/i,
        format: "text",
        prompt:
            "Which sanctions list produced the highest-scoring match (e.g. OFAC SDN, EU Consolidated)?",
    },
    {
        name: "Risk",
        matches: /\brisk\b|\brisk level\b|\bclassification\b/i,
        format: "tag",
        tags: ["Clear", "Review", "Flagged"],
        prompt:
            "Risk classification based on screening: Clear, Review, or Flagged. Never conclude guilt — decision support only.",
    },
    {
        name: "Enhanced DD?",
        matches: /\benhanced dd\b|\bdue diligence\b|\bescalat(e|ion)\b/i,
        format: "yes_no",
        prompt:
            "Does this entity require enhanced due diligence or compliance escalation based on the screening result?",
    },
    {
        name: "Status",
        matches: /\bstatus\b|\bsign-?off\b|\bhuman review\b/i,
        format: "text",
        prompt:
            "Leave blank — for the compliance officer to complete after human review.",
    },
];

export function getPresetConfig(
    title: string,
): Pick<ColumnPreset, "prompt" | "format" | "tags"> | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const preset = PROMPT_PRESETS.find(({ matches }) => matches.test(trimmed));
    if (!preset) return null;
    return { prompt: preset.prompt, format: preset.format, tags: preset.tags };
}

