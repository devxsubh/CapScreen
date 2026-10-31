# Tool Routing Analysis — Screener Chat Agent

## Problem

> The screener route (`/api/chat`) has since been merged into `POST /chat` (`modules/assistant/assistant.service.ts`); the forced first-turn `tool_choice` below lives there now, and the three summary/list/detail tools became `query_screening_data`.

The Claude agent in `/api/chat` was not reliably selecting the correct tool based on user intent. The agent would sometimes respond with prose from the attached CSV instead of running Watchman screening, and would conflate `get_screening_summary` with `list_entities` for ambiguous queries.

---

## Root Cause

`runAgentStream` never passed a `tool_choice` parameter to the Anthropic API. This means Claude always used default `auto` behaviour — it was free to either call a tool or respond directly, even on the first turn when a CSV was attached and Watchman screening **must** run before any answer is meaningful.

System prompt guidance ("call screen_cap_table when the user attaches a CSV") is advisory only. Haiku (the locked model) does not reliably follow multi-condition decision trees in prompts under ambiguous phrasing.

---

## Identified Routing Failure Modes

### 1. First-turn CSV skip (HIGH — fixed)
- **Trigger:** User attaches a CSV and asks a natural-language question ("what does this cap table look like?")
- **Failure:** Claude reads the raw CSV text from the system prompt and answers from it, bypassing Watchman screening entirely
- **Fix:** `tool_choice: { type: "tool", name: "screen_cap_table" }` forced on round 0 when `csvContent` is present and no prior `screeningResult` exists

### 2. `screen_cap_table` overfire (MEDIUM)
- **Trigger:** Prior screening result exists; user asks a follow-up question
- **Failure:** Claude re-calls `screen_cap_table`, triggering a full Watchman re-screen unnecessarily
- **Fix:** `toolChoice` is `undefined` (auto) when `ctx.screeningResult` is already set; system prompt says "DO NOT call again unless the user explicitly asks to re-screen"

### 3. `get_screening_summary` vs `list_entities` confusion (MEDIUM)
- **Trigger:** "Show me flagged entities" — ambiguous between counts and names
- **Failure:** Claude calls `get_screening_summary` (returns aggregate counts) when user wanted `list_entities` (returns names), or vice versa
- **Fix:** Tool descriptions rewritten with explicit trigger phrases and "DO NOT use for..." guards for each tool

### 4. `list_sanctioned_exposure` vs `list_entities` overlap (MEDIUM)
- **Trigger:** "Show me sanctioned entities" (missing "exposure" qualifier)
- **Failure:** Claude calls `list_sanctioned_exposure` when the simpler `list_entities(risk_filter="flagged")` is correct
- **Fix:** `list_sanctioned_exposure` description scoped to "direct/indirect ownership exposure" questions only; negative example added in system prompt

### 5. No-tool hallucination (LOW)
- **Trigger:** User asks "how many entities are flagged?" when a prior result is in context
- **Failure:** Claude reads the count from the injected JSON summary in the system prompt and answers directly without calling `get_screening_summary`
- **Status:** Acceptable — the injected summary is accurate data, so the answer is correct. Not a misbehaviour.

---

## Risk Classification Thresholds

These are deterministic, set in `backend/src/lib/screening/classify.ts` and overridable via env vars:

| Level | Score threshold | Env var |
|---|---|---|
| `flagged` | ≥ 0.95 (95%) | `SCREENING_FLAGGED_MIN_SCORE` |
| `review` | ≥ 0.80 (80%) | `SCREENING_REVIEW_MIN_SCORE` |
| `clear` | < 0.80 or null | — |

Watchman only returns matches ≥ 80% (`SCREENING_WATCHMAN_MIN_MATCH`), so there are no missed hits below the review threshold.

Ownership rule flags (independent of match score):
- `ubo_25`: entity holds ≥ 25% indirect stake (`SCREENING_UBO_PCT_THRESHOLD`)
- `ofac_50`: entity holds ≥ 50% indirect stake (`SCREENING_OFAC_50_PCT_THRESHOLD`)

---

## Model Constraint

The model is hardcoded to `claude-haiku-4-5` in `backend/src/lib/llm/models.ts`. The env var override is intentionally blocked to control cost at screening volume. All routing improvements must work within Haiku's capabilities — complex system prompt decision trees are unreliable; deterministic API-level controls (`tool_choice`) are preferred.

---

## Fix Applied

**`backend/src/lib/llm/streamAgent.ts`**
- Added optional `toolChoice` parameter (`ToolChoiceAuto | ToolChoiceAny | ToolChoiceTool`)
- Passed to the Anthropic API call on round 0 only; rounds 1+ always use default auto

**`backend/src/routes/chat.ts`**
- Computes `toolChoice = { type: "tool", name: "screen_cap_table" }` when `csvContent` is present and no `screeningResult` exists
- `toolChoice` is `undefined` (auto) for all other turns
- Passed into `runAgentStream`

This makes the most critical routing decision (first-turn CSV → screen) **deterministic at the API level** rather than dependent on Haiku's instruction-following.
