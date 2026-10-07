# /compliance-rag-roadmap — Document RAG for CapScreen

Plan or implement document retrieval for the VC screener **inside the existing repo** — do not scaffold a greenfield app.

**Read first:** `.claude/PROJECT.md`, `.claude/templates/compliance-platform-patterns.md`, root `CLAUDE.md`.

---

## What RAG is for in CapScreen

| Corpus | Example | Retrieval use |
|---|---|---|
| Firm compliance policy | `OFAC escalation playbook.pdf` | “What do we do for 85% matches?” |
| Screening memos | Prior IC notes per startup | “How did we treat Alpha Ventures last round?” |
| Regulatory primers | FATF guidance summaries | Explain review-tier thresholds to analysts |
| **Not** cap-table CSVs | — | Use `screen_cap_table` tool, not vectors |

Structured screening output (`ScreeningResult`) stays tool-backed. RAG supplements **unstructured** compliance knowledge.

---

## Target architecture

```
INGEST (admin / per-firm)
  PDF/DOCX/Markdown → parse → chunk (token-aware) → embed → store

STORAGE (pick one for CapScreen)
  Option A: MongoDB Atlas Vector Search  ← aligns with existing mongoose stack
  Option B: PostgreSQL + pgvector       ← separate vector DB

QUERY (on chat turn)
  User question → embed query → hybrid retrieve (vector + lexical)
  → top-K chunks → inject into /api/chat system prompt OR new tool retrieve_compliance_docs
  → Claude cites with [N] markers → server validates quote ⊆ chunk text
```

---

## Implementation phases

### Phase 1 — Minimal (tool-only, no new DB)

- Add tool `search_compliance_playbook` reading from checked-in markdown in `backend/compliance-corpus/`
- Lexical search first; no embeddings
- Good for demos and workflow authoring

### Phase 2 — Embeddings + MongoDB

- Collection `compliance_chunks`: `{ text, embedding, source, firmId?, hash }`
- `indexComplianceDoc(file)` on upload endpoint `POST /api/compliance-docs`
- Tool `retrieve_compliance_context(query)` called by agent before answering policy questions

### Phase 3 — Full platform

- Frontend: attach compliance docs in `ChatInput` (reuse `AddDocumentsModal` patterns)
- Streaming SSE with `doc_read` / citation events (match `AssistantMessage.tsx` event types)
- Per-startup doc folders linked to `Startup` model

---

## Files to touch (existing CapScreen layout)

```
backend/src/
  lib/rag/
    chunker.ts
    embedding.ts
    retrieval.ts
    citationValidate.ts
  routes/complianceDocs.ts
  lib/chatTools.ts      — add retrieve_compliance_context tool

frontend/src/
  app/lib/screenerApi.ts
  app/components/assistant/
```

---

## Citation rules

- Server drops any citation whose `quote` is not an exact substring of the retrieved chunk.
- Assistant system prompt: never invent policy language not in retrieved context.
- UI: numbered pills → expandable source cards.

---

## When the user runs this command

1. Ask which **phase** they want (1, 2, or 3) unless clear from context.
2. Print the phase diagram and file list above.
3. Implement only the requested phase — minimal diff, reuse mongoose/Express patterns.
4. Update `.claude/agent-memory/project/rag-status.md` with what was built.
