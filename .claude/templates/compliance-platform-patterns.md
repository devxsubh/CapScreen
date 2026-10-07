# Compliance Platform Patterns — Reference for CapScreen

Use this when implementing chat-first legal/compliance features in the VC screener.

---

## 1. Chat-first shell

- **Empty state:** animated logo + serif greeting + rich `ChatInput` (attach docs, workflows, model toggle).
- **Active chat:** scrollable thread, pinned composer, `PreResponseWrapper` for tool/reasoning steps, side panel for structured artifacts (graphs, tables, doc viewer).
- **CapScreen mapping:** `InitialView` + `ChatView`; screener results → `ScreeningResultsPanel` (React Flow graph + risk table).

---

## 2. Agentic tool loop

Standard pattern:

```
while stop_reason == tool_use:
  execute tools server-side
  append tool_result messages
return final text (+ structured artifacts)
```

CapScreen implementation: `backend/src/lib/llm/agent.ts` + `createToolExecutor()`.

**When adding a tool:**

1. Add Anthropic `Tool` schema in `chatTools.ts`
2. Implement executor branch (pure functions in `lib/`, no LLM inside tools)
3. Return JSON the model can reason over; update `screeningResult` in context if needed
4. Frontend: emit `AssistantEvent` (`tool_call_start`, domain-specific blocks later)
5. Rate-limit expensive tools (`screen_cap_table` → existing `screenLimiter`)

---

## 3. Workflows

Workflows = markdown system prompts users attach via `[Workflow: title (id: …)]`.

CapScreen today:

- UI: `AssistantWorkflowModal`, `builtinWorkflows.ts`
- **Target:** screener workflows, e.g.:
  - `builtin-cap-table-screen` — attach CSV, run screen, summarize flagged UBOs
  - `builtin-ownership-chain-dd` — drill into shell-company layers
  - `builtin-export-memo` — generate IC memo from screening results

Wire by: workflow selection → prepend marker to user message → chat system prompt instructs tool use.

---

## 4. Memory

| Layer | CapScreen (current) | CapScreen (target) |
|---|---|---|
| Conversation DB | Client-held messages + MongoDB `lastScreeningResult` per startup | Persist chats per startup in MongoDB |
| Agent memory files | `.claude/agent-memory/` | Same — compliance playbooks learned per firm |
| RAG index | Not yet | pgvector or Atlas Vector Search on compliance docs |

---

## 5. RAG (retrieval)

Pipeline: ingest → chunk → embed → vector store → hybrid retrieve → cite with substring validation.

CapScreen extensions:

- **Structured retrieval:** screening results are already structured — tools are the retrieval layer.
- **Document RAG:** add for PDF policy docs; citations must pass `chunkText.includes(quote)` check.
- **Do not** duplicate screening facts in vector index — index narrative memos and policies only.

---

## 6. Compliance copy

Always surface in UI footers and system prompts:

- “Screening aid — not a sanctions determination.”
- “Verify with compliance officer / legal counsel.”
- Never use “confirmed match” or “guilty” language for `review` tier (80–94%).
