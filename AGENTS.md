# AGENTS.md — CapScreen VC Sanctions & Cap-Table Screener

> **Claude Code:** Read `.claude/PROJECT.md` for platform capability map, custom agents, memory layout, and RAG roadmap. Slash commands live in `.claude/commands/`.

## Project Overview

A **desktop app** (Electron) that screens startup cap tables for sanctions risk. Users create "startups," upload cap-table CSVs, and get a risk report with an ownership graph, entity risk table, and an AI-written plain-English narrative. **All data stays on the user's computer**: SQLite database, local files, bundled sanctions engine. AI runs on-device (Ollama/LM Studio) or with the user's own cloud API keys, chosen in the in-app **AI Control Center**.

**It never decides guilt.** It narrows the review set for a human compliance officer.

The only cloud piece is a small **auth service** (accounts + sign-in, on Vercel + Atlas); no screening data goes there. No EC2, R2 or Upstash.

---

## Architecture

**Canonical doc:** `docs/DESKTOP_PLAN.md`

### Runtime topology

```
Electron main (desktop/src/main.ts)
 ├─ Watchman sidecar   127.0.0.1:<free port>   self-built Go binary (no libpostal) — OFAC/EU lists
 ├─ Backend            127.0.0.1:<free port>   Express, utilityProcess; per-launch token required
 │    ├─ SQLite        <userData>/capscreen.db  mongoose models via lib/infra/sqliteStore
 │    └─ Files         <userData>/files/
 ├─ UI (Next.js)       127.0.0.1:<free port>   standalone server, utilityProcess
 └─ Window loads capscreen://app  → protocol.ts proxies UI + /__api/* (adds token)
```

`<userData>` = `~/Library/Application Support/CapScreen` (macOS), `%APPDATA%/CapScreen` (Windows).

Network egress: public sanctions-list downloads (Watchman, every 12 h) and cloud LLM calls **only** when the user assigns a cloud model. Local-only mode blocks the latter in `getLlm()`.

### Backend stack

- `express` + `helmet`, `cors`; loopback-only; `middleware/desktopToken.ts` gate; single local user (`middleware/requireAuth.ts`)
- **SQLite via mongoose**: `lib/infra/sqliteStore/` implements the MongoDB driver surface mongoose calls (`node:sqlite`, no native deps). All mongoose models/queries run unchanged. `$vectorSearch` is in-process cosine.
- **Pluggable LLMs** (`lib/llm/providers/`): Anthropic, native Ollama, and OpenAI-compatible (OpenAI, Gemini, OpenRouter, Groq, LM Studio, llama.cpp, any custom endpoint). Roles: `agent`, `utility`, `embedding`.
- **AI Control Center** (`lib/llm/controlCenter/`, `routes/aiControlCenter.ts`): providers, model assignments, local-only policy; API keys AES-256-GCM encrypted with a master key sealed by the OS keychain (Electron `safeStorage`).
- `@langchain/langgraph` — the assistant's agent graph (orchestration only; models still go through `lib/llm/providers/`)
- `graphology` — directed ownership graph (BFS traversal, circular ownership detection)
- Watchman — `GET /v2/search`; every screening result stores `watchmanListInfo` (list counts + SHA-256 per list)

### Frontend stack

- Next.js App Router, React 19, TypeScript — built `output: "standalone"` for the desktop bundle
- Tailwind CSS + Shadcn/ui; `@xyflow/react` ownership graph; `recharts`
- `lib/apiBase.ts` — backend origin comes from the preload bridge (`window.capscreenDesktop`); never read `NEXT_PUBLIC_API_BASE_URL` directly
- `lib/desktop.ts` — typed bridge (`useDesktop()` for render-time use; hydration-safe)

---

## Accounts & sign-in (cloud auth service)

Accounts are the **only** cloud component. Sign-in works like Claude Code: the app opens the browser, the user signs in on the hosted portal, the browser hands a one-time code back to a loopback listener, and the app exchanges it (PKCE) for a session sealed in the OS keychain. Cap tables, documents and screenings never leave the machine.

| Piece | Where |
|---|---|
| Auth service (Express) | `backend/src/authService/app.ts` — mounts `routes/auth.ts` (signup/signin/verify/reset) + `routes/desktopOAuth.ts` (RFC 8252 + PKCE) + portal |
| Hosted portal (sign-in UI) | `backend/src/authService/portal.ts` — one self-contained page; serves `/desktop/authorize`, `/verify-email`, `/reset-password` |
| Vercel entry | `backend/api/index.ts`, `backend/vercel.json` (project root: `backend/`) |
| Accounts DB | MongoDB Atlas — `CAPSCREEN_DB=mongodb` switches `lib/infra/db.ts` to Atlas (auth service only) |
| Desktop client | `desktop/src/authFlow.ts` (protocol, Electron-free) + `desktop/src/session.ts` (keychain, restore, 14-day offline grace, refresh every 12 h) |
| Gate | `desktop/src/main.ts` + `splash.ts` (`signInHtml`) — shown until signed in; sidecars boot in parallel |
| Attribution | Shell writes `<userData>/identity.json`; `middleware/requireAuth.ts` uses it for `userEmail` (audit, reviews). Data owner stays `local-user`. |

Auth service env (Vercel): `CAPSCREEN_DB=mongodb`, `MONGODB_URI`, `JWT_ACCESS_TOKEN_SECRET_PRIVATE`/`_PUBLIC` (`pnpm --filter vc-screener-backend run generate:jwt-keys`), `FRONTEND_URL` = the service's own URL (email links), `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (email verification; without it signups are auto-confirmed), optional `DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS` (default 30).

Desktop: production auth URL is `capscreenAuthUrl` in `desktop/package.json` (override with `CAPSCREEN_AUTH_URL`). Dev defaults to `http://127.0.0.1:4100` — run `pnpm --filter vc-screener-backend auth:dev`, or skip sign-in with `CAPSCREEN_SKIP_AUTH=1` (dev only).

---

## Key Data Flow

```
User uploads CSV (or drops it in a watched folder)
  → POST /api/startups/:id/csvs        (ingest + store in SQLite)
  → POST /api/startups/:id/screen      (or the agent's screen_cap_table tool via POST /chat)
      → runScreening: ingestCsv → buildOwnershipGraph → searchWatchman → classifyScore
                      → ownership rules (OFAC 50% / UBO 25%) → explainMatch (LLM narrative)
      → ScreeningResult (+ watchmanListInfo) saved as lastScreeningResult, snapshot + delta
  → ScreeningResultsPanel: OwnershipGraph + RiskTable + RiskCards
```

Screening fails **closed**: if Watchman is unavailable, `runScreening` throws instead of returning "clear".

---

## Dev Setup

```bash
pnpm install
pnpm --filter capscreen-desktop run build:watchman   # once; needs Go 1.24+ (brew install go)
pnpm desktop                                         # Electron + backend (tsx) + Next dev, all sidecars
```

`pnpm desktop` uses `~/Library/Application Support/CapScreen` like the packaged app. Configure models in the app's **AI Control Center** (or install Ollama and click "Use on-device AI"). Dev-only: `CAPSCREEN_REMOTE_DEBUG=9333` exposes CDP on loopback for automation.

Browser-only dev without Electron (`pnpm dev`) still works: the backend falls back to root `.env` (`LLM_PROVIDER`/`LLM_MODEL`/keys, see `.env.example`), data in `~/.capscreen`, and Watchman via `docker compose -f docker-compose.dev.yml up`. When launched by Electron (`CAPSCREEN_DESKTOP_TOKEN` set) the backend never reads `.env`.

### Packaging

```bash
pnpm --filter capscreen-desktop run dist:mac   # → desktop/release/CapScreen-<ver>-arm64.dmg (+ x64)
pnpm --filter capscreen-desktop run dist       # all targets in electron-builder.yml
```

Build each OS on that OS (Next's traced `sharp` binary is platform-specific). Unsigned unless `CSC_*` signing env is set — sign + notarize before distributing.

---

## Backend Source Map

```
backend/src/
  index.ts                  — Express app (loopback, desktop-token gate), route mounts
  routes/
    assistantChat.ts        — POST /chat (+ /chat/runs/:id/resume): the one agent route, SSE
    screen.ts               — POST /api/screen/explain (on-demand analyst narrative)
    startups/               — /api/startups CRUD, CSVs, scoped chat, document search uploads
    screening/              — POST /api/startups/:id/screen, delta, report, entity reviews
    documents/              — IC memo, generated-document download, uploaded documents
    projects/               — GET /projects (startups + their documents, CSVs, screenings)
    tabularReview.ts        — grids, cell generation, grid chat
    workflows.ts            — built-in + custom workflows, hide/unhide
    portfolioMonitoring.ts  — portfolio grid sync, re-screen, digest, compare
    aiControlCenter.ts      — /api/ai: providers, keys, roles, local models
    desktopData.ts          — /api/desktop: settings, sanctions lists, backup/restore, audit export
    auth.ts, desktopOAuth.ts— cloud auth service only (mounted by authService/app.ts)
  lib/
    screening/              — runScreening, csvIngest, parseCapTable, graph, watchman, classify,
                              ownershipExposure, explain, delta, preview, confidence
    agent/                  — LangGraph harness (docs/AGENT_HARNESS.md): agentGraph, runTools
    tools/                  — ToolRegistry + the 13 agent tools (index.ts registers them)
    llm/                    — provider adapters, registry (roles agent/utility/embedding), controlCenter/
    chat/                   — system prompt assembly, @-mentions, project assets, payload validation
    rag/                    — parse, chunk, embed, retrieve, entity extraction
    workflows/              — builtinWorkflows.ts (single source for agent + UI), workflowMemory.ts
    infra/                  — db (SQLite via sqliteStore/), backup, folderWatch, fileStorage, settings, Watchman cache
  models/                   — mongoose schemas (screening/, chat/, documents/, rag/, tabular/, workflows/, audit/, auth/)
  types/screening.ts        — screening domain types (re-exported by the frontend)
backend/test/               — node:test suites (CSV ingest, ownership math/rules, SQLite store, workflows)
```

### Agent chat (`routes/assistantChat.ts` + `lib/tools/`)

One route serves the assistant, the startup page chat and (with approvals off) tabular grid chat. Tools:
`update_plan`, `delegate_task`, `list_workflows`, `read_workflow`, `screen_cap_table`, `list_mentioned_startups`,
`query_screening_data`, `generate_document`, `search_compliance_playbook`, `list_startup_documents`,
`search_startup_documents`, `screen_document_entities`, `web_search` (needs the user's approval).

The caller sends `{ messages, csvContent?, screeningResult?, startup_id?, attached_documents? }`. When a CSV is
attached and nothing has been screened yet, the first turn is forced to call `screen_cap_table`
(`backend/docs/tool-routing-analysis.md`). Add a tool: create it in `lib/tools/`, register it in `lib/tools/index.ts`.

---

## Frontend Source Map

```
frontend/src/
  app/
    (pages)/
      assistant/            — compliance assistant (InitialView → ChatView)
      startups/             — StartupsPage; [id] = StartupScreenerPage (the one startup workspace); [id]/assistant/chat/[chatId] redirects to it
      tabular-reviews/      — review list + TRView
      workflows/            — WorkflowList + workflow editor
      settings/             — Settings: account, ai (AI Control Center), screening (thresholds), sanctions, data (backup & audit), about
      account/              — signed-in account (from the desktop shell)
    components/
      screen/               — ScreeningResultsPanel, OwnershipGraph, RiskTable, RiskCard, EntityDetailModal, …
      startups/             — StartupsPage, StartupScreenerPage, StartupChatPanel, StartupAnalysisDock, StartupDocumentsPanel, CSV views, banners
      assistant/            — ChatView, ChatInput, AssistantMessage, ApprovalCard, AgentPlan, side panel
      tabular/, workflows/, ai/, projects/ (ProjectExplorer), shared/
    hooks/
      useAssistantChat.ts   — assistant chat state + SSE handling (approvals, plans, screening results)
      useScreenerChat.ts    — startup page chat on POST /chat (keeps CSV + result across turns, approvals)
    lib/
      capScreenApi.ts       — projects, documents, chats, tabular, workflows
      screenerApi.ts        — startup chat stream + resume, tool labels
  lib/
    screenerTypes.ts        — re-exports backend/src/types/screening.ts (+ a few UI-only types)
    startupsApi.ts, aiControlCenterApi.ts, desktopDataApi.ts, portfolioApi.ts
    apiBase.ts, desktop.ts  — backend origin + typed preload bridge
  contexts/                 — AuthContext / UserProfileContext (identity from the desktop shell)
```

---

## Routing

| URL | Component | Notes |
|---|---|---|
| `/assistant`, `/assistant/chat/:id` | Compliance assistant | Primary chat shell |
| `/startups` | `StartupsPage` | List + create startups |
| `/startups/:id` | `StartupScreenerPage` | The startup workspace: chat on the left; Cap table, Graph, Entities, Flags and Documents tabs on the right. Choose startup, the Startups list and workflows run on a startup all open it |
| `/startups/:id/assistant/chat/:chatId` | Redirect | Old startup chat links land on `/startups/:id` |
| `/startups/:id/tabular-reviews/:reviewId`, `/tabular-reviews[/:id]` | Tabular review | |
| `/workflows[/:id]` | Workflows | Built-ins come from `GET /workflows` |
| `/settings/account` | Account | Signed-in account; password changes happen on the hosted portal (`/account` redirects here) |
| `/settings/ai` | AI Control Center | Providers, BYO keys, local models, model assignments, local-only mode (`/ai` redirects here) |
| `/settings/screening` | Screening | Match-score and ownership thresholds (never looser than OFAC 50% / UBO 25%); recorded on every result |
| `/settings/sanctions` | Sanctions data | Sanctions lists/versions, background re-screening |
| `/settings/connectors` | Connectors | Upcoming integrations (all coming soon); choose which appear in the chat's Files & Sources menu |
| `/settings/data` | Backup & audit | Encrypted backup/restore, audit export |
| `/settings/about` | About | Version, data folder, engine/AI status, diagnostics |

---

## Sample Data

`backend/sample-data/sample-cap-table.csv` — Series A demo cap table (NexaFlow AI Inc; strict 5-column format). Walkthrough: `backend/sample-data/DEMO.md`.

`backend/sample-data/sample-entity-roster.csv` — flat entity list for roster screening mode.

**CSV ingest** (`backend/src/lib/screening/csvIngest.ts`): strict → heuristic column aliases → Claude schema inference. Supports cap tables (varied column names) and entity rosters. Reference/metadata files (e.g. OpenSanctions sources catalogs) are blocked with guidance. Required fields: cap table needs `entity`, `owner`, `ownership_pct`; roster needs `name`. Watchman matching stays deterministic — AI only maps columns, never decides hits.

---

## Claude Code / platform parity

| Capability | Status | Command / doc |
|---|---|---|
| Agent graph (LangGraph) | ✅ | `backend/src/lib/agent/agentGraph.ts`, `docs/AGENT_HARNESS.md` |
| Parallel tools, sub-agents, plans | ✅ | `lib/agent/runTools.ts`, `lib/tools/delegateTool.ts`, `lib/tools/planTool.ts` |
| Human approval for sensitive tools | ✅ | LangGraph `interrupt()` + `needsApproval` in `lib/tools/registry.ts`, `POST /chat/runs/:id/resume` |
| Pluggable / local models | ✅ | `backend/src/lib/llm/providers/` |
| Desktop app (Electron) | ✅ | `desktop/`, `docs/DESKTOP_PLAN.md` |
| AI Control Center (BYO keys, local models) | ✅ | `/settings/ai`, `backend/src/routes/aiControlCenter.ts` |
| Persistent agent memory | ✅ seeded | `.claude/agent-memory/project/` |
| Document RAG | ✅ local embeddings | `backend/src/lib/rag/` |
| Chat-first UI shell | ✅ restored | `frontend/.../assistant/` |
| Gap audit | — | `/compliance-parity-check` |

---

## Common Commands

```bash
# Root (pnpm workspace)
pnpm install                        # install all workspaces
pnpm desktop                        # run the desktop app (dev)
pnpm desktop:dist                   # build installers
pnpm dev                            # browser-only dev: backend + frontend on host
pnpm -w run typecheck               # backend tsc (src, scripts, tests)
pnpm -w run test                    # backend tests (node:test)
pnpm -w run lint                    # frontend eslint

# Desktop only
pnpm --filter capscreen-desktop run build:watchman   # build Watchman binaries (Go)
pnpm --filter capscreen-desktop run typecheck
pnpm --filter capscreen-desktop run dist:mac

# Backend only
pnpm --filter vc-screener-backend run dev
pnpm --filter vc-screener-backend run build
pnpm --filter vc-screener-backend run typecheck
pnpm --filter vc-screener-backend run test

# Frontend only
pnpm --filter capscreen run dev
pnpm --filter capscreen run build
pnpm --filter capscreen run lint

# Watchman for browser-only dev (the desktop app bundles its own)
docker compose -f docker-compose.dev.yml up
```

## TypeScript / Lint Notes

- Backend: strict TypeScript via `tsc`. No `any` casts without reason.
- Frontend: Next.js ESLint config. Typecheck, tests and lint run before every commit via Husky.
- Do not use `console.log` in production paths — backend uses `console.log` only for startup messages.
