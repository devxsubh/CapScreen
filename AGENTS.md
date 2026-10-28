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

- `express` + `helmet`, `cors`, `express-rate-limit`; loopback-only; `middleware/desktopToken.ts` gate; single local user (`middleware/requireAuth.ts`)
- **SQLite via mongoose**: `lib/infra/sqliteStore/` implements the MongoDB driver surface mongoose calls (`node:sqlite`, no native deps). All mongoose models/queries run unchanged. `$vectorSearch` is in-process cosine.
- **Pluggable LLMs** (`lib/llm/providers/`): Anthropic, native Ollama, and OpenAI-compatible (OpenAI, Gemini, OpenRouter, Groq, LM Studio, llama.cpp, any custom endpoint). Roles: `agent`, `utility`, `embedding`.
- **AI Control Center** (`lib/llm/controlCenter/`, `routes/aiControlCenter.ts`): providers, model assignments, local-only policy; API keys AES-256-GCM encrypted with a master key sealed by the OS keychain (Electron `safeStorage`).
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
  → POST /api/startups/:id/csvs  (stored in SQLite)
  → POST /api/chat (send with csvContent)
      → screen_cap_table tool:
          parseCapTable → buildOwnershipGraph → searchWatchman → classifyScore → explainMatch
      → returns ScreeningResult (+ watchmanListInfo) + LLM narrative
  → screeningResult saved to the startup (lastScreeningResult)
  → ScreeningResultsPanel opens: OwnershipGraph + RiskTable + RiskCards
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
  index.ts                  — Express app, rate limiters, route mounts
  routes/
    screen.ts               — POST /api/screen  (one-shot CSV screening, no chat)
    chat.ts                 — POST /api/chat    (agentic Claude chat with tool-use)
    startups.ts             — CRUD /api/startups + /api/startups/:id/csvs
  lib/
    parseCapTable.ts        — CSV → OwnershipRecord[]
    graph.ts                — buildOwnershipGraph, getAllNodes, getEdges, findOwnershipPath
    watchman.ts             — searchWatchman(name, type) → WatchmanMatch[]
    classify.ts             — classifyScore(topScore) → "clear"|"review"|"flagged"
    explain.ts              — explainMatch(node, matches, path, level) → Claude narrative
    runScreening.ts         — orchestrates parse→graph→watchman→classify→explain → ScreeningResult
    chatTools.ts            — SCREENER_TOOLS (Anthropic Tool[]) + createToolExecutor
    llm/
      providers/            — neutral types, Anthropic + OpenAI-compatible adapters, registry (roles: agent/utility/embedding)
      complete.ts           — completeText / chatText (single-shot + multi-turn, provider-neutral)
      streamAgent.ts        — runAgentStream (SSE agentic loop with tool-use; tool-less fallback)
      validateLlm.ts        — boot-time ping of the configured agent model
      index.ts              — re-exports
    infra/db.ts             — opens SQLite store and attaches it to mongoose (applies pending restore)
    infra/sqliteStore/      — MongoDB-driver-compatible store on node:sqlite (query, update, store)
    infra/backup.ts         — encrypted .capscreen-backup create/restore
    infra/folderWatch.ts    — watched data-room folders → auto-ingest
    infra/fileStorage.ts    — local file storage + signed download URLs
    infra/settings.ts       — settings.json (background screening, sanctions lists)
  models/
    startup.ts              — Startup mongoose schema (name, createdAt, lastScreeningResult)
    capTableCsv.ts          — CapTableCsv schema (startupId, filename, content, uploadedAt)
```

### Chat tool-use flow (`chat.ts` + `chatTools.ts`)

The `/api/chat` endpoint runs a Claude agent loop. Four tools are registered:

| Tool | When Claude calls it |
|---|---|
| `screen_cap_table` | User attaches a CSV and wants screening |
| `get_screening_summary` | User asks for counts or a summary |
| `get_entity_details` | User asks about a specific entity |
| `list_entities` | User wants filtered entity lists |

Context is carried per-request: the caller always sends `{ messages, screeningResult, csvContent }`. The handler injects these into the system prompt and the tool executor's context object.

---

## Frontend Source Map

```
frontend/src/
  app/
    (pages)/
      assistant/            — CapScreen compliance assistant (general + screener)
        page.tsx
        chat/[id]/page.tsx
      projects/
        page.tsx            — StartupsPage (list + create startups)
        [id]/page.tsx       — StartupScreenerPage (CSV strip + screener chat)
      screen/page.tsx       — Redirects to /assistant (unused — keep or wire up)
    components/
      screen/               — All screener UI
        ScreenerInitialView.tsx   — Landing view (animated logo + chat input)
        ScreenerChatView.tsx      — Active chat: messages + side panel toggle
        ScreenerChatInput.tsx     — Textarea + CSV file attach button
        ScreenerAssistantMessage.tsx
        ScreeningResultsPanel.tsx — Side panel: graph + risk table + risk cards
        OwnershipGraph.tsx        — React Flow graph (flagged=red, review=yellow)
        RiskTable.tsx             — Entity risk table
        RiskCard.tsx              — Individual flagged/review entity card
        chatTypes.ts              — ScreenerMessage, AssistantEvent types
      startups/
        StartupsPage.tsx          — Startup list with create/delete
        StartupScreenerPage.tsx   — Per-startup: CSV strip + screener chat
      assistant/            — General assistant components (not screener)
      shared/               — AppSidebar, DocPanel, etc.
    hooks/
      useScreenerChat.ts    — Core screener state: messages, screeningResult, csvRef
                              Carries context across all turns in a session
    lib/
      screenerApi.ts        — sendChatMessage, screenCapTable (fetch wrappers)
      capScreenApi.ts       — CapScreen API (projects, chats, documents)
  lib/
    screenerTypes.ts        — ScreeningResult, EntityResult, OwnershipEdge types
    startupsApi.ts          — listStartups, createStartup, listCsvs, saveCsv, etc.
    supabase.ts             — Supabase client
    uiPreview.ts            — UI_PREVIEW_MODE flag
```

### Context carryover in `useScreenerChat`

- `csvRef` (useRef) — holds raw CSV text across turns; passed as `csvContent` to every chat request
- `screeningResult` (useState) — updated when backend returns a new result; passed back each turn
- After a new `screeningResult` arrives → save it to the startup record via `startupsApi` → panel auto-opens
- On startup page load → fetch stored `lastScreeningResult` from MongoDB → inject as initial state

---

## Routing

| URL | Component | Notes |
|---|---|---|
| `/startups` | `StartupsPage` | List + create startups |
| `/startups/:id` | `StartupScreenerPage` | CSV strip + full screener chat |
| `/assistant` | CapScreen compliance assistant | Primary chat shell |
| `/assistant/chat/:id` | Persisted chat view | |
| `/screen` | Redirects → `/assistant` | Unused |
| `/ai` | AI Control Center | Providers, BYO keys, local models, model assignments, local-only mode |
| `/settings/data` | Data & Backup | Sanctions lists/versions, background re-screening, encrypted backup/restore, audit export |

The sidebar shows "Startups" → `/startups` and "Recent Projects" (up to 5).

---

## Sample Data

`backend/sample-data/sample-cap-table.csv` — Series A demo cap table (NexaFlow AI Inc; strict 5-column format). Walkthrough: `backend/sample-data/DEMO.md`.

`backend/sample-data/sample-entity-roster.csv` — flat entity list for roster screening mode.

**CSV ingest** (`backend/src/lib/csvIngest.ts`): strict → heuristic column aliases → Claude schema inference. Supports cap tables (varied column names) and entity rosters. Reference/metadata files (e.g. OpenSanctions sources catalogs) are blocked with guidance. Required fields: cap table needs `entity`, `owner`, `ownership_pct`; roster needs `name`. Watchman matching stays deterministic — AI only maps columns, never decides hits.

---

## Claude Code / platform parity

| Capability | Status | Command / doc |
|---|---|---|
| Agent tool loop | ✅ | `backend/src/lib/llm/streamAgent.ts` |
| Pluggable / local models | ✅ | `backend/src/lib/llm/providers/` |
| Desktop app (Electron) | ✅ | `desktop/`, `docs/DESKTOP_PLAN.md` |
| AI Control Center (BYO keys, local models) | ✅ | `/ai`, `backend/src/routes/aiControlCenter.ts` |
| Persistent agent memory | ✅ seeded | `.claude/agent-memory/project/` |
| Document RAG | ✅ local embeddings | `backend/src/lib/rag/` |
| Chat-first UI shell | ✅ restored | `frontend/.../assistant/` |
| Gap audit | — | `/compliance-parity-check` |

---

## What's Next (Pending Implementation)

See the plan in conversation context for full details. Short version:

1. **Persist `lastScreeningResult` per startup** — Startup model already has the field; need backend PATCH to save it and frontend to call it after screening
2. **Restore graph on page load** — `useScreenerChat` needs `initialScreeningResult` param; `StartupScreenerPage` fetches it on mount
3. **Follow-up chat against stored result** — falls out of 1+2 for free
4. **Fix `/screen` standalone route** — wire `useScreenerChat` directly or remove the redirect

---

## Common Commands

```bash
# Root (pnpm workspace)
pnpm install                        # install all workspaces
pnpm desktop                        # run the desktop app (dev)
pnpm desktop:dist                   # build installers
pnpm dev                            # browser-only dev: backend + frontend on host
pnpm -w run typecheck               # backend tsc --noEmit
pnpm -w run lint                    # frontend eslint

# Desktop only
pnpm --filter capscreen-desktop run build:watchman   # build Watchman binaries (Go)
pnpm --filter capscreen-desktop run typecheck
pnpm --filter capscreen-desktop run dist:mac

# Backend only
pnpm --filter vc-screener-backend run dev
pnpm --filter vc-screener-backend run build
pnpm --filter vc-screener-backend run typecheck

# Frontend only
pnpm --filter capscreen run dev
pnpm --filter capscreen run build
pnpm --filter capscreen run lint

# Watchman for browser-only dev (the desktop app bundles its own)
docker compose -f docker-compose.dev.yml up
```

## TypeScript / Lint Notes

- Backend: strict TypeScript via `tsc`. No `any` casts without reason.
- Frontend: Next.js ESLint config. `pnpm -w run lint` runs before every commit via Husky.
- Do not use `console.log` in production paths — backend uses `console.log` only for startup messages.
