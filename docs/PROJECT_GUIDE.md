# CapScreen: Complete Project Guide

A study guide to the whole repository: what the product does, how the pieces fit, every package, every module and every file, the dependencies, and what is still unfinished.

Snapshot: branch `cleanup/simplify` (based on `main` at `1ba6998`), about 430 tracked files and 54,000 lines of TypeScript/TSX, plus `pnpm-lock.yaml`. Section 20 lists what the cleanup on this branch removed or changed.

---

## Table of contents

1. [What CapScreen is](#1-what-capscreen-is)
2. [Repository at a glance](#2-repository-at-a-glance)
3. [Runtime architecture](#3-runtime-architecture)
4. [End-to-end flows](#4-end-to-end-flows)
5. [Workspace, tooling and CI](#5-workspace-tooling-and-ci)
6. [Backend package (`backend/`)](#6-backend-package-backend)
7. [Screening engine in depth](#7-screening-engine-in-depth)
8. [Agent harness and tools](#8-agent-harness-and-tools)
9. [LLM providers and the AI Control Center](#9-llm-providers-and-the-ai-control-center)
10. [Local data layer](#10-local-data-layer)
11. [Cloud auth service](#11-cloud-auth-service)
12. [Desktop package (`desktop/`)](#12-desktop-package-desktop)
13. [Frontend package (`frontend/`)](#13-frontend-package-frontend)
14. [Workflows and tabular review](#14-workflows-and-tabular-review)
15. [Security model](#15-security-model)
16. [Environment variable reference](#16-environment-variable-reference)
17. [Dependency reference](#17-dependency-reference)
18. [Sample data, corpus and other assets](#18-sample-data-corpus-and-other-assets)
19. [Claude Code configuration (`.claude/`)](#19-claude-code-configuration-claude)
20. [Cleanup log, known gaps and findings](#20-cleanup-log-known-gaps-and-findings)
21. [Commands cheat sheet](#21-commands-cheat-sheet)
22. [Glossary](#22-glossary)
23. [Suggested study order](#23-suggested-study-order)

---

## 1. What CapScreen is

CapScreen is a **desktop app** (Electron) for venture-capital firms. A user creates a *startup* workspace, uploads its cap table as a CSV, and CapScreen:

1. Parses the CSV into ownership records (strict format, column aliases, or LLM-inferred schema).
2. Builds a directed **ownership graph** and walks every chain to the **ultimate beneficial owners (UBOs)**, including people hidden behind several layers of holding companies.
3. Screens **every node** against sanctions lists (OFAC SDN, EU Consolidated, and others) using **Watchman**, an open-source Go matching engine bundled with the app.
4. Classifies each entity as **clear / review / flagged** from the match score, then applies ownership rules (OFAC 50% rule, 25% beneficial-owner threshold).
5. Has an LLM write a short analyst note for each review/flagged entity.
6. Shows an interactive ownership graph, a risk table and risk cards, with a chat assistant beside them.

**Non-negotiable product principles** (repeated in `PRD.md`, `.claude/PROJECT.md`, and every system prompt):

- **Decision support only.** It never decides guilt. It narrows the review set for a human compliance officer.
- **Matching is deterministic.** Watchman decides matches. The AI only maps CSV columns and narrates results. The model is never asked "is this person sanctioned?"
- **Fails closed.** If Watchman is unreachable, screening throws instead of returning "clear".
- **Data stays local.** Cap tables, documents and screening results live in a local SQLite database. The only cloud piece is a small accounts/sign-in service. Cloud LLM calls happen only if the user assigns a cloud model, and "local-only mode" blocks them.

Origin story (from `PRD.md`): the screener was first designed as a case study inside an existing legal-AI workspace with four surfaces (Assistant, Startups/Projects, Tabular Review, Workflows), then converted into a standalone desktop app (`docs/DESKTOP_PLAN.md`, decisions dated 2026-10-25). Most leftovers from that history (login pages, sharing, document versioning and tracked-change editing, cloud storage code) were removed on this branch; a few traces remain and are listed in section 20.

---

## 2. Repository at a glance

```
rtp/                                   (repo; product name "CapScreen")
├── package.json                       root scripts, husky, pnpm build allow-list
├── pnpm-workspace.yaml                workspaces: backend, frontend, desktop
├── pnpm-lock.yaml                     lockfile (pnpm 10.6.5)
├── AGENTS.md / CLAUDE.md              agent instructions (CLAUDE.md just includes AGENTS.md)
├── README.md                          product overview, getting started
├── PRD.md                             product requirements (case-study era)
├── .env.example                       env vars for browser-only dev and the auth service
├── .gitignore
├── .husky/pre-commit                  typecheck + tests + lint before each commit
├── .github/workflows/ci.yml           GitHub Actions: typecheck, tests, lint, builds
├── docker-compose.dev.yml             Watchman only, for browser-only dev
├── docs/
│   ├── DESKTOP_PLAN.md                desktop conversion plan + status (canonical architecture doc)
│   ├── AGENT_HARNESS.md               LangGraph agent design
│   ├── architecture-diagram.svg       runtime topology picture
│   ├── screening-flow.svg             screening pipeline picture
│   └── PROJECT_GUIDE.md               this file
├── backend/      (package vc-screener-backend)  Express API + screening engine + auth service + tests
├── frontend/     (package capscreen)            Next.js 16 UI
├── desktop/      (package capscreen-desktop)    Electron shell, sidecar supervisor, packaging
└── .claude/                           Claude Code agents, slash commands, memory, hooks
```

| Package | What it is |
|---|---|
| `backend/` | Express API (`src/index.ts`), screening pipeline, LLM provider layer, LangGraph agent, RAG, SQLite store, cloud auth service, scripts, tests, sample data |
| `frontend/` | Next.js App Router UI: assistant chat, startups, screening panels, tabular review, workflows, AI Control Center, data & backup |
| `desktop/` | Electron main process: starts Watchman/backend/UI on loopback, `capscreen://` protocol, keychain vault, sign-in, tray, packaging scripts |

---

## 3. Runtime architecture

### 3.1 Desktop runtime topology (the real product)

```
Electron main  (desktop/src/main.ts)
 ├─ Watchman sidecar   127.0.0.1:<free port>   self-built Go binary (no libpostal); OFAC/EU lists
 ├─ Backend            127.0.0.1:<free port>   Express in an Electron utilityProcess; per-launch token
 │    ├─ SQLite         <userData>/capscreen.db   mongoose models via lib/infra/sqliteStore
 │    └─ Files          <userData>/files/
 ├─ UI (Next.js)       127.0.0.1:<free port>   standalone server in a utilityProcess
 └─ BrowserWindow loads capscreen://app
      capscreen://app/...        → proxied to the Next server
      capscreen://app/__api/...  → proxied to the backend, x-capscreen-token added in main
```

- `<userData>` is `~/Library/Application Support/CapScreen` (macOS) or `%APPDATA%/CapScreen` (Windows).
- Ports are random on every launch. The fixed `capscreen://app` origin keeps `localStorage` stable across launches and keeps the backend token out of the renderer entirely.
- In dev (`pnpm desktop`) the window loads the Next dev server directly and the token is injected into backend requests with `session.webRequest.onBeforeSendHeaders`.

### 3.2 Network egress

Only three things leave the machine:

1. **Sanctions-list downloads** by Watchman (OFAC Treasury, EU webgate) every 12 h. The shell also keeps an offline snapshot (`desktop/src/listCache.ts`) and starts Watchman from it when an online start fails.
2. **Sign-in** traffic to the hosted auth service (accounts only).
3. **Cloud LLM / embedding calls**, only when the user assigns a cloud model in the AI Control Center. Local-only mode blocks them in `getLlm()`. The optional `web_search` tool (Tavily) asks the user to approve each query first.

### 3.3 Browser-only dev mode

`pnpm dev` runs the backend on :3001 and Next on :3000 without Electron. The backend reads the root `.env` (`LLM_PROVIDER`, keys …), stores data in `~/.capscreen/`, and needs Watchman from `docker compose -f docker-compose.dev.yml up`. There is no desktop token in this mode, so the API is loopback-only but open. The earlier server deployment (EC2 + Vercel + Atlas + R2 + Upstash) is gone from the tree.

---

## 4. End-to-end flows

### 4.1 App launch

1. `desktop/src/main.ts` registers the `capscreen://` scheme, creates the window with a splash page and calls `start()`.
2. `start()` kicks off `boot()` **in parallel** with sign-in:
   - `loadMasterKey()` (`vault.ts`) unseals or creates a 32-byte master key with Electron `safeStorage` (OS keychain).
   - `startWatchman()` (`sidecars.ts`) reaps a stale Watchman PID, writes a config for the chosen lists, launches the binary, waits for it (falls back to the offline snapshot if downloads fail).
   - `startFrontend()` and `startBackend()` run in parallel on free ports. The backend receives `CAPSCREEN_DATA_DIR`, `CAPSCREEN_DESKTOP_TOKEN`, `CAPSCREEN_MASTER_KEY`, `WATCHMAN_URL`, `CAPSCREEN_API_ORIGIN`, `CAPSCREEN_CORPUS_DIR`, `FRONTEND_URL`. Variables that would redirect it to cloud services (`CAPSCREEN_DB`, `MONGODB_URI`, `RESEND_API_KEY`, `LLM_CONFIG_FILE`) are deleted from its env.
   - Protocol handler installed (packaged) or token injector (dev); notification poller and sanctions-settings watcher start.
3. Meanwhile `restoreSession()` (`session.ts`) tries to refresh the sealed refresh token. If that fails, the sign-in gate (`splash.ts` `signInHtml`) is shown until the browser round trip completes. Offline, a session up to 14 days old is accepted.
4. When both finish, the window loads `capscreen://app/` → Next redirects `/` to `/assistant`.

Supervision: sidecars restart with backoff after a crash (give up after 5 quick failures). Exit code **75** means "restart me" (used after a backup restore). Logs go to `<userData>/logs/<name>.log` (rotated past 10 MB) and `main.log`.

### 4.2 Screening a cap table from a startup page

```
StartupScreenerPage  (frontend)
  → POST /api/startups/:id/csvs/analyze          preview: ingest + graph stats + ETA (buildScreeningPreview)
  → POST /api/startups/:id/csvs                  store CapTableCsv (parse status, csvKind, mapping…), audit csv_uploaded
  → POST /api/startups/:id/screen {csvId,purpose}
        runScreening(csv)
          assertWatchmanAvailable()   ← fails closed
          fetchWatchmanListInfo()     ← list counts + SHA-256 per list, stamped on the result
          ingestCsv()                 ← strict → heuristic aliases → LLM schema inference
          buildEntityHintsMap()       ← optional alt names / DOB / address / country / reg-id
          buildOwnershipGraph() → getAllNodes / getEdges / getStartupNode
          searchWatchman() for every node in parallel (cached 5 min, de-duplicated in flight)
          classifyScore() → findOwnershipPath() (BFS) → resolveUltimateOwners()
          explainMatch() for review/flagged entities in parallel (LLM "utility" role)
          enrichEntityWithOwnershipExposure()  ← effective stake, OFAC 50%, UBO 25%, escalation
          sort flagged → review → clear; attachConfidence()
        save to Startup.lastScreeningResult (or co-investor / vendor slot)
        saveScreeningSnapshot() → delta vs previous run
        syncPortfolioMonitoringReview()  ← keeps the portfolio tabular grid current
        AuditLog screening_completed
  ← ScreeningResult → ScreeningResultsPanel (OwnershipGraph + RiskTable + RiskCards)
```

### 4.3 Chat turn

There is **one agent route**, `POST /chat`, used by the assistant (`useAssistantChat`) and by the startup page chat (`useScreenerChat`, which sends `startup_id`).

Each message may carry `workflow` and `focus` (the composer's Tools choice: `screen`, `review`, `ownership`, `research`, `memo`); the latest user message's focus adds a matching instruction to the system prompt (`FOCUS_INSTRUCTIONS` in `routes/assistantChat.ts`).

```
POST /chat (SSE)  { messages, chat_id?, csvContent?, screeningResult?, startup_id?, attached_documents?, displayed_doc? }
  parse + validate (≤50 messages, ≤16 KB each)
  resolve @mentions → load their saved screenings
  buildWorkflowStore()  (built-in + custom assistant workflows)
  buildSystemPrompt()   (tool routing hints, prompt-injection guard, CSV/mention/workspace context)
  first turn with a CSV and no result yet → toolChoice forces screen_cap_table
  runAgent()  → LangGraph: callModel ⇄ runTools (≤ 8 rounds), askApproval for web_search
  SSE events: chat_id, content_delta, tool_call_start, screening_progress, screening_result,
              final_result, plan_updated, workflow_applied, document_created, approval_required,
              error {message}, [DONE]
If paused for approval → UI shows ApprovalCard → POST /chat/runs/:runId/resume {approved}
  → AuditLog agent_tool_approval → resumeAgent() streams the rest
```

Chat history is saved by the client: assistant chats with `PUT /api/chats/:id/messages`, the startup page chat with `PUT /api/startups/:id/chat`. The forced first-turn tool call exists because small models did not route that case reliably (`backend/docs/tool-routing-analysis.md`).

### 4.4 Desktop sign-in (RFC 8252 loopback + PKCE)

1. App listens on `127.0.0.1:<random>/callback`, creates a PKCE verifier/challenge (S256) and random `state`.
2. Opens the browser at `<authUrl>/desktop/authorize?redirect_uri&state&code_challenge`.
3. User signs in on the hosted portal (`authService/portal.ts`); the portal calls `POST /api/auth/desktop/authorize-code` with its access token and receives a one-time code (only loopback HTTP redirect URIs are accepted).
4. Browser lands on the loopback callback with `?code&state`; the app checks `state` and exchanges `code + code_verifier` at `POST /api/auth/desktop/token`.
5. Session is sealed with `safeStorage` into `<userData>/vault/session.sealed`; a non-secret `identity.json` is written for the backend's audit attribution. Refresh every 12 h; revoke on sign-out.

---

## 5. Workspace, tooling and CI

### 5.1 Root files

| File | Purpose |
|---|---|
| `package.json` | `capscreen-monorepo`, `packageManager: pnpm@10.6.5`. Scripts: `prepare` (husky), `clean`, `dev` (backend + frontend in parallel), `build`, `typecheck`, `test`, `lint`, `desktop`, `desktop:dist`. `pnpm.onlyBuiltDependencies` allows install scripts for `electron`, `esbuild`, `sharp`, `unrs-resolver`. Only devDependency: `husky`. |
| `pnpm-workspace.yaml` | Workspaces `backend`, `frontend`, `desktop`. |
| `.husky/pre-commit` | Runs backend typecheck, backend tests, frontend lint; any failure blocks the commit. |
| `.github/workflows/ci.yml` | On push/PR to `main`: job `quality` (install, backend typecheck, backend tests, frontend lint), then `build-backend` and `build-frontend` in parallel. Node 22, pnpm 10.6.5, concurrency cancels stale runs. |
| `.gitignore` | node_modules, build outputs, all `.env*` except examples, logs, `.claude/logs/`, tsbuildinfo, `.vercel`, desktop build artifacts (`desktop/resources/{bin,backend,frontend}`, `desktop/release`). |
| `docker-compose.dev.yml` | Watchman only (`moov/watchman:static`) on `localhost:8084` for `pnpm dev`. |
| `.env.example` | Env vars for browser-only dev and the auth service (section 16). |
| `AGENTS.md` / `CLAUDE.md` | Instructions for coding agents; `CLAUDE.md` is `@AGENTS.md` plus an empty "Claude Code only" section. |

### 5.2 TypeScript configuration

| Package | Target / module | Notable |
|---|---|---|
| backend | ES2022 / CommonJS, `strict` | `tsconfig.json` builds `src/` to `dist/`; `tsconfig.typecheck.json` extends it to also check `scripts/` and `test/` (used by `pnpm typecheck`) |
| desktop | ES2022 / CommonJS, `strict` | Compiles `src/` to `dist/` (main entry `dist/main.js`) |
| frontend | ES2017 / ESNext, bundler resolution, `strict`, `noEmit` | `@/*` → `./src/*`, Next plugin; type-only imports from `backend/src/types/screening.ts` |

### 5.3 Lint, format and tests

- Frontend: ESLint 9 flat config (`eslint-config-next` core-web-vitals + typescript), with `react-hooks/set-state-in-effect` downgraded to a warning. 0 errors; 127 warnings remain (mostly `set-state-in-effect` and unused `node` params in react-markdown renderers).
- Backend: no ESLint; `prettier` is installed but has no script. Type safety comes from `tsc`.
- Tests: `backend/test/*.test.ts`, run with Node's built-in runner through `tsx --test` (no extra test framework). Section 6.9 lists them.

---

## 6. Backend package (`backend/`)

Package name `vc-screener-backend`, license AGPL-3.0-only, Node ≥ 22.12 (needs `node:sqlite`).

### 6.1 Scripts

| Script | Command | Use |
|---|---|---|
| `dev` | `tsx watch src/index.ts` | Local API with reload |
| `build` | `tsc && cp -r src/assets dist/assets` | Compile to `dist/` |
| `typecheck` | `tsc -p tsconfig.typecheck.json` | Pre-commit / CI gate (src, scripts, tests) |
| `test` | `tsx --test test/*.test.ts` | Unit + integration tests |
| `start` | `node dist/index.js` | Run compiled build |
| `generate:jwt-keys` | `scripts/generate-jwt-keys.sh` | RS256 key pair for the auth service |
| `seed:demo` | `tsx scripts/seed-demo-startup.ts` | Seed the NexaFlow demo workspace |
| `db:reset` | `tsx scripts/reset-database.ts` | Interactive data reset |
| `auth:dev` | `tsx watch src/authServer.ts` | Run the cloud auth service locally on :4100 |

### 6.2 Entry points

| File | Role |
|---|---|
| `src/index.ts` | The local API. helmet (no CSP), CORS (allows `FRONTEND_URL`, `capscreen://app`, any loopback origin), `desktopToken` gate, cookie parser, 10 MB JSON body limit, all routers, `/health`, 404 and error handlers. Listens on `HOST` (default `127.0.0.1`). On start: opens the DB, logs RAG/web-search warnings, prints the LLM binding, pings the agent model (`validateLlmLive`), pings Watchman, starts the re-screen scheduler and folder watcher. Graceful shutdown on SIGTERM/SIGINT with a 10 s force-exit. |
| `src/loadEnv.ts` | Loads root `.env`, `.env.local`, then `backend/.env`, `backend/.env.local` **only when not launched by Electron** (`CAPSCREEN_DESKTOP_TOKEN` unset). |
| `src/authServer.ts` | Runs the cloud auth service locally (`AUTH_PORT`, default 4100). |
| `src/authService/app.ts` | `createAuthApp()`: logs JWT/email configuration warnings, strict CSP, `trust proxy 1`, 100 KB body limit, mounts `/api/auth/desktop` and `/api/auth`, serves the portal page at `/`, `/signin`, `/desktop/authorize`, `/verify-email`, `/reset-password`. |
| `src/authService/portal.ts` | `portalHtml()`: one self-contained HTML page (inline CSS/JS, light/dark) that drives sign-in, sign-up, verify, reset and the desktop hand-off. |
| `src/authService/logo.ts` | Inline brand SVG for the portal. |
| `api/index.ts` | Vercel serverless entry: `export default createAuthApp()`. |
| `vercel.json` / `.vercelignore` | Project root `backend/`; no build step; all paths rewrite to `/api`; 30 s max duration. Keeps keys, DB files, scripts, sample data and docs out of uploads. |

### 6.3 Middleware (`src/middleware/`)

| File | What it does |
|---|---|
| `desktopToken.ts` | If `CAPSCREEN_DESKTOP_TOKEN` is set, every request (except `OPTIONS`, `/health`, `/api/files/*`) must carry `x-capscreen-token` equal to it (constant-time compare), else 403. |
| `requireAuth.ts` | Desktop single-user auth: `res.locals.userId = "local-user"` always; `userEmail`/`userName` from `<data>/identity.json` (cached by mtime) or `you@capscreen.local`. Data ownership stays `local-user` so records survive a different person signing in. |
| `requireJwt.ts` | Auth service only: verifies an RS256 `Authorization: Bearer` access token and loads the user. |
| `userIdentity.ts` | `authIdentityOr500()` helper that returns `{userId, userEmail}` or sends 500. |

### 6.4 HTTP API (every endpoint)

Mount prefixes come from `src/index.ts`. All routes use `requireAuth` (local user).

**Chat and narratives**

| Method & path | File | Purpose |
|---|---|---|
| `POST /chat` | `routes/assistantChat.ts` | The agent, SSE. Used by the assistant and the startup page chat (`startup_id`). Forces `screen_cap_table` on a first CSV turn; approvals on. |
| `POST /chat/runs/:runId/resume` | `routes/assistantChat.ts` | Allow/Deny a paused tool call; writes an `agent_tool_approval` audit entry and streams the rest. |
| `POST /chat/create` | `routes/assistantChat.ts` | Returns a new random chat id (sidebar helper). |
| `POST /api/screen/explain` | `routes/screen.ts` | On-demand analyst narrative for one entity (`explainMatch`). |

**Startups** (`routes/startups/index.ts` composes sub-routers; `:id` is guarded by `requireStartupOwner`)

| Method & path | File | Purpose |
|---|---|---|
| `GET /api/startups/screening-summary` | `routes/portfolio/startupAliases.ts` | Portfolio summary rows |
| `POST /api/startups/rescreen-all` | `routes/portfolio/startupAliases.ts` | Re-screen every startup now |
| `POST /api/startups/analyze-csv` | `routes/startups/csvs.ts` | Preview a CSV without a startup |
| `GET /api/startups` · `POST /api/startups` | `routes/startups/crud.ts` | List / create |
| `GET/PATCH/DELETE /api/startups/:id` | `routes/startups/crud.ts` | Read / rename / soft-delete (sample startups too) |
| `GET /api/startups/:id/csvs` | `routes/startups/csvs.ts` | List uploaded CSVs |
| `POST /api/startups/:id/csvs/analyze` | `routes/startups/csvs.ts` | Preview (ingest result + graph stats + ETA) |
| `POST /api/startups/:id/csvs` | `routes/startups/csvs.ts` | Save a CSV (runs ingest, detects roster purpose) |
| `PATCH/DELETE /api/startups/:id/csvs/:csvId` | `routes/startups/csvs.ts` | Edit content / soft-delete |
| `POST /api/startups/:id/screen` | `routes/screening/startupRoutes.ts` | Screen a stored CSV (`purpose`: cap_table / co_investor / vendor), save result, snapshot, sync portfolio grid, audit |
| `GET /api/startups/:id/screening-delta` | `routes/screening/startupRoutes.ts` | What got worse since the previous run |
| `GET /api/startups/:id/screening-report` | `routes/screening/startupRoutes.ts` | CSV export of the result |
| `GET/POST /api/startups/:id/entity-reviews` | `routes/screening/entityReviews.ts` | Human dispositions per entity (pending / cleared / escalated / blocked) |
| `POST /api/startups/:id/ic-memo` | `routes/documents/startupIcMemo.ts` | Generate an IC compliance memo |
| `GET /api/startups/:id/ic-memo` · `/ic-memo/latest` · `/ic-memo/:docId` | same | List / latest / one memo |
| `GET /api/startups/:id/documents/:docId/download` | same | Download a generated document |
| `GET/PUT /api/startups/:id/chat` | `routes/startups/chat.ts` | Load / save the startup page chat |
| `GET/POST /api/startups/:id/rag-documents` | `routes/startups/ragDocuments.ts` | List / upload PDF/DOCX/TXT/CSV for document search (parse, chunk, embed async) |
| `DELETE /api/startups/:id/rag-documents/:docId` | same | Remove document + chunks |

`routes/startups/middleware.ts` provides auth, `connectDbMiddleware`, `requireStartupOwner`, `rejectSampleWrite`; `routes/startups/serializers.ts` shapes startup/CSV JSON.

**Projects and documents** — "projects" are the same `Startup` records with their uploaded documents, CSVs and screenings attached.

| Method & path | File | Purpose |
|---|---|---|
| `GET /projects` · `GET /projects/:projectId` | `routes/projects/index.ts` | Startups as projects (detail includes `StoredDocument`s, CSVs and screening assets) |
| `GET/POST /single-documents` | `routes/documents/singleDocuments.ts` | List / upload standalone documents |
| `GET /single-documents/:docId/url` · `DELETE /single-documents/:docId` | same | Signed download URL / delete |
| `POST /projects/:projectId/documents` | same (`projectDocumentsRouter`) | Upload into a project |
| `GET /api/documents/:docId/view` · `/download` | `routes/documents/startupDocumentDownload.ts` | View / download a generated document (Markdown → Word-compatible HTML) |
| `GET /api/files/:token` | `lib/infra/fileStorage.ts` | Serve a file for a signed, unexpired HMAC token (exempt from the desktop token) |

**Chats** (`routes/chats.ts`): `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/:id`, `PUT /api/chats/:id/messages`, `POST /api/chats/:id/generate-title`.

**Tabular review** (`routes/tabularReview.ts`): `GET/POST /tabular-review`, `POST /tabular-review/prompt` (LLM writes a column prompt), `GET/PATCH/DELETE /tabular-review/:id`, `POST /:id/generate` (SSE; screening-backed reviews sync from startup data instead of calling the LLM), `POST /:id/regenerate-cell`, `POST /:id/clear-cells`, `GET /:id/chats`, `GET /:id/chats/:chatId/messages`, `DELETE /:id/chats/:chatId`, `POST /:id/chat` (agent chat with the grid as context, approvals off).

**Workflows** (`routes/workflows.ts`): `GET /workflows` (built-in followed by custom, `?type=`), `POST /workflows`, `GET/PUT/PATCH/DELETE /workflows/:workflowId` (built-ins readable, not editable), `GET/POST /workflows/hidden`, `DELETE /workflows/hidden/:workflowId`.

**Portfolio** (`routes/portfolioMonitoring.ts`, `/api/portfolio`): `POST /sync`, `GET /review`, `POST /rescreen`, `GET /digest`, `POST /startups/:startupId/entity-review`, `GET /compare`.

**Audit** (`routes/auditLogs.ts`): `GET /api/audit-logs?startupId=`, `POST /api/audit-logs`, `GET /api/audit-logs/export`.

**Desktop data** (`routes/desktopData.ts`, `/api/desktop`): `GET/PUT /settings` (background screening, sanctions lists and screening thresholds; `GET` also returns `screeningDefaults`, and `PUT {screening: null}` resets the thresholds; the shell watches `settings.json` and reloads Watchman when the lists change), `GET /sanctions` (list info, online/offline mode, cached list times), `POST /backup` (encrypted `.capscreen-backup`), `POST /restore` (stage, then exit 75 so the shell restarts the backend), `GET/PUT /watch-folders/:startupId`, `GET /audit-export` (hash-chained export).

**AI Control Center** (`routes/aiControlCenter.ts`, `/api/ai`): `GET /state`, `GET /health` (`?fresh=1`), `PUT/DELETE /providers/:id`, `PUT/DELETE /providers/:id/key` (verified against the provider unless `skipVerify`), `GET /providers/:id/models`, `POST /providers/:id/test`, `POST /probe-tools`, `PUT /roles`, `PUT /policy` (local-only), `GET /local`, `POST /local/start`, `POST /local/pull` (SSE), `DELETE /local/models/:name`, `POST /quick-setup/local`, `POST /quick-setup/cloud`.

**Misc**: `GET /api/config` (LLM role summary without keys, thresholds, `ragEnabled`, `webSearchEnabled`), `GET /health`.

**Auth service only** (mounted by `authService/app.ts`, not the desktop backend): `routes/auth.ts` → `/api/auth/signup`, `/signin`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/signout`, `/refresh-tokens`, `GET /me` (rate-limited); `routes/desktopOAuth.ts` → `/api/auth/desktop/authorize-code`, `/token`, `/refresh`, `/revoke`.

### 6.5 `src/lib/` module map (every file)

**`lib/screening/`** — the deterministic engine (detail in section 7)

| File | Responsibility |
|---|---|
| `runScreening.ts` | Orchestrator: `runScreening`, roster vs ownership mode, parallel Watchman + narratives, exposure enrichment, sorting, `screeningSummary`/`screeningSummaryBrief` text for tools |
| `csvIngest.ts` | `ingestCsv`: reference-catalog detection → strict parse → shareholder-schedule / heuristic aliases → LLM inference; validation, `deriveParseStatus`, `toIngestApiResponse` |
| `parseCapTable.ts` | CSV tokenizer (delimiter detection `,` `;` tab, quoted fields), header alias table, `parseWithMapping`, `parseRosterWithMapping`, shareholder-schedule guessing, `buildNormalizedCsv`, strict `parseCapTableDetailed` |
| `inferCsvSchema.ts` | LLM prompt returning `{csvKind, confidence, columnMapping, warnings, explanation}`; mapping sanitised to real headers only |
| `entityHints.ts` | Per-entity Watchman hints (alt names, birth date, address, country, registration id) from optional CSV columns |
| `graph.ts` | graphology `DirectedGraph` (owner → entity edges with `pct`), startup node, UBOs, cycle detection, BFS path, effective stake, highest-stake path |
| `watchman.ts` | Watchman client: health, `/v2/listinfo`, `/v2/search` with v1 `/search` fallback (needed for the `moov/watchman:static` dev image), response normalisation, cache + in-flight dedup, `WatchmanUnavailableError` |
| `classify.ts` | `classifyScore(topScore)` → clear / review / flagged |
| `screeningConfig.ts` | `getScreeningThresholds()`: thresholds saved in Settings → Screening (`settings.json`), else env, else defaults (min match 0.80, flagged ≥ 0.95, review ≥ 0.80, UBO 25%, OFAC 50%, result limit 10, debug on). `screeningThresholdsSnapshot()` is recorded on every result |
| `ownershipExposure.ts` | OFAC 50% rule (recursive, cycle-safe), `ofac_50`/`ubo_25` flags, risk escalation, exposure statement, max exposure, portfolio summary line |
| `explain.ts` | `explainMatch`: 3–4 sentence analyst note (who / why / confidence / next step) via the utility model; data-residency and error fallbacks |
| `screeningConfidence.ts` | 0–100 deterministic score (persons weigh 2, companies 1; clear 1, review 0.5, flagged 0) |
| `screeningDelta.ts` | Snapshots (`entityRisks` map) and the diff of entities that worsened |
| `screeningPreview.ts` | Pre-screen preview: entity/edge counts, ownership depth, circular ownership, ETA (`max(3, ceil(n·0.5)+2)` s) |
| `screeningProgress.ts` | Progress stages `parse / graph / screen / exposure / explain` and labels |
| `screeningLog.ts` | `[screening]` console logging (off with `SCREENING_LOG=0`) |
| `rosterPurpose.ts` | Detects co-investor / vendor rosters from filename/headers |

**`lib/agent/`** — LangGraph harness (section 8): `agentGraph.ts` (graph, `runAgent`, `resumeAgent`, `runSubAgent`, `isWaitingForApproval`), `runTools.ts` (parallel read-only calls, 5-min timeout, 20,000-char trimming, required-field check), `types.ts` (`SseWrite`, `ExecuteTool`, `sseEvent`).

**`lib/tools/`** — tools the agent can call

| File | Tool / role |
|---|---|
| `registry.ts` | `ToolRegistry` (register, get, schemas, execute, routing-hint section); `ToolDefinition` with `readOnly` and `needsApproval` |
| `index.ts` | Builds the single `assistantRegistry` (13 tools) |
| `types.ts` | `ToolContext` (CSV, current result, startup id, user, mentions, workflow store, callbacks, attached/displayed docs), `ToolExecutorResult`, `PlanStep`, `ToolDocumentResult` |
| `_shared.ts` | Load a startup's latest screenable CSV, resolve which screening a question is about, resolve doc-generation context, `toToolDocument` |
| `screenCapTable.ts` | `screen_cap_table` |
| `queryScreeningData.ts` | `query_screening_data` (`summary`, `list_entities`, `entity_detail`, `sanctioned_exposure`) |
| `searchTools.ts` | `search_compliance_playbook`, `list_startup_documents`, `search_startup_documents`, `screen_document_entities` |
| `generateDocumentTool.ts` / `documentTypes.ts` | `generate_document`; `DocumentTypeRegistry` with `ic_memo`, `screening_analysis` and a generic LLM fallback |
| `webSearchTool.ts` | `web_search` (Tavily) |
| `workflowTools.ts` | `list_workflows`, `read_workflow` |
| `mentionTools.ts` | `list_mentioned_startups` |
| `planTool.ts` | `update_plan` |
| `delegateTool.ts` | `delegate_task` (sub-agent) |

**`lib/llm/`** — provider layer (section 9): `providers/types.ts`, `providers/registry.ts`, `providers/anthropic.ts`, `providers/openaiCompatible.ts`, `providers/ollama.ts`, `providers/index.ts`, `complete.ts` (`completeText`, `chatText`), `validateLlm.ts`, `friendlyError.ts` (auth, quota, rate-limit, overloaded, no-key, no-tools, model-missing, local-down, unreachable, offline, timeout), and `controlCenter/` (`store.ts`, `providers.ts`, `localRuntime.ts`, `health.ts`).

**`lib/chat/`**: `buildSystemPrompt.ts` (tool-routing hints, injection guard, CSV/mention/workspace/attached-document context, prior screening summary), `startupMentions.ts` (`@"Quoted Name"`, `@<objectId>`, `@Token`), `projectAssets.ts` (a startup's CSVs and screenings for the prompt), `validateChatPayload.ts` (message and CSV size checks).

**`lib/rag/`** — document search

| File | Responsibility |
|---|---|
| `parseDocument.ts` | PDF (pdf-parse v2, lazily loaded with a `DOMMatrix` polyfill from `@thednp/dommatrix`), DOCX (mammoth), text → pages |
| `chunkText.ts` | Sentence-aware chunks, 450 words with ~15% overlap |
| `embed.ts` | Embeddings through the `embedding` role; empty vectors (keyword search) when none configured |
| `ingestDocument.ts` | Parse → chunk → embed → `DocChunk.insertMany` → mark `RagDocument` ready/error |
| `retrieveChunks.ts` | `$vectorSearch` (in-process cosine) with keyword fallback, top-k `RAG_TOP_K` (default 6) |
| `extractEntities.ts` | LLM extraction of named persons/companies (≤ 80) for `screen_document_entities` |

**`lib/documents/`**: `generateIcMemo.ts` (facts block + LLM memo), `generateScreeningAnalysis.ts`, `icMemoDocument.ts` (persist/list `StartupDocument`), `markdownToWordHtml.ts`.

**`lib/portfolio/`**: `portfolioGrid.ts` (entity-screening reviews, portfolio monitoring review sync, review statuses → grid), `portfolioCompare.ts` (compare startups, shared ultimate owners), `rescreenScheduler.ts` (re-screen all startups, `ScreeningDigest`, optional `DIGEST_WEBHOOK_URL` POST, checks every 15 min whether a run is due).

**`lib/tabular/`**: `tabularScreening.ts` (`PORTFOLIO_COLUMNS`, `ENTITY_SCREENING_COLUMNS`, risk → flag colour, result → rows/cells), `reviewStatusSync.ts` (Status column writes back to `EntityReview` / startup status), `buildTabularChatPrompt.ts` (grid as Markdown for chat).

**`lib/workflows/`**: `builtinWorkflows.ts` (the 12 built-ins, single source for agent and UI), `workflowMemory.ts` (`listWorkflows` = built-ins + own, CRUD for own workflows, hide/unhide, `buildWorkflowStore` for the agent).

**`lib/infra/`**

| File | Responsibility |
|---|---|
| `db.ts` | `connectDb()`: SQLite store attached to mongoose (or MongoDB when `CAPSCREEN_DB=mongodb`), applies a pending restore first, starts the TTL sweeper; `databaseFile()` |
| `sqliteStore/store.ts` | `SqliteDb`, `SqliteCollection`, `SqliteCursor`, `SqliteClient`, `SqliteSession`, in-process `$vectorSearch` |
| `sqliteStore/query.ts` | Mongo query semantics (comparison, logical, element, array, regex), dotted paths, projection, sort, BSON type ordering |
| `sqliteStore/update.ts` | Update operators (`$set`, `$unset`, `$inc`, `$mul`, `$min`, `$max`, `$rename`, `$push`/`$each`, `$addToSet`, `$pull`, `$pullAll`, `$pop`, `$currentDate`, `$setOnInsert`) |
| `dataDir.ts` | `dataDir()` / `dataFile()` rooted at `CAPSCREEN_DATA_DIR` or `~/.capscreen`, created `0700` |
| `settings.ts` | `settings.json` (background screening, sanctions lists, screening thresholds), the list catalogue and `validateScreeningSettings` (ownership thresholds may be stricter than OFAC 50% / FinCEN 25%, never looser; review ≥ min match, flagged ≥ review). Reads are cached by file mtime |
| `backup.ts` | Encrypted backup create / stage / apply |
| `folderWatch.ts` | Polls watched folders and ingests new files through the app's own HTTP endpoints |
| `fileStorage.ts` | Local object storage under `<data>/files`, HMAC-signed download URLs, file-type detection |
| `cache.ts` | Watchman result cache (5 min TTL, 5,000 entries) — the only response cache |
| `requestDedup.ts` | Share one in-flight promise per key |
| `webSearchConfig.ts` | Tavily key presence/sanity |

**`lib/auth/`** (auth service): `config.ts` (JWT keys, expirations, `logAuthStartupWarnings`), `jwt.ts`, `tokens.ts`, `cookies.ts`, `loginLockout.ts` (5 failures → 15 min), `validate.ts`, `email.ts` + `emailConfig.ts` + `emailTemplates.ts` (Resend: verification, password reset).

**`lib/shared/`**: `promptDelimiters.ts` (`wrapEntityName`, `wrapCsvData`, `wrapUntrustedText`, `UNTRUSTED_DATA_PROMPT_GUARD`), `dataResidency.ts` (`DATA_RESIDENCY` blocks PII to remote LLMs), `startupId.ts` (ObjectId validation/coalescing).

**`lib/sample/sampleAssets.ts`**: global read-only sample workspaces (`isSample`), visibility filters for startups and tabular reviews, writability checks.

**`lib/escapeHtml.ts`**: HTML escaping.

### 6.6 Data models (`src/models/`)

All are mongoose models; on desktop they persist to SQLite through the driver shim.

| Model | File | Key fields |
|---|---|---|
| `Startup` | `screening/startup.ts` | `name`, `ownerId`, `deletedAt` (a pre-find hook hides soft-deleted rows), `latestCsvId`, `lastScreeningResult`, `lastScreenedAt`, `lastScreenedCsvId`, co-investor / vendor result slots, `latestCsvByPurpose`, `portfolioReviewStatus`, `portfolioReviewNotes`, `isSample` |
| `CapTableCsv` | `screening/capTableCsv.ts` | `startupId`, `filename`, `content`, `parseStatus`, `parseErrors`, `recordCount`, `csvKind`, `parseSource`, `confidence`, `columnMapping`, `normalizedContent`, `ingestWarnings`, `rosterPurpose`, `deletedAt` |
| `EntityReview` | `screening/entityReview.ts` | `startupId`, `entityName` (unique pair), `status`, `notes`, `reviewedBy(Email)`, `reviewedAt` |
| `ScreeningSnapshot` | `screening/screeningSnapshot.ts` | `startupId`, `purpose`, `screenedAt`, counts, `entityRisks` map |
| `ScreeningDigest` | `screening/screeningDigest.ts` | `generatedAt`, `rescreenedCount`, `newFlagCount`, `newReviewCount`, `changes[]`, `summaryText` |
| schemas | `screening/schemas/screening.ts` | Sub-schemas: Watchman match, path step, entity result, edge, screening result, parse error, ownership record |
| `AuditLog` | `audit/auditLog.ts` | `startupId`, `eventType` (screening_completed, csv_uploaded, csv_updated, entity_reviewed, portfolio_reviewed, ic_memo_generated, screening_analysis_generated, document_generated, document_uploaded, document_deleted, agent_tool_approval), `performedBy(Email)`, `details`, `createdAt` with a TTL of `AUDIT_LOG_RETENTION_DAYS` (default 1825 days = 5 years) |
| `AssistantChat` | `chat/assistantChat.ts` | `userId`, `projectId`, `title`, `messages[]` |
| `StartupChat` | `chat/startupChat.ts` | `startupId`, `messages[]` |
| `StartupDocument` | `documents/startupDocument.ts` | `startupId`, `kind` (ic_memo / screening_analysis / custom), `title`, `content` (Markdown), `screeningScreenedAt` |
| `StoredDocument` | `documents/storedDocument.ts` | Uploaded files: `ownerId`, `projectId`, `filename`, `mimeType`, `fileType`, `storageKey`, `sizeBytes`, `status` |
| `RagDocument` / `DocChunk` | `rag/*.ts` | Search documents and their chunks (`chunkText` text index, `embedding[]`, `pageNumber`) |
| `TabularReview` | `tabular/tabularReview.ts` | `userId`, `title`, `projectId`, `workflowId`, `reviewKind` (standard / portfolio_monitoring / entity_screening), `columnsConfig`, `rows[]`, `isSample` |
| `TabularCell` | `tabular/tabularCell.ts` | `reviewId`, `documentId` (row id), `columnIndex`, `content {summary, flag, reasoning}`, `status` |
| `WorkflowModel` / `HiddenWorkflowModel` | `workflows/*.ts` | Custom workflows (`type` assistant/tabular, `prompt_md`, `columns_config`) and hidden built-ins |
| `User`, `EmailToken`, `AuthToken`, `DesktopAuthCode` | `auth/*.ts` | Auth-service accounts, hashed tokens, one-time desktop codes (TTL indexes) |
| barrel | `models/index.ts` | Re-exports everything above |

### 6.7 Types (`src/types/`)

- `screening.ts`: the domain contract — `OwnershipRecord`, `WatchmanMatch` (keeps raw Watchman fields for auditors), `WatchmanListInfo`, `EntityScreeningQuery`, `EntityResult`, `OwnershipEdge`, `ColumnMapping`, `CsvIngestResult`, `ScreeningResult`, `ScreeningSummary`, and the enums (`RiskLevel`, `ParseStatus`, `CsvKind`, `ParseSource`, `ScreeningMode`, `ReviewStatus`, `OwnershipRuleFlag`, `RosterPurpose`). The frontend re-exports this file (type-only) from `frontend/src/lib/screenerTypes.ts`.
- `tabular.ts`: `ColumnConfig`, `TabularCellContent`, `TabularRowDoc`.

### 6.8 Scripts (`backend/scripts/`)

| File | What it does |
|---|---|
| `seed-demo-startup.ts` + `lib/seedDemoShowcase.ts` | Seeds "NexaFlow AI Inc (Demo)" as global sample data: extended cap table, co-investor and vendor rosters, live Watchman screening, entity review, triage queue, documents, sample entity reviews, portfolio row. Flags `--email`, `--reset`, `--dry-run`. Needs Watchman. Writes to `~/.capscreen` (or `CAPSCREEN_DATA_DIR`). |
| `reset-database.ts` + `lib/resetDatabase.ts` | Interactive reset: full erase or "interview prep" (keep users + demo). Confirm strings `ERASE ALL` / `KEEP DEMO`. Prints the actual database file it will clear. |
| `generate-jwt-keys.sh` | `ssh-keygen` RS256 key pair into `backend/storage/` and prints base64 env lines. |

### 6.9 Tests (`backend/test/`)

| File | Covers |
|---|---|
| `csvIngest.test.ts` | Strict cap table (38 records), shareholder schedule → roster, name/type/role roster, aliased headers, reference catalogs blocked, header-only CSV, bad rows reported |
| `ownership.test.ts` | Startup node, effective stakes (Ivan 12%, Johan 13%, Mohammed 2.24%), four-layer hidden owner path, cycle safety, score thresholds, OFAC 50% propagation, escalation rules, confidence score |
| `sqliteStore.test.ts` | Real mongoose models on the SQLite store: queries, regex, updates, soft-delete hook, unique indexes, upserts, `$vectorSearch` ranking, persistence across reopen |
| `eraseData.test.ts` | Start fresh: everything erased, files and watched-folder setup set aside, settings kept, the app keeps working |
| `settings.test.ts` | Screening-threshold validation (OFAC/UBO caps, score ordering), saved thresholds drive classification and are recorded, reset, invalid hand-edited files fall back to defaults |
| `modelChoice.test.ts` | Cloud model lists trimmed to the latest models (Claude, OpenAI; Gemini free-tier Flash / Flash-Lite), local listings left whole |
| `workflows.test.ts` | Built-ins listed and read-only, custom workflow lifecycle, workflow store for the agent, hide/unhide |
| `helpers.ts` | Sample CSV loader, `EntityResult` factory, `useTempDatabase()` (own SQLite file per test file) |

### 6.10 Other backend folders

- `backend/docs/tool-routing-analysis.md`: why `tool_choice` is forced on the first CSV turn and the routing failure modes found.
- `backend/compliance-corpus/`: policy Markdown searched by `search_compliance_playbook` (section 18).
- `backend/sample-data/`: demo CSVs and walkthrough (section 18).
- `backend/src/assets/`: email logo SVGs (copied to `dist/assets` on build).
- `backend/public/robots.txt`: disallow all (auth service output dir on Vercel).

---

## 7. Screening engine in depth

### 7.1 CSV ingest pipeline (`csvIngest.ts`)

1. **Table extraction**: delimiter detected (`,` `;` tab), quoted fields tokenized. No header + data row → error.
2. **Reference-catalog check**: files that look like dataset catalogs (URLs + source metadata, e.g. OpenSanctions sources) become `csvKind: "reference_metadata"` and are blocked with guidance.
3. **Strict path**: exact headers `entity, entity_type, owner, owner_type, ownership_pct` with no row errors → `parseSource: "strict"`.
4. **Shareholder schedule**: names + percentages but no investee column → **entity roster** (heuristic).
5. **Heuristic aliases**: the header alias table in `parseCapTable.ts` maps common variants (`company`, `shareholder`, `percentage`, …).
6. **AI path**: `inferCsvSchema()` asks the utility model for `csvKind` and a mapping to **exact existing headers** (never invent columns or percentages). Confidence < 0.75 → `needs_review`.
7. **Validation**: cap tables need `entity`, `owner`, `ownership_pct`; rosters need `name`. Missing fields → `canScreen: false` with a user message. Parse status: `pending / valid / invalid / needs_review`.

Two screening modes come out: `ownership_graph` (cap table) and `entity_roster` (flat list; no graph, no exposure).

### 7.2 Ownership graph (`graph.ts`)

- Nodes are names; edges go **owner → entity** with attribute `pct`. Duplicate edges are ignored.
- **Startup node**: the node with no outgoing edges (it owns nothing in the table).
- **Ultimate owners**: nodes with no in-edges. `resolveUltimateOwners` walks upward and is cycle-safe.
- **Ownership path**: BFS from the startup upward (`inNeighbors` = "who owns me?"), returns `[startup, …intermediaries, target]`.
- **Effective stake**: sum over all paths of the product of edge percentages, capped at 100.
- **Cycles**: `findOwnershipCycles` reports directed cycles (e.g. Apex ↔ Loopback in the demo).

### 7.3 Watchman matching (`watchman.ts`)

- Calls `GET /v2/search?name&type(person|business)&minMatch&limit&debug[&altNames&birthDate&address&country&gov_business-registration&requestID]`, falling back to v1 `/search` on 404 (the `moov/watchman:static` image used for browser-only dev has no `/v2/search`).
- Every entity is searched in parallel (`Promise.allSettled`). Results are cached 5 minutes keyed by name + type + hints, and identical in-flight requests share one promise.
- If no endpoint answers for an entity, it throws `WatchmanUnavailableError`; `runScreening` also asserts health up front. This is the **fail-closed** rule (the API returns 503).
- `GET /v2/listinfo` (cached 2 min) gives list counts and SHA-256 hashes, stored on the result as `watchmanListInfo`.

### 7.4 Classification and ownership rules

| Step | Rule (defaults; tunable in Settings → Screening, or env in dev) |
|---|---|
| Base risk | top score ≥ 0.95 → **flagged**; ≥ 0.80 → **review**; else / no hit → **clear** |
| OFAC 50% rule | an entity is "blockable" if sanctioned or blockable owners together hold ≥ 50% of it (recursive, cycle-safe). Any non-clear entity counts as "sanctioned" for this rule. |
| UBO 25% | effective stake in the startup ≥ 25% → flag `ubo_25` |
| Escalation | a blockable company with no hit of its own starts at review; `ofac_50` then escalates review → flagged; `ubo_25` escalates clear + hit → review |
| Exposure statement | e.g. "12.0% of NexaFlow AI Inc is indirectly owned by X through a 4-layer ownership chain." |
| Sort | flagged, review, clear |
| Confidence | deterministic 0–100 score in code, never by the LLM |
| Audit | every result stores `screeningThresholds` (values used, `source: "settings" | "default"`) next to `watchmanListInfo` |

### 7.5 Narratives (`explain.ts`)

For review/flagged entities only, in parallel. The prompt includes the untrusted-data guard, the entity (XML-wrapped), path, exposure lines and the top 3 matches, and asks for 3–4 plain sentences: **who**, **why**, **confidence**, **next step**, with no legal determination. A fixed text is used when `DATA_RESIDENCY` blocks a remote model, a generic one on LLM failure. Narratives can also be fetched on demand with `POST /api/screen/explain`.

### 7.6 Monitoring

- **Snapshots and delta** (`screeningDelta.ts`): each run stores `entityRisks`; the delta lists entities that got worse. Shown by `ScreeningDeltaBanner`.
- **Background re-screening** (`rescreenScheduler.ts`): every 15 min, if enabled and the last digest is older than `intervalHours` (default 24), re-screens every startup's latest cap table / co-investor / vendor CSV, writes a `ScreeningDigest`, optionally POSTs to `DIGEST_WEBHOOK_URL`. The desktop `notifications.ts` poller raises a native notification when a new digest has new flags or review items.

---

## 8. Agent harness and tools

### 8.1 The graph (`lib/agent/agentGraph.ts`)

```
START → callModel ──no tools──▶ END
           │ tools
           ├──needs approval──▶ askApproval (interrupt) ──▶ runTools
           └────────────────────────────────────────────▶ runTools
runTools ──rounds < max──▶ callModel
runTools ──rounds ≥ max──▶ stopAtRoundLimit ──▶ END
```

- **State** (`Annotation.Root`): `systemPrompt`, `maxRounds`, `messages` (append reducer), `pendingCalls`, `needsApproval`, `declinedIds`, `rounds`, `answer` (append), `toolActivity` (append).
- **Runtime context** (never checkpointed): tool registry, `executeTool`, SSE `write`, model role, `maxTokens` (the chat route uses 8192), `toolChoice`, `askBeforeSensitiveTools`.
- `callModel` streams the provider's reply as `content_delta` events and records tool calls. A model bound with `supportsTools: false` runs tool-less.
- Round limit: 8 (5 for sub-agents).
- Checkpointer: LangGraph `MemorySaver`. Finished runs are forgotten immediately; paused runs are kept 24 h and do not survive an app restart.
- `runSubAgent` uses the same graph compiled **without** a checkpointer, read-only tools only, no streaming.
- Cancellation: the route aborts the `AbortSignal` when the HTTP connection closes.

### 8.2 Tool execution (`runTools.ts`)

Consecutive read-only calls run in parallel; any write runs alone, in order. Errors, bad input and timeouts (5 min) become error **messages** for the model. Results over 20,000 characters are trimmed. Declined calls return "the user declined this tool call".

### 8.3 Tools

| Tool | Read-only | Approval | What it does |
|---|---|---|---|
| `update_plan` | ✓ | | Live checklist for 3+ step jobs (`AgentPlan.tsx`) |
| `delegate_task` | ✓ | | Sub-agent research task; several run in parallel |
| `list_workflows` / `read_workflow` | ✓ | | Workflow ids/titles; full `prompt_md` |
| `screen_cap_table` | | | Fresh Watchman screen of the attached / workspace CSV |
| `list_mentioned_startups` | ✓ | | @-mentioned startups with screening status |
| `query_screening_data` | ✓ | | summary / list_entities / entity_detail / sanctioned_exposure |
| `generate_document` | | | IC memo, screening analysis, or any other doc type (generic LLM) |
| `search_compliance_playbook` | ✓ | | Search the policy corpus |
| `list_startup_documents` / `search_startup_documents` | ✓ | | Uploaded documents; semantic or keyword search |
| `screen_document_entities` | | | Extract named parties from a document and screen them |
| `web_search` | ✓ | **✓** | Tavily web search; must cite every URL |

Approvals are on for `POST /chat` (assistant and startup page). Tabular grid chat runs without approvals, so `web_search` there does not ask.

### 8.4 Prompts and guards

- The base prompt in `routes/assistantChat.ts`: Markdown output, never conclude guilt, never invent data, aggregate counts only after a screen (the side panel shows details), numbered lists only for 2–5 mutually exclusive choices (rendered as chips by `parseMessageOptions.ts`), cite web results, read the workflow first when one is selected.
- `buildSystemPrompt` adds tool routing hints, `UNTRUSTED_DATA_PROMPT_GUARD`, and wraps CSV content and entity names in XML delimiters to blunt prompt injection from uploaded data.

---

## 9. LLM providers and the AI Control Center

### 9.1 Provider layer (`lib/llm/providers/`)

- Provider-neutral types mirror the Anthropic wire format (`input_schema`, `tool_use`, `tool_result`), so tool definitions are written once.
- Adapters: `AnthropicProvider` (`@anthropic-ai/sdk`), `OpenAICompatibleProvider` (`openai` SDK; OpenAI, OpenRouter, Groq, Gemini's OpenAI endpoint, LM Studio, llama.cpp, any custom URL), `OllamaProvider` (native `/api/chat`, sets the context window by RAM and keeps "thinking" out of replies).
- **Roles**: `agent` (tool-calling chat), `utility` (narratives, CSV inference, extraction, titles; falls back to `agent`), `embedding` (RAG).
- **Presets**: anthropic, openai, ollama (`127.0.0.1:11434`), lmstudio (`:1234/v1`), llamacpp (`:8080/v1`), openrouter, groq, gemini. Default Anthropic model `claude-haiku-4-5`.
- **Locality**: a provider is local if its base URL is loopback. `getLlm()` throws in local-only mode for remote providers.
- **Config priority**: AI Control Center files first; env vars only as the `pnpm dev` fallback.

### 9.2 Control Center (`lib/llm/controlCenter/`)

| File | Responsibility |
|---|---|
| `store.ts` | `<data>/ai/config.json` (providers, role bindings, local-only) and `<data>/ai/secrets.json` (API keys, AES-256-GCM with the master key from `CAPSCREEN_MASTER_KEY`; under `pnpm dev`, `<data>/ai/dev-master.key`). Atomic writes. |
| `providers.ts` | Keyless local providers, key normalisation, key-prefix detection, cloud embedding models. `chatModels` trims a cloud provider's listing to its latest models (`latestModels`: newest generation, newest version per tier, aliases over dated snapshots and previews, superseded lines such as OpenAI's o-series hidden; Gemini limited to its free-tier Flash and Flash-Lite families via `ONLY_FAMILIES`) and puts the preferred tier first; local servers keep their full listing. |
| `localRuntime.ts` | Hardware detection, curated Ollama catalog (qwen3 4b/8b/14b/30b, llama3.1:8b, gpt-oss:20b, gemma3:4b without tools, nomic-embed-text, mxbai-embed-large) with fit ratings, Ollama/LM Studio status, start, pull (streamed), delete, capability check |
| `health.ts` | Per-role live health (runtime up, model installed, key accepted) with one fix action each; 20 s cache |

UI: Settings → AI Control Center, `/settings/ai` (section 13).

---

## 10. Local data layer

### 10.1 SQLite as a MongoDB driver

`lib/infra/sqliteStore/` implements the parts of the MongoDB driver that mongoose calls, on Node's built-in `node:sqlite` (no native module):

- One table `documents(collection, id, body EJSON, updated_at)` plus `meta(schema_version)`, WAL mode.
- The whole database is loaded into memory on open; reads never touch disk; every mutation writes through. Only the desktop backend writes the file.
- Supports find/findOne/count/distinct, insert/update/replace/delete (and `findOneAnd*`), `bulkWrite`, indexes (incl. unique, TTL), sessions/transactions as no-ops, aggregation stages `$match`, `$vectorSearch`, `$sort`, `$skip`, `$limit`, `$project`, `$count`.
- A TTL sweeper runs every minute.
- Unsupported operators throw `UnsupportedOperatorError`, so mismatches show up loudly; `backend/test/sqliteStore.test.ts` covers the common paths.

Why: about 170 mongoose call sites kept working unchanged when the app moved from Atlas to on-device storage (`docs/DESKTOP_PLAN.md`, Phase 2).

### 10.2 `<userData>` layout

```
capscreen.db (+ -wal, -shm)     all app data
files/                          uploaded documents (fileStorage)
settings.json                   background screening, sanctions lists, screening thresholds
identity.json                   signed-in user (non-secret), for audit attribution
folder-watch.json               watched folders ledger
ai/config.json, ai/secrets.json model setup + encrypted keys (ai/dev-master.key in pnpm dev)
vault/master.key.sealed         master key sealed by OS keychain (master.key if no keychain)
vault/session.sealed            refresh token sealed by OS keychain
watchman/                       watchman.pid, config.yml, status.json, work/, cache/ (offline list snapshot)
logs/                           main.log, backend/frontend/watchman logs (rotated at 10 MB)
notify-state.json               last digest notified
restore-pending.json, restore-staging/, tmp/   backup restore staging
```

### 10.3 Backup, restore and audit export

- **Backup** (`backup.ts`): `"CAPSCREENBAK1\n" | salt(16) | iv(12) | tag(16) | AES-256-GCM(gzip(manifest + files))`, key = scrypt(password, salt). Contains the database snapshot, stored files, settings and model assignments. **API keys are excluded** (sealed to this machine).
- **Restore**: decrypt and validate, stage under `restore-staging/`, write `restore-pending.json`, exit 75; on the next start `applyPendingRestore()` swaps it in before the DB opens.
- **Audit export** (`GET /api/desktop/audit-export`): each line carries `sha256(prev_hash + entry)`; editing, deleting or reordering any line breaks the chain.
- The database itself is **not encrypted at rest** (only API keys and backups are).

---

## 11. Cloud auth service

- Code lives in the backend package (`src/authService/`, `routes/auth.ts`, `routes/desktopOAuth.ts`, `lib/auth/`, auth models) and deploys to Vercel with `backend/` as project root.
- Storage: MongoDB Atlas via `CAPSCREEN_DB=mongodb` + `MONGODB_URI`. It stores **accounts only**.
- Features: signup (Resend email verification; auto-confirmed without `RESEND_API_KEY`), sign-in with lockout, verify, resend, forgot/reset password, signout, refresh-token rotation, `/me`, and the desktop OAuth endpoints. It logs missing JWT keys / email configuration at startup.
- Desktop refresh tokens default to 30 days (`DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS`).
- Production URL is `capscreenAuthUrl` in `desktop/package.json` (`https://capscreen-auth.vercel.app`), overridable with `CAPSCREEN_AUTH_URL`. Dev default `http://127.0.0.1:4100` (`pnpm --filter vc-screener-backend auth:dev`), or skip sign-in with `CAPSCREEN_SKIP_AUTH=1` (dev only).

---

## 12. Desktop package (`desktop/`)

Package `capscreen-desktop`, product name CapScreen, version 1.0.0. The main process has **no runtime npm dependencies**, only Electron built-ins.

### 12.1 Source files (`desktop/src/`)

| File | Responsibility |
|---|---|
| `main.ts` | App lifecycle: single window, tray (closing keeps it running so background screening continues), app menu (AI Control Center `Cmd+,` → `/settings/ai`, Data & Backup, New Startup `CmdOrCtrl+N`, open logs/data folder), external links open in the browser, sign-in gate, boot, sign-out, quit, error logging to `logs/main.log`, dev-only CDP via `CAPSCREEN_REMOTE_DEBUG` |
| `sidecars.ts` | Supervisor for Watchman (child process), backend and UI (Electron `utilityProcess` when packaged; `tsx` / `next dev` in dev); log piping; restart with backoff; exit 75 = restart; Watchman config per selected lists; online/offline mode; list snapshot maintenance; reload Watchman when the lists change; `stopAll` |
| `protocol.ts` | `capscreen://` scheme; streaming HTTP proxy to UI and `/__api/*` backend; adds the token; rewrites redirects onto the app origin; dev token injection |
| `preload.ts` | Exposes `window.capscreenDesktop` (sandboxed; everything over validated IPC) |
| `ipc.ts` | IPC handlers: `bootstrap`, `sign-out`, `shell-action`, `open-account`, `open-external`, `reveal`, `save-file`, `pick-folder`, `pick-file`, `notify`, `print-pdf` |
| `vault.ts` | Master key create/unseal with `safeStorage` |
| `session.ts` | Sealed session, restore with 14-day offline grace, background refresh every 12 h, `identity.json`, sign-in, sign-out (revoke) |
| `authFlow.ts` | Electron-free RFC 8252 + PKCE client |
| `listCache.ts` | Offline snapshot of OFAC and EU source files and its manifest |
| `notifications.ts` | Polls the latest digest and raises native notifications that deep-link into the app |
| `splash.ts` | Shell HTML pages: splash, boot error, sign-in gate, browser "you can close this tab" page |
| `paths.ts` / `ports.ts` | Paths and Watchman binary name per platform/arch; `freePort()` and `waitForHttp()` |

### 12.2 Build and packaging

| Script | What it does |
|---|---|
| `build:main` | `tsc` → `dist/` |
| `build:backend` (`scripts/bundle-backend.mjs`) | esbuild bundles `backend/src/index.ts` into `resources/backend/index.js` (node22, CommonJS, sourcemap), marks optional MongoDB/AWS/canvas add-ons external, copies `compliance-corpus/` and pdf.js's worker |
| `build:frontend` (`scripts/build-frontend.mjs`) | `next build` with `CAPSCREEN_DESKTOP_BUILD=1` (standalone), copies the standalone tree resolving pnpm symlinks, flattens `node_modules` into the server folder, copies `.next/static` and `public/`, deletes any `.env*` |
| `build:watchman` (`scripts/build-watchman.sh`) | Builds Watchman `v1.2.1` from source, pure Go (no libpostal), for darwin arm64/x64, win32 x64, linux x64/arm64. Needs Go 1.24+. |
| `icons` (`scripts/make-icons.js`) | Renders the app icon and macOS tray template images from `frontend/public/capscreen-mark.svg` |
| `dev` / `start` / `dist` / `dist:dir` / `dist:mac` | Run Electron, or build then electron-builder |

`electron-builder.yml`: appId `com.capscreen.desktop`; backend, frontend and icons as `extraResources`; per-OS Watchman binary; macOS DMG (arm64 + x64, hardened runtime), Windows NSIS, Linux AppImage. Unsigned unless `CSC_*` env is set. Build each OS on that OS.

---

## 13. Frontend package (`frontend/`)

Package `capscreen`. Next.js 16 App Router, React 19.2, TypeScript, Tailwind CSS v4, shadcn/ui (new-york style, lucide icons), React Compiler.

### 13.1 Config files

| File | Purpose |
|---|---|
| `next.config.ts` | Loads the monorepo root `.env`; `output: "standalone"` only when `CAPSCREEN_DESKTOP_BUILD=1`; Turbopack/file-tracing root at the monorepo; every URL redirect (there are no redirect-only pages): `/` → `/assistant`, `/settings` and `/account` → `/settings/account`, `/ai` and `/account/models` → `/settings/ai`, `/projects*` → `/startups*`, old startup chats `/startups/:id/assistant/chat/:chatId` → `/startups/:id` (merged into the workspace; older startup chats in the sidebar open as assistant chats) |
| `components.json`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json` | shadcn, lint, Tailwind, TypeScript |
| `.env.local.example` | Points to the root `.env` |
| `public/` | `capscreen-logo.svg`, `capscreen-logo-reversed.svg`, `capscreen-mark.svg`, `apple-touch-icon.png`, `link-image.jpg`, and empty Next starter SVGs |

### 13.2 How the UI talks to the backend

- `lib/apiBase.ts`: backend origin from the preload bridge (`window.capscreenDesktop.apiBase`, i.e. `capscreen://app/__api`) or `NEXT_PUBLIC_API_BASE_URL` / `http://localhost:3001`.
- `lib/desktop.ts`: typed bridge (`desktop()`, `isDesktop()`, hydration-safe `useDesktop()`).
- No auth headers: the desktop token is added by the Electron main process, and `pnpm dev` runs open on loopback.
- `contexts/AuthContext.tsx` / `UserProfileContext.tsx`: the local user plus the signed-in account's email, name and organisation from the bridge; sign-out goes through the shell.
- SSE is read with `fetch` + stream reading in `app/lib/screenerApi.ts` (startup chat and resume) and `app/lib/capScreenApi.ts` (assistant, project chat, tabular generation and chat).

### 13.3 Routes (`src/app/`)

| URL | File | Renders |
|---|---|---|
| `/assistant`, `/assistant/chat/[id]` | `(pages)/assistant/…` | `InitialView` → `ChatView` |
| `/startups` | `(pages)/startups/page.tsx` | `StartupsPage` |
| `/startups/[id]` | `(pages)/startups/[id]/page.tsx` | `StartupScreenerPage`, the one startup workspace: scoped chat on the left, analysis dock on the right (Cap table, Graph, Entities, Flags, **Documents** = `StartupDocumentsPanel` explorer + viewer). Opened by the Startups list, Choose startup in the assistant, and workflows run on a startup (`?workflow=1` sends the queued workflow message through the workspace chat) |
| `/startups/[id]/tabular-reviews/[reviewId]`, `/tabular-reviews/[id]` | | `TRView` |
| `/tabular-reviews` | `(pages)/tabular-reviews/page.tsx` | Review list, new review modal, portfolio monitoring card |
| `/workflows`, `/workflows/[id]` | `(pages)/workflows/…` | `WorkflowList`; prompt editor (Tiptap) or column schema editor |
| `/settings` | `(pages)/settings/layout.tsx` | Settings shell: a full-height panel on the left grouped into Account / Screening / Data, each page with a one-line hint (a row of tabs on narrow windows), and a wide content area (up to 72rem) where related cards sit two to a row on wide screens; `/settings` redirects to `/settings/account` (in `next.config.ts`) |
| `/settings/account` | `(pages)/settings/account/page.tsx` | Profile, connection state, password portal, restart tour, sign out |
| `/settings/ai` | `(pages)/settings/ai/page.tsx` | AI Control Center: status card, setup wizard, chat model, providers and keys, local models, other tasks, local-only mode; `/ai` redirects here |
| `/settings/screening` | `(pages)/settings/screening/page.tsx` | Match-score thresholds (score band, try-a-score), OFAC / beneficial-owner thresholds, matches per entity; save bar, reset to defaults |
| `/settings/sanctions` | `(pages)/settings/sanctions/page.tsx` | Engine status, list switches with entry counts and SHA-256, background re-screening |
| `/settings/connectors` | `(pages)/settings/connectors/page.tsx` | Connectors (Carta, Pulley, AngelList, Google Drive, Dropbox, SharePoint, OpenCorporates, Companies House), all coming soon; a Show in chat switch per connector. The list and the preference live in `lib/connectors.ts` (preference in browser storage, per computer) |
| `/settings/data` | `(pages)/settings/data/page.tsx` | Backup & audit: storage location, encrypted backup, restore, audit-log export, and **Start fresh** (`StartFreshCard`: type ERASE → `POST /api/desktop/erase`, `lib/infra/eraseData.ts`; erases startups, files, chats, reviews, workflows and the audit log, keeps sign-in, AI setup and settings, sets a safety copy aside in `<data>/backups/before-erase-<time>/`, then clears per-computer UI state so onboarding starts over) |
| `/settings/about` | `(pages)/settings/about/page.tsx` | Version, data folder, engine and AI status, copy diagnostics (no account details, keys or cap-table data) |
| layouts / errors | `app/layout.tsx`, `(pages)/layout.tsx` (sidebar, chat history, tour, `DesktopShell`), `error.tsx`, `global-error.tsx`, `not-found.tsx` | |

Onboarding: a new user sees (1) the tour (`lib/onboardingTour.ts`, driver.js, storage key `capscreen_onboarding_tour_v2`; bump the version when the steps change). It runs on the assistant home and points at `data-tour` anchors: `composer`, `composer-sources`, `composer-tools`, `composer-model`, `getting-started`, `nav-assistant` (New chat), `nav-search`, `nav-startups`, `nav-tabular`, `nav-workflows`, `ai-status`, `nav-settings`; steps whose anchor isn't on screen are skipped. (2) The **Getting started** checklist under the composer (`assistant/GettingStarted.tsx`): Set up AI, Create a startup, Upload and screen a cap table, Ask the assistant, Take the tour; each ticks itself off from real data and the card hides when done or dismissed. (3) First-run empty states (`shared/EmptyState.tsx`) on Startups, Tabular reviews and Workflows with numbered first steps. Replay the tour from Settings → Profile.

UI conventions (match the sidebar; reuse these instead of hand-rolled styles):
- Page title: `components/shared/PageHeader.tsx` (EB Garamond `text-3xl`, one-line description, actions right); Settings uses the same type via `SettingsHeader`. Detail pages: small sans breadcrumb above (or beside) a serif title.
- Buttons: `components/ui/button.tsx`. Primary = near-black `bg-gray-950`, hover `gray-800`; `outline` = white with a hairline ring shadow; `ghost` = soft grey hover. Destructive outline: red text with a red ring. Main actions are labelled ("New startup"), not bare "+" icons.
- Tabs: `ToolbarTabs` and the analysis dock use pill tabs (active `bg-black/[0.06]`, hover `bg-black/[0.04]`).
- Neutral accents: links are dark grey with a soft underline; spinners, resize handles and focus rings are grey. Blue only where it carries meaning (Word-file icons, tag colours, the UBO badge, graph colours, workflow type).
- Modals: overlay `bg-black/20 backdrop-blur-xs`; panel `rounded-2xl bg-white shadow-2xl ring-1 ring-black/5`.
- Surfaces: main content is white; the sidebar is `#f7f7f7`; hairline borders `border-black/[0.06]`.
- Colours: `gray-*` is retuned in `globals.css` (`@theme`) to Tailwind's neutral scale, so use `gray` for every grey (not slate, zinc or neutral). Status colours: **red** = flagged / error, **amber** = review / warning (not yellow or orange), **emerald** = clear / success (not green). Near-black is `gray-950`, not `black`. Other hues only where they are categories: tabular tag colours (`pillUtils.ts`), audit event icons, startup initial tiles, the ownership diagram, workflow type, Word-file icons.

Sidebar (`AppSidebar.tsx`): logo and collapse button; **New chat** (⇧⌘O / Ctrl+Shift+O, the way into the assistant) and **Search** (⌘K / Ctrl+K, filters chats); Startups, Tabular reviews, Workflows. Below: **Startups** (five most recently updated, colour-coded initial tiles, All startups, + for a new one) and **Chats** (grouped Today / Yesterday / Previous 7 days / Previous 30 days / Older, + for a new chat, Show more). The footer shows the assistant's model with its maker's logo and a health dot (links to AI Control), then the profile card (opens Settings). Collapsed, it's an icon rail with the CapScreen mark, the same actions and the AI status. Onboarding tour hooks: `data-tour` on New chat (`nav-assistant`), the nav items and `recent-projects`.

### 13.4 Components (`src/app/components/`)

**`ai/`**: `AiStatusCard.tsx` (problems + one fix each), `SetupWizard.tsx`, `LocalSetup.tsx`, `CloudSetup.tsx`, `RoleAssignments.tsx`, `LocalModels.tsx`, `ProviderList.tsx`, `ModelPicker.tsx` (chat toolbar control: models grouped by provider with logos, readable names, a one-line hint and the recommended badge; connect a provider through a pop-up), `ProviderLogo.tsx` (official marks: `ProviderLogo` for AI providers from `public/providers/`; `ModelLogo` for the model's maker — Anthropic, OpenAI, Google Gemini/Gemma, Meta, Qwen, Mistral, DeepSeek, Microsoft, Nomic, Mixedbread — and `systemBrands` + `BrandMark` for the OS (macOS, Windows, Linux) and chip maker (Apple, Intel, AMD, Qualcomm), all from `public/brands/`. Sources: Simple Icons, Wikimedia Commons public-domain/CC0/MIT files, or the company's site), `useModelDownload.ts`. Model ids are shown through `lib/modelDisplay.ts` (`modelDisplayName`, `modelHint`, `providerDisplayName`); the raw id stays in tooltips and is what gets saved.

**`settings/`**: `SettingsParts.tsx` (`SettingsHeader`, `SettingsCard`, `Switch`, `DetailRow`, `StatusLine`) shared by the `/settings/*` pages.

**`assistant/`**

| File | Purpose |
|---|---|
| `InitialView.tsx`, `AssistantGreeting.tsx` | Empty state: headline and the composer in its `hero` layout |
| `ChatView.tsx` | Active chat: thread, composer, side panel, approval answers, startup hand-off |
| `ChatInput.tsx` | Composer. Context bar (Choose startup, Workflows), then a toolbar: **Files & Sources** (add files, browse documents, Connectors — all "Soon" for now, filtered by Settings → Connectors, with a Manage connectors link — and the active sanctions lists), **Tools** (focus: sanctions screen, review matches, ownership trace, web research, draft memo; shown as a pill while on), **Mention** (inserts `@` and opens the startup picker), `ModelPicker` (`showProviderMenu`) and send. `hero` adds quick-action chips under the box. @-mentions as before. Focus definitions: `lib/chatFocus.ts`, icons: `focusIcons.ts` |
| `AssistantMessage.tsx` | An assistant turn: Markdown (+ KaTeX), tool steps, plans, approvals, generated documents, screening card, option chips |
| `UserMessage.tsx` | User bubble with files and workflow tag |
| `AssistantSidePanel.tsx` | Tabbed side panel (documents, citations, screening results) |
| `AgentPlan.tsx`, `ApprovalCard.tsx` | Live plan; Allow/Deny before a sensitive tool |
| `AssistantWorkflowModal.tsx`, `StartupMentionMenu.tsx`, `SelectAssistantProjectModal.tsx`, `AddDocButton.tsx` | Pickers and attachments |

**`screen/`**: `ScreeningResultsPanel.tsx`, `OwnershipGraph.tsx` (`@xyflow/react`; startup at the bottom, owners above; red flagged, amber review), `RiskTable.tsx`, `RiskCard.tsx`, `EntityDetailModal.tsx`, `OwnershipChainVisual.tsx`, `WatchmanMatchDetails.tsx`, `ScreeningProgressSteps.tsx`, `ScreenerAssistantMessage.tsx` (startup chat message, incl. approval cards), `chatTypes.ts`.

**`startups/`**: `StartupsPage.tsx`, `StartupScreenerPage.tsx`, `NewStartupModal.tsx`, `CsvIngestReview.tsx`, `CapTableCsvView.tsx`, `StartupAnalysisDock.tsx`, `StartupDocumentsPanel.tsx`, `StartupChatPanel.tsx`, `ScreeningFollowUpActions.tsx`, `ScreeningDeltaBanner.tsx`, `ScreeningDigestBanner.tsx`, `IcMemoDownloadCard.tsx`, `PortfolioMonitoringCard.tsx`, `CompareStartupsModal.tsx`, `StartupAuditMenu.tsx`, `auditEventDisplay.tsx`, `WatchFolderButton.tsx`.

**`projects/`**: `ProjectExplorer.tsx` (flat document list for the startup-scoped chat; drag a document into the chat to attach it).

**`tabular/`**: `TabularReviewView.tsx` (`TRView`), `TRTable.tsx`, `TabularCell.tsx`, `TRSidePanel.tsx`, `TRChatPanel.tsx`, `TREditColumnMenu.tsx`, `AddColumnModal.tsx`, `AddNewTRModal.tsx`, `columnPresets.ts`, `columnFormat.ts`, `pillUtils.ts`, `citation-utils.ts`, `exportToExcel.ts`.

**`workflows/`**: `WorkflowList.tsx`, `DisplayWorkflowModal.tsx`, `NewWorkflowModal.tsx`, `WorkflowPromptEditor.tsx`, `WFEditColumnModal.tsx`, `WFColumnViewModal.tsx`, `practices.ts` (practice-area labels).

**`shared/`**: `AppSidebar.tsx`, `SidebarChatItem.tsx`, `DesktopShell.tsx`, `ChatMarkdown.tsx`, `MessageOptionChips.tsx`, `PreResponseWrapper.tsx`, `DocPanel.tsx` (document / citation views), `DocView.tsx` (PDF.js), `DocxView.tsx` (docx-preview), `StartupDocumentView.tsx`, `highlightQuote.ts`, `highlightDocxQuote.ts`, `AddDocumentsModal.tsx`, `AddProjectDocsModal.tsx`, `FileDirectory.tsx`, `useDirectoryData.ts`, `ProjectPicker.tsx`, `OwnerOnlyModal.tsx` (read-only sample notice), `RowActions.tsx`, `HeaderSearchBtn.tsx`, `ToolbarTabs.tsx`, `RenameableTitle.tsx`, `ResizeDivider.tsx`, `types.ts` (`App*` types).

### 13.5 Hooks, contexts and libraries

| File | Purpose |
|---|---|
| `app/hooks/useAssistantChat.ts` | Assistant state machine: SSE events, approvals, plans, screening results, generated documents, saving chats |
| `app/hooks/useScreenerChat.ts` | Startup page chat on `POST /chat`: one streaming routine for a new turn and an approval resume; CSV and result carried across turns |
| `app/hooks/useFetchSingleDoc.ts`, `useFetchDocxBytes.ts` | Document bytes (PDF vs DOCX) with a shared cache |
| `app/hooks/useGenerateChatTitle.ts`, `useIsMobile.ts` | Small hooks |
| `app/contexts/ChatHistoryContext.tsx`, `SidebarContext.tsx`, `OnboardingTourContext.tsx` | Chat list, sidebar state, driver.js tour |
| `app/lib/capScreenApi.ts` | Projects, documents, chats, streaming, tabular, workflows |
| `app/lib/screenerApi.ts` | Startup chat stream + resume, tool labels |
| `app/lib/auditLogApi.ts` | Audit log client |
| `lib/startupsApi.ts`, `aiControlCenterApi.ts`, `desktopDataApi.ts`, `portfolioApi.ts` | Domain clients |
| `lib/screenerTypes.ts` | Re-exports `backend/src/types/screening.ts` + `CsvIngestAnalysis`, `GraphPreview`, progress types |
| `lib/downloadIcMemo.ts`, `icMemoPrompt.ts`, `screeningExplainApi.ts` | Memo export (.doc, PDF via desktop print), memo prompt, on-demand narrative |
| `lib/assistantScreening.ts`, `assistantStartupHandoff.ts`, `screenerInitialPrompt.ts` | Latest screening from messages, page hand-off, default screening prompt |
| `lib/parseMessageOptions.ts`, `normalizeAppMessages.ts`, `onboardingTour.ts`, `workflowAssetIds.ts` | Option chips, clean persisted messages, tour, asset ids |
| `lib/apiCache.ts`, `requestDedup.ts`, `utils.ts`, `escapeHtml.ts`, `types.ts` | Client TTL cache, in-flight dedup, `cn()` and Dice coefficient, escaping, misc types |
| `components/app-logo.tsx`, `chat/capscreen-icon.tsx`, `providers.tsx`, `ui/*` | Brand marks, animated chat icon, context providers, shadcn primitives (`button`, `input`, `password-input`, `dropdown-menu`) |

---

## 14. Workflows and tabular review

### 14.1 Built-in workflows

Defined once in `backend/src/lib/workflows/builtinWorkflows.ts`, served to the UI by `GET /workflows` (with `is_system: true`) and to the agent by `read_workflow`.

| Id | Title | Type |
|---|---|---|
| `builtin-cap-table-screen` | Cap Table Sanctions Screen | assistant |
| `builtin-entity-roster-screen` | Entity Roster Sanctions Screen | assistant |
| `builtin-co-investor-vendor-screen` | Co-Investor & Vendor Screening | assistant |
| `builtin-flagged-entity-investigation` | Flagged Entity Investigation | assistant |
| `builtin-ic-memo` | IC Compliance Memo | assistant |
| `builtin-portfolio-sanctions-brief` | Portfolio Sanctions Brief | assistant |
| `builtin-aml-screening-summary` | AML Screening Summary | assistant |
| `builtin-cap-table-review` | Cap Table Sanctions Review | tabular |
| `builtin-entity-roster-review` | Entity Roster Sanctions Review | tabular |
| `builtin-portfolio-monitoring` | Portfolio Sanctions Monitoring | tabular |
| `builtin-sanctions-triage` | Sanctions Triage Queue | tabular |
| `builtin-aml-counterparty-kyc` | AML Counterparty KYC Review | tabular |

An **assistant** workflow is a Markdown prompt: selecting one prefixes the message with `[Workflow: … (id: …)]` and the agent calls `read_workflow` first. A **tabular** workflow is a column schema. Users can create, edit and delete their own workflows and hide built-ins.

### 14.2 Tabular review

- A review is a grid: rows are documents or entities, columns have prompts and formats; cells hold `{summary, flag, reasoning}`.
- `reviewKind`: `standard` (cells generated by the LLM from documents), `entity_screening` (rows are graph entities, cells straight from the screening result), `portfolio_monitoring` (rows are startups, kept in sync after every screen and re-screen).
- The **Status** column is for the human. Typing `cleared`, `escalated`, `blocked` or `pending` writes back to `EntityReview` or the startup's portfolio status.
- Each review has its own chats, with the grid injected as a Markdown table. Export to Excel in the browser.

---

## 15. Security model

| Layer | Control |
|---|---|
| Network exposure | Backend and UI bind to `127.0.0.1` only; Express `trust proxy` off |
| Local API access | Random per-launch token (`x-capscreen-token`), checked with `timingSafeEqual`; added by the main process, never visible to page JS in packaged builds |
| Renderer | Sandboxed preload, validated IPC, external URLs open in the browser |
| Secrets | Master key sealed by OS keychain; API keys AES-256-GCM in `ai/secrets.json`; session token sealed; secrets never sent to the UI |
| Dev-env leakage | Desktop backend never reads `.env`; cloud-redirecting env vars are stripped; the UI build deletes traced `.env*` files |
| File downloads | HMAC-signed short-lived URLs |
| Prompt injection | Uploaded CSV/doc text and entity names XML-escaped and wrapped; untrusted-data guard in prompts |
| Egress | Local-only mode blocks cloud models; `DATA_RESIDENCY` blocks PII to remote models; `web_search` needs approval in both chat surfaces |
| Auditability | Audit log for uploads, screens, reviews, documents, tool approvals; signed-in email recorded; hash-chained export; list versions/hashes on each screening |
| Auth service | RS256 JWTs, hashed refresh tokens with rotation, login lockout, rate limits, email verification, PKCE + loopback-only redirect, one-time codes with TTL, strict CSP |
| Known gaps | DB not encrypted at rest; builds unsigned; paused agent runs held in memory; no rate limiting on the loopback API (single user, token-gated) |

---

## 16. Environment variable reference

**Set by the desktop shell for the backend** (do not set by hand): `HOST`, `PORT`, `NODE_ENV`, `WATCHMAN_URL`, `CAPSCREEN_DATA_DIR`, `CAPSCREEN_DESKTOP_TOKEN`, `CAPSCREEN_MASTER_KEY`, `CAPSCREEN_API_ORIGIN`, `CAPSCREEN_CORPUS_DIR`, `FRONTEND_URL`.

**Desktop shell (dev)**: `CAPSCREEN_DEV`, `CAPSCREEN_SKIP_AUTH`, `CAPSCREEN_AUTH_URL`, `CAPSCREEN_REMOTE_DEBUG`, `CSC_*` (signing). Frontend build: `CAPSCREEN_DESKTOP_BUILD`.

**Backend, browser-only dev / tuning**

| Group | Variables |
|---|---|
| Models | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_UTILITY_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_SUPPORTS_TOOLS`, `LLM_CONFIG_FILE`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` |
| Ollama | `OLLAMA_HOST`, `OLLAMA_NUM_CTX`, `OLLAMA_MODELS`, `LOCALAPPDATA` (Windows install detection) |
| Watchman / screening | Thresholds saved in Settings → Screening take precedence over these. `WATCHMAN_URL`, `SCREENING_WATCHMAN_MIN_MATCH` (0.80), `SCREENING_FLAGGED_MIN_SCORE` (0.95), `SCREENING_REVIEW_MIN_SCORE` (0.80), `SCREENING_UBO_PCT_THRESHOLD` (25), `SCREENING_OFAC_50_PCT_THRESHOLD` (50), `SCREENING_WATCHMAN_RESULT_LIMIT` (10), `SCREENING_WATCHMAN_DEBUG`, `SCREENING_LOG` |
| RAG / uploads | `RAG_CHUNK_MAX_TOKENS` (450 words), `RAG_TOP_K` (6), `RAG_EMBED_BATCH_SIZE`, `RAG_UPLOAD_MAX_MB`, `DOCUMENT_UPLOAD_MAX_MB` |
| Policy | `DATA_RESIDENCY` (`restricted`/`eu`/`in`), `AUDIT_LOG_RETENTION_DAYS` (1825) |
| Monitoring | `DIGEST_WEBHOOK_URL` (the schedule itself lives in `settings.json`) |
| Web search | `TAVILY_API_KEY` |
| Storage | `CAPSCREEN_DB` (`mongodb` for the auth service), `CAPSCREEN_DB_FILE`, `MONGODB_URI` |
| Auth service | `JWT_ACCESS_TOKEN_SECRET_PRIVATE`, `JWT_ACCESS_TOKEN_SECRET_PUBLIC`, `JWT_ACCESS_TOKEN_EXPIRATION_MINUTES`, `REFRESH_TOKEN_EXPIRATION_DAYS`, `DESKTOP_REFRESH_TOKEN_EXPIRATION_DAYS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_APP_NAME`, `EMAIL_LOGO_URL`, `FRONTEND_URL`, `AUTH_PORT` |

**Frontend**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL` (metadata base URL).

---

## 17. Dependency reference

### 17.1 Backend

| Package | Used for |
|---|---|
| `express`, `helmet`, `cors`, `cookie-parser`, `multer` | HTTP server, headers, CORS, cookies, uploads |
| `express-rate-limit` | Auth service rate limits |
| `mongoose` | Models and queries (SQLite shim on desktop, Atlas for auth) |
| `graphology` | Ownership graph |
| `@langchain/langgraph` (+ peer `@langchain/core`) | Agent orchestration only |
| `@anthropic-ai/sdk`, `openai` | LLM adapters |
| `pdf-parse`, `mammoth`, `@thednp/dommatrix` | PDF/DOCX text, DOMMatrix polyfill |
| `bcryptjs`, `jsonwebtoken`, `resend` | Auth service: password hashes, JWTs, email |
| `dotenv` | `.env` loading in dev |
| dev: `typescript`, `tsx` (also the test runner wrapper), `prettier`, `@types/*` | Build, run, test, format, typings |

### 17.2 Frontend

| Package | Used for |
|---|---|
| `next`, `react`, `react-dom`, `@next/env` | Framework, root `.env` loading |
| `@xyflow/react` | Ownership graph |
| `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex` | Chat Markdown + math |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `tiptap-markdown` | Workflow prompt editor |
| `pdfjs-dist` (4.10.38), `docx-preview`, `docx` | PDF/DOCX viewing and generation |
| `exceljs` | Tabular export |
| `driver.js` | Onboarding tour |
| `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` | shadcn/ui primitives and icons |
| dev: `tailwindcss` v4, `@tailwindcss/postcss`, `tw-animate-css`, `eslint`, `eslint-config-next`, `typescript`, `baseline-browser-mapping`, `@types/*` | Styling, compiler, lint |

### 17.3 Desktop

Dev only: `electron` 43.7.9, `electron-builder` 26.17.0, `esbuild` 0.25.4, `cross-env`, `typescript`, `@types/node`. The packaged app also ships the Watchman Go binary (v1.2.1, built from source).

### 17.4 Internal module dependencies

```
routes/assistantChat.ts, routes/tabularReview.ts
   └─▶ lib/agent/agentGraph ─▶ lib/llm/providers (getLlm) ─▶ controlCenter/store
   │                         └▶ lib/agent/runTools ─▶ lib/tools/registry ─▶ lib/tools/*
   └─▶ lib/chat/buildSystemPrompt, startupMentions, projectAssets; lib/workflows/workflowMemory
lib/tools/screenCapTable ─▶ lib/screening/runScreening
lib/screening/runScreening ─▶ csvIngest (─▶ parseCapTable, inferCsvSchema ─▶ llm/complete)
                           ─▶ graph ─▶ watchman (─▶ infra/cache, requestDedup)
                           ─▶ classify ─▶ ownershipExposure ─▶ explain (─▶ llm/complete, shared/dataResidency)
lib/tools/searchTools ─▶ lib/rag/* ; lib/tools/generateDocumentTool ─▶ documentTypes ─▶ lib/documents/*
lib/portfolio/rescreenScheduler ─▶ runScreening, screeningDelta, portfolioGrid ─▶ lib/tabular/*
every route ─▶ models/* ─▶ mongoose ─▶ lib/infra/db ─▶ sqliteStore (or MongoDB for auth)

desktop/main ─▶ sidecars (Watchman, backend, UI) ─▶ protocol (proxy + token)
             ─▶ vault, session ─▶ authFlow ─▶ auth service (cloud)
             ─▶ notifications ─▶ backend /api/portfolio/digest
frontend pages ─▶ components ─▶ app/lib/*Api + lib/*Api ─▶ apiBase() ─▶ capscreen://app/__api ─▶ backend
frontend/lib/screenerTypes ─(type-only)▶ backend/src/types/screening
```

---

## 18. Sample data, corpus and other assets

### 18.1 `backend/sample-data/`

| File | Content |
|---|---|
| `sample-cap-table.csv` | 38-row strict cap table for **NexaFlow AI Inc** (Series A). Planted cases: clean founders and funds; fuzzy-match review names ("Mohammed Al Rahman", "Johan Petrovitch Kozlov" under Gamma Holdings, ~13% effective stake); a person hidden four layers deep (Cascade SPV → Meridian Offshore → Ashford Family Trust → **Ivan Petrovich Kozlov**, 12% effective stake); a circular structure (Apex Circular Holdings ↔ Loopback Holdings) |
| `DEMO.md` | Walkthrough and expected results per entity |
| `sample-entity-roster.csv` | Shareholder schedule (passport, country, shares, %) — exercises roster detection |
| `sample-co-investors.csv`, `sample-vendors.csv` | Co-investor and vendor rosters |
| `showcase/` | Extended ~85-row cap table, seed notes, demo DD checklist and memo |

Against today's OFAC/EU lists every name in `sample-cap-table.csv` comes back clear, so the planted review/flagged results in `DEMO.md` don't reproduce (section 20.3).

### 18.2 `backend/compliance-corpus/`

`ofac-escalation-playbook.md` (≥95% escalate to CCO within 24 h; 80–94% analyst review within 5 business days; <80% record clearance) and `review-tier-guidance.md`. Searched by `search_compliance_playbook`; bundled next to the desktop backend.

### 18.3 Docs and images

`docs/architecture-diagram.svg` and `docs/screening-flow.svg` are the README diagrams. Brand marks are in `frontend/public/` and `backend/src/assets/`; desktop icons in `desktop/resources/icons/`.

---

## 19. Claude Code configuration (`.claude/`)

| Path | Content |
|---|---|
| `PROJECT.md`, `README.md` | Capability map, runtime agent flow, agent list, slash commands, memory layout |
| `agents/` | `sanctions-screening-agent`, `compliance-security-auditor`, `workflow-author`, `prompt-enhancer`, deprecated `dpdp-security-auditor` |
| `commands/` | `/compliance-agent-feature` (add a tool end to end), `/compliance-parity-check`, `/compliance-rag-roadmap`, `/init-memory`, `/make-agent`, `/new-project-setup`, `/rag-chat-app` (legacy alias) |
| `agent-memory/project/` | Checked-in memories: architecture, compliance language (use "potential match", avoid "confirmed sanctioned"), platform parity, tools registry |
| `templates/` | `agent-memory-system.md`, `compliance-platform-patterns.md` |
| `hooks/log-commands.sh` | PostToolUse hook logging every tool call to `.claude/logs/commands.jsonl` (git-ignored) |
| `settings.local.json` | Local (untracked) permission allow-list and the hook registration |

---

## 20. Cleanup log, known gaps and findings

### 20.1 What the `cleanup/simplify` branch changed

| Area | Change |
|---|---|
| Tests | Added `backend/test/` (33 tests) on Node's test runner; wired into `pnpm test`, the pre-commit hook and CI. `typecheck` now covers scripts and tests. The two ad-hoc check scripts and `verify-workflow-memory.ts` were replaced by tests. |
| One chat backend | `POST /api/chat`, its separate prompt and the screener tool registry were removed. The startup page chat uses `POST /chat` with `startup_id`, keeps its own UI, and now shows approval cards for `web_search`. |
| Workflows | Built-ins defined once in the backend (the frontend copy had drifted; its richer tabular columns were kept) and served by `GET /workflows`. |
| Shared types | The frontend re-exports `backend/src/types/screening.ts` instead of keeping a drifting copy. |
| Single-user cleanup | Removed workflow sharing, review sharing/people, invite emails, per-user sample hiding (deleting a sample now soft-deletes it), the per-user API-key system (`/user/*`, which could not work on desktop), and rate limiting on the token-gated loopback API. |
| Template leftovers | Removed in-app login/signup/reset/verify pages, auth headers, `UI_PREVIEW_MODE`, the old model picker (a new `ModelPicker` was added later), project folders, document versions, tracked-change edit cards and DOCX change highlighting (it called a non-existent `/tracked-change-ids` route on every DOCX render), the unlinked `ProjectPage`, dead SSE handlers (`reasoning*`, `doc_read/find/replicated/edited`, `citations`, `chat_title`), and about 30 unused components and helpers. |
| Server era | Removed `docker-compose.yml`, `backend/Dockerfile`, `.dockerignore`, `nixpacks.toml`, `atlas-indexes/`, OpenNext/Cloudflare config and scripts, and unused dependencies (`@aws-sdk/*`, `@upstash/redis`, `recharts`, `marked`, `nextjs-toploader`, `@uiw/react-md-editor`, `rehype-raw`, `remark-gfm-configurable`, `@openrouter/sdk`, `wrangler`, `@opennextjs/cloudflare`, some `@types/*`). |
| Backend simplifications | One Watchman cache instead of seven response caches (the startup caches could serve a result up to 30 s stale after a screen); eight unused barrel files removed; `POST /api/screen` and `/stream` removed (no callers); unused `/projects` write routes removed. |
| Small fixes | The project chat explorer now loads the startup's documents from `GET /projects/:id` (preview mode used to skip them); `reset-database.ts` prints the real database it clears; auth-service startup warnings are actually logged; the desktop shell also strips `CAPSCREEN_DB` and `LLM_CONFIG_FILE` from the backend env. |
| Settings | Account and Data & Backup became one `/settings` area (Account, AI Control Center, Screening, Sanctions data, Backup & audit, About); the AI Control Center moved from `/ai` to `/settings/ai`. Screening thresholds became configurable in the app (previously env-only, which the desktop backend never reads) and are recorded on every result. `settings.test.ts` added. |
| Dead code (Nov 2026) | Removed ~30 unused exports (old API helpers, chat/RAG helpers, unused types, deprecated aliases such as `ConnectProviderMenu` and `RoleAssignments`), the template's `lib/types.ts`, and unused frontend packages (`@radix-ui/react-icons`, `mammoth`, `babel-plugin-react-compiler`). Redirect-only pages (`/`, `/settings`, `/account`, old startup chats) became `next.config.ts` redirects. |
| Docs | `AGENTS.md`, `README.md`, `docs/AGENT_HARNESS.md`, `docs/DESKTOP_PLAN.md`, `.claude/*` and `.env.example` updated to the current code. |

Net effect: about 14,000 fewer lines of source (≈ 21%), lint warnings 153 → 127, no new dependencies.

### 20.2 Still open

- Paused approval runs are lost on restart (`MemorySaver`); tabular grid chat has no approval UI.
- Citation rendering in `AssistantMessage` / `TRChatPanel` / `DocPanel` remains although the backend never sends citations; it renders nothing without them.
- `practices.ts` still offers legal practice areas (Litigation, Real Estate, …) in the new-workflow form.
- Large files: `TRChatPanel.tsx` (1,170 lines), `AssistantMessage.tsx` (1,107, was 1,913), `useAssistantChat.ts` (991, was 1,351), the startup-scoped chat page (894, was 1,153).
- Code signing, notarization and auto-update; Windows/Linux builds on their own OSes; database encryption at rest.

### 20.3 Findings from live testing

- **Exact SDN names score 0.81 with Watchman v1.2.1.** Screening a roster with "Nicolas Maduro Moros" and "Vladimir Vladimirovich Putin" returned both as **review** (top score 0.812), not **flagged** (≥ 0.95). With this engine version the flagged tier may be close to unreachable; the query parameters need a look, and the flag threshold can now be lowered in Settings → Screening.
- **The OFAC 50% rule treats review-tier hits as sanctioned.** A 0.80 fuzzy match on a person who owns 100% of a holding company escalates every company above it (up to a 65%-owned fund) to **flagged**. Pinned by `ownership.test.ts`; worth a product decision.
- **Demo data no longer reproduces.** All 38 entities in `sample-cap-table.csv` are clear against today's OFAC/EU lists.

---

## 21. Commands cheat sheet

```bash
# Setup
pnpm install
pnpm --filter capscreen-desktop run build:watchman   # once; needs Go 1.24+

# Run
pnpm desktop                    # Electron + all sidecars (dev), data in ~/Library/Application Support/CapScreen
CAPSCREEN_SKIP_AUTH=1 pnpm desktop                       # skip sign-in (dev only)
pnpm --filter vc-screener-backend auth:dev               # local auth service on :4100
pnpm dev                        # browser-only: backend :3001 + Next :3000, data in ~/.capscreen
docker compose -f docker-compose.dev.yml up              # Watchman for browser-only dev

# Quality
pnpm -w run typecheck           # backend tsc (src, scripts, tests)
pnpm -w run test                # backend tests
pnpm -w run lint                # frontend eslint
pnpm --filter capscreen-desktop run typecheck

# Build / package
pnpm build                      # backend tsc + next build
pnpm --filter capscreen-desktop run dist:mac   # DMG (arm64 + x64)
pnpm desktop:dist               # all targets

# Data / demo
pnpm --filter vc-screener-backend run seed:demo
pnpm --filter vc-screener-backend run db:reset
pnpm --filter vc-screener-backend run generate:jwt-keys
```

---

## 22. Glossary

| Term | Meaning |
|---|---|
| Cap table | Who owns what percentage of a company |
| UBO | Ultimate beneficial owner: the person at the top of an ownership chain |
| OFAC / SDN | US Treasury's Office of Foreign Assets Control and its Specially Designated Nationals list |
| EU CSL / UK CSL / UN CSL | EU, UK (OFSI) and UN consolidated sanctions lists |
| OFAC 50% rule | An entity owned 50% or more, in aggregate, by blocked persons is itself treated as blocked |
| Watchman | Moov's open-source sanctions-list matching server (Go) |
| Entity roster | A flat list of names to screen (no ownership edges) |
| Effective / indirect stake | A party's share of the startup through all chains (product of percentages, summed) |
| Review / flagged | 0.80–0.95 match (human review) / ≥ 0.95 match (escalate) |
| IC memo | Investment-committee compliance memo |
| Sidecar | A helper process supervised by the Electron main process |
| PKCE / RFC 8252 | OAuth for native apps: browser sign-in with a loopback redirect and a code verifier |
| `safeStorage` | Electron API that encrypts data with the OS keychain |
| SSE | Server-Sent Events, the streaming format for chat and progress |
| RAG | Retrieval-augmented generation: search uploaded documents and give the snippets to the model |

---

## 23. Suggested study order

1. `README.md`, then sections 1 and 3 of this guide.
2. `backend/sample-data/sample-cap-table.csv` + `DEMO.md`, and `backend/test/ownership.test.ts`, which states the expected numbers.
3. The engine: `types/screening.ts` → `lib/screening/runScreening.ts` → `csvIngest.ts` → `graph.ts` → `watchman.ts` → `classify.ts` → `ownershipExposure.ts` → `explain.ts`.
4. The API around it: `src/index.ts` → `routes/startups/index.ts` → `routes/screening/startupRoutes.ts`.
5. The agent: `docs/AGENT_HARNESS.md` → `lib/agent/agentGraph.ts` → `lib/tools/index.ts` → `routes/assistantChat.ts`.
6. Models: `lib/llm/providers/registry.ts` → `controlCenter/store.ts` → `routes/aiControlCenter.ts`.
7. Storage: `lib/infra/db.ts` → `sqliteStore/store.ts` → `test/sqliteStore.test.ts`.
8. Desktop: `docs/DESKTOP_PLAN.md` → `desktop/src/main.ts` → `sidecars.ts` → `protocol.ts` → `session.ts`/`authFlow.ts`.
9. UI: `app/(pages)/layout.tsx` → `startups/StartupScreenerPage.tsx` → `screen/ScreeningResultsPanel.tsx` + `OwnershipGraph.tsx` → `hooks/useScreenerChat.ts` → `hooks/useAssistantChat.ts`.
10. Run it: `pnpm desktop`, set up a model in Settings → AI Control Center (`/settings/ai`), create a startup, upload `sample-cap-table.csv`, and follow the logs in `<userData>/logs/`.
