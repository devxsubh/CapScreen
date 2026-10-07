# CapScreen — VC Cap-Table Compliance Screener

> Chat-first legal/compliance platform for VC firms: screen startup cap tables against sanctions lists (Watchman / OFAC / EU), with agentic tool-calling, persistent memory, and document RAG on the roadmap.

**Read first:** root `CLAUDE.md` for stack, routes, and source map. **Deployment:** `docs/ARCHITECTURE.md` (Vercel frontend, EC2 Docker backend + Watchman, Atlas/Upstash/R2).

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
| Chat-first assistant UI | ✅ Restored | `frontend/.../assistant/`, `InitialView`, `ChatView`, workflows modal |
| Agent tool-calling loop | ✅ Partial | `backend/src/lib/llm/agent.ts`, `chatTools.ts`, `POST /api/chat` |
| Workflows (prompt library) | ✅ UI only | `frontend/.../workflows/`, `builtinWorkflows.ts` — wire to screener backend |
| Projects / deal folders | ✅ Startups | `backend/src/routes/startups.ts`, `frontend/.../projects/` |
| Session memory (chat context) | ✅ Per-request | Client sends `messages` + `screeningResult` + `csvContent` each turn |
| Persistent agent memory | 🔲 Scaffolded | `.claude/agent-memory/` — use `/init-memory`, `/make-agent` |
| Document RAG | 🔲 Planned | See `/compliance-rag-roadmap` — index policies, prior memos, side letters |
| Streaming SSE chat | 🔲 Planned | Target: stream tool events; today returns single JSON response |
| Auth + multi-tenant | 🔲 Optional | Supabase in frontend; preview mode when env empty |

---

## Agent system (runtime)

```
User message (+ optional CSV attach)
  → POST /api/chat { messages, screeningResult, csvContent }
  → runAgentWithTools (Claude Sonnet)
      → tool: screen_cap_table      → runScreening (graph + Watchman + explain)
      → tool: get_screening_summary
      → tool: get_entity_details
      → tool: list_entities
  → { content, screeningResult, toolActivity }
  → Frontend: PreResponseWrapper + CapScreenIcon + markdown (assistant event model)
```

**Extend tools:** add definitions in `SCREENER_TOOLS` + cases in `createToolExecutor()` in `backend/src/lib/chatTools.ts`. Mirror UI events in `AssistantEvent` types on the frontend.

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

- **Backend:** Express + TypeScript strict; tools in `chatTools.ts`; screening orchestration in `runScreening.ts`.
- **Frontend:** Assistant UI under `assistant/`, `workflows/`, `shared/` — preserve compliance shell features unless asked to remove.
- **Types:** Screener domain types in `frontend/src/lib/screenerTypes.ts`; assistant types in `shared/types.ts` (`App*` prefix).
- **Env:** Local — Watchman via `docker-compose.dev.yml`; production — EC2 compose stack + Vercel frontend. `ANTHROPIC_API_KEY` on EC2 only.
