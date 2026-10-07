import type { AppWorkflow } from "../shared/types";

const SYSTEM = {
    user_id: null as null,
    is_system: true as const,
    created_at: "",
};

/**
 * Built-in workflows for the VC sanctions & AML screener.
 * Legal-transaction templates (NDA, SPA, credit agreements, etc.) are excluded.
 */
export const BUILT_IN_WORKFLOWS: AppWorkflow[] = [
    // ─── Assistant workflows ────────────────────────────────────────────────────
    {
        ...SYSTEM,
        id: "builtin-cap-table-screen",
        title: "Cap Table Sanctions Screen",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## Cap Table Sanctions Screen\n\n" +
            "When the user provides a cap-table CSV, call screen_cap_table immediately to run Watchman sanctions screening with ownership-graph traversal.\n\n" +
            "Then:\n" +
            "1. Summarize total entities screened and counts by risk level (flagged / review / clear) in 2–4 sentences.\n" +
            "2. Do NOT list individual entities or match details in chat — the side panel shows the ownership graph and entity risk table.\n" +
            "3. Use query_screening_data with entity_detail when the user asks about a specific entity — never invent match scores.\n" +
            "4. Recommend human expert verification for final decisions.\n\n" +
            "Never conclude guilt or confirm sanctions violations.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-entity-roster-screen",
        title: "Entity Roster Sanctions Screen",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## Entity Roster Sanctions Screen\n\n" +
            "When the user attaches a flat entity list CSV (one name per row — investors, LPs, vendors, or shareholders without an ownership graph), call screen_cap_table to screen every listed entity against Watchman.\n\n" +
            "Then:\n" +
            "1. Summarize how many entities were screened and the flagged / review / clear counts.\n" +
            "2. Highlight any near-threshold matches that need human review.\n" +
            "3. Use query_screening_data for entity-specific follow-ups.\n\n" +
            "Decision support only — never confirm a sanctions hit.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-co-investor-vendor-screen",
        title: "Co-Investor & Vendor Screening",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## Co-Investor & Vendor Screening\n\n" +
            "Screen co-investors, syndicate partners, or portfolio vendors from an attached entity roster CSV.\n\n" +
            "Steps:\n" +
            "1. Call screen_cap_table on the attached CSV.\n" +
            "2. Summarize aggregate risk (flagged / review / clear) and whether any party would affect deal clearance.\n" +
            "3. Flag entities where a potential match could create reputational or regulatory exposure for the fund.\n" +
            "4. Recommend enhanced due diligence steps for any review-tier or flagged party.\n\n" +
            "Use query_screening_data for drill-down. Never state that a party is sanctioned.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-flagged-entity-investigation",
        title: "Flagged Entity Investigation",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## Flagged Entity Investigation\n\n" +
            "The user wants a deep dive on a specific entity from an existing screening in this session.\n\n" +
            "Steps:\n" +
            "1. Use query_screening_data with query_type=\"list_entities\" and risk_filter=\"flagged\" (or \"review\") to confirm context.\n" +
            "2. Use query_screening_data with query_type=\"entity_detail\" for the entity the user names.\n" +
            "3. Explain: match score, source list, ownership path (if cap table), and why the entity landed in flagged/review.\n" +
            "4. Outline recommended human next steps (OFAC 50% rule check, alias review, adverse media, escalation to CCO).\n\n" +
            "Use \"potential match\" language. Never confirm guilt or a true sanctions designation.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-ic-memo",
        title: "IC Compliance Memo",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## Investment Committee Compliance Memo\n\n" +
            "Draft a concise IC memo from screening results in this session.\n\n" +
            "Include:\n" +
            "- Executive summary (1 paragraph)\n" +
            "- Screening scope and methodology (Watchman, ownership traversal)\n" +
            "- Flagged and review entities with match scores and ownership chains\n" +
            "- Recommended next steps for the compliance team\n" +
            "- Open questions / items requiring human review\n\n" +
            "Call generate_ic_memo to save the memo as a startup document when in a startup workspace. Use query_screening_data for facts. Decision support only — not a legal determination.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-portfolio-sanctions-brief",
        title: "Portfolio Sanctions Brief",
        type: "assistant",
        practice: "Portfolio Monitoring",
        prompt_md:
            "## Portfolio Sanctions Brief\n\n" +
            "Produce a portfolio-level sanctions risk brief using @-mentioned startups or list_mentioned_startups.\n\n" +
            "Cover:\n" +
            "1. Which portfolio companies have open flagged or review-tier entities\n" +
            "2. Highest-risk entity per company (if any)\n" +
            "3. Cross-portfolio patterns (shared owners, repeat near-matches, jurisdictions)\n" +
            "4. Recommended re-screen cadence and items for the CCO weekly review\n\n" +
            "Use query_screening_data per startup. If no startups are in context, ask the user to @mention companies with completed screens.",
        columns_config: null,
    },
    {
        ...SYSTEM,
        id: "builtin-aml-screening-summary",
        title: "AML Screening Summary",
        type: "assistant",
        practice: "AML & Sanctions",
        prompt_md:
            "## AML Screening Summary\n\n" +
            "After a sanctions screen in this session, produce a structured AML audit summary suitable for compliance files.\n\n" +
            "Sections:\n" +
            "1. **Scope** — what was screened (cap table / roster), date, list sources (OFAC SDN, UN, etc.)\n" +
            "2. **Results** — entity counts by risk tier; max indirect sanctioned exposure if cap table\n" +
            "3. **Items requiring review** — flagged and review entities (names only, with scores)\n" +
            "4. **Cleared scope** — confirm what was checked for auditable clearance\n" +
            "5. **Human sign-off placeholder** — note that final determination rests with the compliance officer\n\n" +
            "Use query_screening_data — never invent data. Decision support only.",
        columns_config: null,
    },

    // ─── Tabular workflows ──────────────────────────────────────────────────────
    {
        ...SYSTEM,
        id: "builtin-cap-table-review",
        title: "Cap Table Sanctions Review",
        type: "tabular",
        practice: "AML & Sanctions",
        prompt_md:
            "## Cap Table Sanctions Review\n\n" +
            "Grid review of every entity in a cap-table sanctions screen. Machine fills findings; human fills Status.",
        columns_config: [
            {
                index: 0,
                name: "Entity",
                format: "text",
                prompt: "State the full name of this entity exactly as it appears in the cap table.",
            },
            {
                index: 1,
                name: "Type",
                format: "text",
                prompt: "Is this entity a person or a company? State 'Person' or 'Company'.",
            },
            {
                index: 2,
                name: "Ultimate Owner?",
                format: "yes_no",
                prompt: "Is this entity the ultimate beneficial owner? Answer Yes or No.",
            },
            {
                index: 3,
                name: "Ownership Path",
                format: "text",
                prompt: "Describe the full ownership chain from this entity up to the portfolio company.",
            },
            {
                index: 4,
                name: "Indirect %",
                format: "text",
                prompt: "Effective indirect ownership stake in the portfolio company (%).",
            },
            {
                index: 5,
                name: "Sanctions Match",
                format: "text",
                prompt: "Closest sanctions list match, or 'No match'.",
            },
            {
                index: 6,
                name: "Match Score",
                format: "text",
                prompt: "Match confidence 0–100%, or N/A.",
            },
            {
                index: 7,
                name: "Source List",
                format: "text",
                prompt: "Sanctions list source (e.g. OFAC SDN).",
            },
            {
                index: 8,
                name: "Risk",
                format: "tag",
                tags: ["Clear", "Review", "Flagged"],
                prompt: "Risk classification: Clear, Review, or Flagged.",
            },
            {
                index: 9,
                name: "Status",
                format: "text",
                prompt: "Leave blank — for the compliance officer after human review.",
            },
        ],
    },
    {
        ...SYSTEM,
        id: "builtin-entity-roster-review",
        title: "Entity Roster Sanctions Review",
        type: "tabular",
        practice: "AML & Sanctions",
        prompt_md:
            "## Entity Roster Sanctions Review\n\n" +
            "Grid review for flat entity lists (investors, vendors, LPs). One row per entity.",
        columns_config: [
            {
                index: 0,
                name: "Entity",
                format: "text",
                prompt: "Full legal name of the entity as listed in the roster.",
            },
            {
                index: 1,
                name: "Type",
                format: "text",
                prompt: "Person or company.",
            },
            {
                index: 2,
                name: "Role",
                format: "text",
                prompt: "Role in the transaction (co-investor, vendor, LP, advisor).",
            },
            {
                index: 3,
                name: "Jurisdiction",
                format: "text",
                prompt: "Country or jurisdiction of incorporation or residence, if known.",
            },
            {
                index: 4,
                name: "Sanctions Match",
                format: "text",
                prompt: "Closest sanctions list match, or 'No match'.",
            },
            {
                index: 5,
                name: "Match Score",
                format: "text",
                prompt: "Match confidence 0–100%, or N/A.",
            },
            {
                index: 6,
                name: "Source List",
                format: "text",
                prompt: "Sanctions list source.",
            },
            {
                index: 7,
                name: "Risk",
                format: "tag",
                tags: ["Clear", "Review", "Flagged"],
                prompt: "Clear, Review, or Flagged.",
            },
            {
                index: 8,
                name: "Enhanced DD?",
                format: "yes_no",
                prompt: "Does this entity require enhanced due diligence?",
            },
            {
                index: 9,
                name: "Status",
                format: "text",
                prompt: "Leave blank — human sign-off after review.",
            },
        ],
    },
    {
        ...SYSTEM,
        id: "builtin-portfolio-monitoring",
        title: "Portfolio Sanctions Monitoring",
        type: "tabular",
        practice: "Portfolio Monitoring",
        prompt_md:
            "## Portfolio Sanctions Monitoring\n\n" +
            "Portfolio-wide grid: one row per startup. Sync from the Startups page to refresh screening data.",
        columns_config: [
            {
                index: 0,
                name: "Last screened",
                format: "text",
                prompt: "When was this company last screened?",
            },
            {
                index: 1,
                name: "Open flags",
                format: "text",
                prompt: "Count of flagged and review-tier entities.",
            },
            {
                index: 2,
                name: "Highest-risk entity",
                format: "text",
                prompt: "Name of the highest-risk entity on the cap table.",
            },
            {
                index: 3,
                name: "Sanctioned exposure",
                format: "text",
                prompt: "Maximum indirect sanctioned ownership stake (%).",
            },
            {
                index: 4,
                name: "Co-investor risk",
                format: "text",
                prompt: "Sanctions risk from co-investor / vendor roster screening.",
            },
            {
                index: 5,
                name: "Status",
                format: "text",
                prompt: "Leave blank for the compliance officer to complete.",
            },
        ],
    },
    {
        ...SYSTEM,
        id: "builtin-sanctions-triage",
        title: "Sanctions Triage Queue",
        type: "tabular",
        practice: "AML & Sanctions",
        prompt_md:
            "## Sanctions Triage Queue\n\n" +
            "Focused review grid for flagged and review-tier entities only.",
        columns_config: [
            {
                index: 0,
                name: "Entity",
                format: "text",
                prompt: "Entity name.",
            },
            {
                index: 1,
                name: "Risk",
                format: "tag",
                tags: ["Review", "Flagged"],
                prompt: "Review or Flagged.",
            },
            {
                index: 2,
                name: "Match Score",
                format: "text",
                prompt: "Match confidence 0–100%.",
            },
            {
                index: 3,
                name: "Source List",
                format: "text",
                prompt: "Sanctions list source.",
            },
            {
                index: 4,
                name: "Ownership Path",
                format: "text",
                prompt: "Ownership chain to portfolio company, or N/A for roster entities.",
            },
            {
                index: 5,
                name: "Recommended Action",
                format: "text",
                prompt: "Suggested next step (alias check, CCO escalation, clear after review).",
            },
            {
                index: 6,
                name: "Analyst Notes",
                format: "text",
                prompt: "Leave blank — for the reviewer.",
            },
            {
                index: 7,
                name: "Status",
                format: "text",
                prompt: "Leave blank — human disposition (Cleared / Escalated / Blocked).",
            },
        ],
    },
    {
        ...SYSTEM,
        id: "builtin-aml-counterparty-kyc",
        title: "AML Counterparty KYC Review",
        type: "tabular",
        practice: "AML & Sanctions",
        prompt_md:
            "## AML Counterparty KYC Review\n\n" +
            "KYC + sanctions grid for counterparties at deal intake.",
        columns_config: [
            {
                index: 0,
                name: "Legal Name",
                format: "text",
                prompt: "Full legal name of the counterparty.",
            },
            {
                index: 1,
                name: "Entity Type",
                format: "text",
                prompt: "Person, company, fund, or trust.",
            },
            {
                index: 2,
                name: "Jurisdiction",
                format: "text",
                prompt: "Country of incorporation or residence.",
            },
            {
                index: 3,
                name: "Role",
                format: "text",
                prompt: "Role in the deal (founder, investor, co-investor, vendor, LP).",
            },
            {
                index: 4,
                name: "Sanctions Match",
                format: "text",
                prompt: "Closest sanctions list match.",
            },
            {
                index: 5,
                name: "Match Score",
                format: "text",
                prompt: "Match confidence 0–100%.",
            },
            {
                index: 6,
                name: "Source List",
                format: "text",
                prompt: "Sanctions list source.",
            },
            {
                index: 7,
                name: "Risk",
                format: "tag",
                tags: ["Clear", "Review", "Flagged"],
                prompt: "Clear, Review, or Flagged.",
            },
            {
                index: 8,
                name: "EDD Required?",
                format: "yes_no",
                prompt: "Is enhanced due diligence required?",
            },
            {
                index: 9,
                name: "Status",
                format: "text",
                prompt: "Leave blank — KYC verification sign-off.",
            },
        ],
    },
];

export const BUILT_IN_IDS = new Set(BUILT_IN_WORKFLOWS.map((wf) => wf.id));
