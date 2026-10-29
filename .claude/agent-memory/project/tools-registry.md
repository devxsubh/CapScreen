---
name: tools-registry
description: Agent tools registered in backend/src/lib/tools/index.ts
metadata:
  type: reference
---

| Tool | Purpose |
|---|---|
| `screen_cap_table` | Parse CSV → graph → Watchman → classify → exposure → explain |
| `query_screening_data` | summary / list_entities / entity_detail / sanctioned_exposure |
| `generate_document` | IC memo, screening analysis, other compliance write-ups |
| `search_compliance_playbook` | Firm policy corpus |
| `list_startup_documents`, `search_startup_documents`, `screen_document_entities` | Uploaded documents |
| `list_mentioned_startups` | @-mentioned startups and their screening status |
| `list_workflows`, `read_workflow` | Workflow prompts |
| `update_plan`, `delegate_task` | Plans and read-only sub-agents |
| `web_search` | Tavily search; needs the user's approval |

**Why:** Tools are the structured "retrieval" layer — the model must call these instead of inventing screening data.

**How to apply:** New capability → new file in `lib/tools/` + one `.register()` in `lib/tools/index.ts`.
