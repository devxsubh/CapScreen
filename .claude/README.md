# Claude Code config — CapScreen

Configuration for the CapScreen VC cap-table compliance screener.

## Start here

| File | Purpose |
|---|---|
| [PROJECT.md](./PROJECT.md) | Architecture, capability map, agents list |
| [../CLAUDE.md](../CLAUDE.md) | Repo source map, env vars, dev setup |

## Slash commands (`commands/`)

| Command | Use |
|---|---|
| `/init-memory` | Claude Code project memory index |
| `/make-agent` | New custom agent + memory dir |
| `/compliance-rag-roadmap` | Plan/implement document RAG |
| `/compliance-agent-feature` | Add a chat tool end-to-end |
| `/compliance-parity-check` | Platform feature gap report |
| `/new-project-setup` | Bootstrap `.claude/` (idempotent) |

## Agents (`agents/`)

- `sanctions-screening-agent` — cap table, Watchman, graph, tools
- `compliance-security-auditor` — PII, retention, DPDP/OFAC process
- `workflow-author` — builtin workflow `prompt_md`
- `prompt-enhancer` — polish rough prompts

## Memory (`agent-memory/`)

- `project/` — checked-in seed memories (architecture, parity, tools, language)
- `{agent-name}/` — per-agent learning across sessions

## Templates (`templates/`)

- `agent-memory-system.md` — appended to every new agent
- `compliance-platform-patterns.md` — UI/agent/RAG patterns reference

## Hooks

- `hooks/log-commands.sh` — audit log → `logs/commands.jsonl` (gitignored)
