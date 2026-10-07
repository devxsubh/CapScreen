# /new-project-setup — Bootstrap a New Project's .claude/ Directory

Scaffold the full Claude Code project configuration for a new or existing project: settings, audit logging hook, agent directories, and memory initialization.

**CapScreen:** This repo is already bootstrapped. Read `.claude/PROJECT.md` instead of re-running blindly. Re-run only to add missing dirs (idempotent).

## Steps

### 1. Confirm target project

Run:
```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```
Store as `PROJECT_PATH`. Tell the user which directory will be bootstrapped and confirm before proceeding if it looks unexpected (e.g., cwd is `/` or a system directory).

### 2. Create directory skeleton

```bash
mkdir -p {PROJECT_PATH}/.claude/agents
mkdir -p {PROJECT_PATH}/.claude/agent-memory
mkdir -p {PROJECT_PATH}/.claude/hooks
mkdir -p {PROJECT_PATH}/.claude/logs
mkdir -p {PROJECT_PATH}/.claude/templates
mkdir -p {PROJECT_PATH}/.claude/commands
```

### 3. Write the audit log hook

Write `.claude/hooks/log-commands.sh`:

```bash
#!/usr/bin/env bash
# .claude/hooks/log-commands.sh
# Logs every tool call Claude Code makes to a JSONL file

INPUT=$(cat)   # reads the JSON payload from stdin

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
CMD=$(echo "$INPUT"  | jq -r '.tool_input.command // .tool_input.file_path // "n/a"')
SESSION=$(echo "$INPUT" | jq -r '.session_id // "n/a"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

LOG_DIR=".claude/logs"
LOG_FILE="$LOG_DIR/commands.jsonl"

mkdir -p "$LOG_DIR"

echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION\",\"tool\":\"$TOOL\",\"input\":\"$CMD\"}" >> "$LOG_FILE"

exit 0   # always exit 0 — logging should never block execution
```

Make it executable:
```bash
chmod +x {PROJECT_PATH}/.claude/hooks/log-commands.sh
```

### 4. Write settings.local.json

Write `.claude/settings.local.json` with sensible starter permissions and the audit hook wired up:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm test *)",
      "Bash(pnpm run *)",
      "Bash(npx jest *)",
      "Bash(npx tsc *)",
      "Bash(npm test *)",
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git log *)",
      "Bash(git diff *)",
      "Bash(git branch *)",
      "Bash(ls *)",
      "Bash(find . *)",
      "Bash(grep *)",
      "Bash(cat *)",
      "Bash(mkdir -p *)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/log-commands.sh"
          }
        ]
      }
    ]
  }
}
```

If `.claude/settings.local.json` already exists, **do not overwrite it**. Report that it was skipped.

### 5. Copy skill command files and template

Copy the following files from the source `.claude/` into the new project (if the source exists alongside this command file):
- `.claude/PROJECT.md`
- `.claude/commands/make-agent.md`
- `.claude/commands/init-memory.md`
- `.claude/commands/compliance-rag-roadmap.md`
- `.claude/commands/compliance-agent-feature.md`
- `.claude/templates/agent-memory-system.md`
- `.claude/templates/compliance-platform-patterns.md`

To copy: read each file and write it verbatim to the same relative path under `{PROJECT_PATH}/.claude/`.

Skip any file that already exists at the destination.

### 6. Initialize project memory

Run the `/init-memory` logic inline:
- Derive the escaped project path
- Create `~/.claude/projects/{escaped}/memory/`
- Write empty `MEMORY.md` index (skip if already present)

### 7. Add .gitignore entries

Append to `{PROJECT_PATH}/.gitignore` (create if missing):
```
# Claude Code
.claude/logs/
```

Do not add this if the pattern is already present.

### 8. Report

```
Project bootstrap complete for: {PROJECT_PATH}

Created:
  .claude/settings.local.json   — permissions + audit hook
  .claude/hooks/log-commands.sh — tool-call audit logger
  .claude/agents/               — drop agent .md files here
  .claude/agent-memory/         — agent memory dirs go here
  .claude/commands/             — slash command skill files
  .claude/templates/            — reusable boilerplate
  .claude/logs/                 — audit log (git-ignored)
  ~/.claude/projects/.../memory/MEMORY.md — project memory index

Next steps:
  1. Run /make-agent <name>  to create your first custom agent
  2. Run /init-memory        if you need to re-init project memory
  3. Edit settings.local.json to add project-specific Bash permissions
  4. Write a CLAUDE.md at the project root with architecture notes
```

## Notes

- This command is idempotent — re-running it on an existing project skips files that already exist rather than overwriting them.
- The audit log hook requires `jq` to be installed on the system (`brew install jq` / `apt install jq`).
- After bootstrap, copy the `.claude/` folder to any new project to carry all these skills along.
