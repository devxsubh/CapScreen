# CapScreen — VC Cap-Table Compliance Screener

> Chat-first legal/compliance platform for VC firms: screen startup cap tables against sanctions lists (Watchman / OFAC / EU), with agentic tool-calling, persistent memory, and document RAG on the roadmap.

**Read first:** root `CLAUDE.md` for stack, routes, and source map. **Deployment:** `docs/DESKTOP_PLAN.md` (Electron desktop app; auth service on Vercel + Atlas).

---

## Product principles (non-negotiable)

1. **Decision support only** — never conclude guilt or confirm sanctions violations.
2. **Human-in-the-loop** — every flagged entity needs analyst review; Claude writes narratives, not determinations.
3. **Traceability** — ownership chains, match scores, and Watchman hits must be tool-backed (no invented entities or scores).
4. **Chat-first** — primary UX is assistant conversation, not upload-then-static-report.

---

## Platform capability map

| Capability | CapScreen status | Where / next step |
|---|---|---|
| Chat-first assistant UI | ✅ | `frontend/.../assistant/`, `InitialView`, `ChatView`, workflows modal |
| Agent tool-calling loop | ✅ LangGraph | `backend/src/lib/agent/`, `lib/tools/`, `POST /chat` (`docs/AGENT_HARNESS.md`) |
| Workflows (prompt + tabular) | ✅ | `backend/src/modules/workflows/builtinWorkflows.ts` (single source), `read_workflow` tool |
| Startups / deal workspaces | ✅ | `backend/src/modules/startups/` (+ `capTables/`, `screening/`, `src/routes.ts`), `frontend/.../startups/` |
| Session memory (chat context) | ✅ Per-request | Client sends `messages` + `screeningResult` + `csvContent` each turn |
| Persistent agent memory | 🔲 Scaffolded | `.claude/agent-memory/` — use `/init-memory`, `/make-agent` |
| Document RAG | ✅ | `backend/src/lib/rag/` (local or cloud embeddings, keyword fallback) |
| Streaming SSE chat | ✅ | Tool, screening-progress, plan and approval events |
| Auth | ✅ Desktop sign-in | Hosted auth service + PKCE; single local data owner |

---

## Agent system (runtime)

```
User message (+ optional CSV attach, startup_id, @-mentions, workflow)
  → POST /chat (SSE)
  → runAgent (LangGraph: callModel ⇄ runTools, approvals for web_search)
      → screen_cap_table → runScreening (graph + Watchman + exposure + explain)
      → query_screening_data, generate_document, search_* , web_search, plans, sub-agents …
  → events: content_delta, tool_call_start, screening_progress/result, plan_updated, approval_required
```

**Extend tools:** create the tool in `backend/src/lib/tools/` and register it in `lib/tools/index.ts`. Mirror any new UI event in `AssistantEvent` (`frontend/src/app/components/shared/types.ts`).

---

## Memory system (Claude Code + agents)

| Layer | Path | Purpose |
|---|---|---|
| **Project memory** | `~/.claude/projects/{escaped-repo-path}/memory/` | Cross-session facts about *this repo* and your preferences |
| **Agent memory** | `.claude/agent-memory/{agent-name}/` | Per-agent learning (screening patterns, compliance rules you enforce) |

Commands: `/init-memory`, `/make-agent`. Template: `.claude/templates/agent-memory-system.md`.

Seed project memories live in `.claude/agent-memory/project/` (checked into git).

---

## RAG system (target architecture)

CapScreen today grounds chat in **structured screening results**, not embedded document chunks. Document RAG is the next layer for:

- Firm compliance policies & escalation playbooks  
- Uploaded side letters / LP agreements (PDF/DOCX)  
- Prior screening memos per startup  

Roadmap: `.claude/commands/compliance-rag-roadmap.md`.

---

## Custom agents in this repo

| Agent | File | Use when |
|---|---|---|
| `sanctions-screening-agent` | `.claude/agents/sanctions-screening-agent.md` | Cap-table parsing, Watchman, graph, risk classification |
| `compliance-security-auditor` | `.claude/agents/compliance-security-auditor.md` | PII, cap-table data handling, audit logs, DPDP/GDPR |
| `prompt-enhancer` | `.claude/agents/prompt-enhancer.md` | Turning rough workflow ideas into `prompt_md` |
| `workflow-author` | `.claude/agents/workflow-author.md` | New builtin screener workflows |

---

## Slash commands

| Command | Purpose |
|---|---|
| `/init-memory` | Initialize Claude Code project memory index |
| `/make-agent` | Create a new agent + memory directory |
| `/new-project-setup` | Bootstrap `.claude/` skeleton (idempotent) |
| `/compliance-rag-roadmap` | Plan/implement document RAG in CapScreen |
| `/compliance-agent-feature` | Add a new chat tool + UI event end-to-end |
| `/compliance-parity-check` | Audit platform feature completeness |

---

## Conventions when editing this codebase

- **Backend:** Express + TypeScript strict; tools in `lib/tools/` (registered in `lib/tools/index.ts`); screening orchestration in `lib/screening/runScreening.ts`.
- **Frontend:** Assistant UI under `assistant/`, `workflows/`, `shared/` — preserve compliance shell features unless asked to remove.
- **Types:** Screener domain types in `frontend/src/lib/screenerTypes.ts`; assistant types in `shared/types.ts` (`App*` prefix).
- **Env:** Desktop app — models and keys in the AI Control Center; browser-only dev — root `.env` + Watchman via `docker-compose.dev.yml`.
