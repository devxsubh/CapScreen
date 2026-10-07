# /compliance-parity-check — Audit CapScreen Platform Completeness

Compare this repo against the target compliance-platform patterns (chat-first UI, agent tools, memory, RAG) and produce a gap report the user can prioritize.

---

## Steps

### 1. Read references

- `.claude/PROJECT.md` — capability map
- `.claude/templates/compliance-platform-patterns.md`
- Root `CLAUDE.md`

### 2. Inspect codebase (quick)

| Area | Check |
|---|---|
| Chat UI | `assistant/InitialView`, `ChatView`, `ChatInput`, workflows modal |
| Agent loop | `backend/src/lib/llm/agent.ts`, `chatTools.ts` |
| Tools | Count tools in `SCREENER_TOOLS`; any document retrieval tools? |
| Memory | `.claude/agent-memory/` populated? `MEMORY.md` indexes? |
| RAG | Any `embedding`, `pgvector`, `chunk` services? |
| Persistence | `startups.ts`, `lastScreeningResult`, chat history in DB? |
| Streaming | SSE in chat route? or single JSON response? |
| Auth | Supabase + preview mode in `uiPreview.ts` |

### 3. Output report

```markdown
## CapScreen parity report — {date}

### ✅ At parity
- ...

### 🟡 Partial
- ... (what exists, what's missing)

### 🔲 Not started
- ...

### Recommended next 3 tasks
1. ...
2. ...
3. ...
```

Save report to `.claude/agent-memory/project/parity-report-{YYYY-MM-DD}.md` and add index line to `.claude/agent-memory/project/MEMORY.md`.

---

## Do not

- Propose ripping out the restored assistant UI without user asking
- Compare unrelated product domains in the report — focus on **platform patterns** (agent, memory, RAG, chat shell)
