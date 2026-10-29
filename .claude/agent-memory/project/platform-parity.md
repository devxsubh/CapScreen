---
name: platform-parity
description: Gap list for agent, memory, and RAG platform features
metadata:
  type: project
---

**At parity:** Chat-first UI, workflows (single built-in source), startups, LangGraph agent with approvals/plans/sub-agents, SSE streaming, persisted chats, document RAG, one chat route for assistant + startup page.

**Open:** paused approval runs don't survive a restart (MemorySaver); tabular grid chat has no approval UI; no persistent agent memory beyond `.claude/agent-memory/`.

**Why:** Target is full compliance-platform class agent/memory/RAG in a sanctions screening product.

**How to apply:** Run `/compliance-parity-check` before planning sprints. Prioritize from the Open list.
