# Architecture — CapScreen

Decision-support platform for screening startup cap tables against sanctions lists. Chat-first UI, agentic backend, deterministic Watchman matching.

**Principle:** The system never decides guilt — it narrows the review set for a human compliance officer.

---

## Deployment topology

![CapScreen system architecture](./architecture-diagram.svg)

_Full SVG (editable): [`docs/architecture-diagram.svg`](./architecture-diagram.svg)_

| Layer | Where it runs | Config |
|-------|---------------|--------|
| Frontend | Vercel | `frontend/` workspace; root env vars in Vercel project settings |
| Backend API | EC2 container | `docker-compose.yml` → `backend/Dockerfile` |
| Watchman | EC2 container (same compose stack) | Internal only; backend uses `WATCHMAN_URL=http://watchman:8084` |
| MongoDB | MongoDB Atlas | `MONGODB_URI` in `.env.production` |
| Redis cache | Upstash | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| Object storage | Cloudflare R2 | `R2_*` vars |
| LLM | Anthropic (+ OpenAI for RAG) | API keys in `.env.production` |

Reverse proxy on EC2 (ALB or nginx) terminates TLS and forwards to `:3001`. Set `TRUST_PROXY_HOPS=1` so rate limits and audit logs see the client IP.

---

## Monorepo layout

```
capscreen/                          pnpm workspace root
├── frontend/                 Next.js app → deployed to Vercel
├── backend/                  Express API → Docker image on EC2
├── docker-compose.yml        Production: backend + watchman on EC2
├── docker-compose.dev.yml    Local: watchman only (host runs pnpm dev)
├── .env                      Local dev (backend + frontend on host)
├── .env.production           EC2 secrets (never commit; create from .env.example)
└── docs/ARCHITECTURE.md      This file
```

---

## Request flow (screening)

```
Browser (Vercel)
  → POST /api/chat  { messages, screeningResult, csvContent }
  → EC2 backend (requireAuth + rate limit)
      → runAgentWithTools (Claude Haiku)
          → screen_cap_table tool
              → parseCapTable / csvIngest
              → buildOwnershipGraph (graphology)
              → searchWatchman (GET /v2/search) — cached via Upstash when configured
              → classifyScore → explainMatch (Claude narrative)
      → { content, screeningResult, toolActivity }
  → MongoDB Atlas (persist startup, CSV, lastScreeningResult)
  → UI: ScreeningResultsPanel (React Flow graph + risk table + cards)
```

One-shot screening without chat: `POST /api/screen`.

---

## Docker images

### Backend (`backend/Dockerfile`)

Multi-stage build:

1. **Builder** — `pnpm install --frozen-lockfile`, `tsc` → `backend/dist`
2. **Runner** — `pnpm deploy --prod` standalone bundle, non-root `app` user, healthcheck on `GET /health`

Secrets are **not** baked into the image. Runtime env comes from `.env.production` via compose `env_file`.

### Watchman

Official image `moov/watchman:static`. Loads OFAC SDN + EU Consolidated lists on startup (~30–60 s). Healthcheck: `GET /ping`.

In production, Watchman has **no host port mapping** — only the backend container can reach it on the `internal` Docker network.

---

## Environment split

| Variable | Local (`.env`) | Production |
|----------|----------------|------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | EC2 public URL (or ALB) |
| `FRONTEND_URL` | `http://localhost:3000` | Vercel deployment URL (CORS + cookies) |
| `WATCHMAN_URL` | `http://localhost:8084` | Set by compose: `http://watchman:8084` |
| `MONGODB_URI` | local mongod or Atlas | Atlas connection string |
| `NODE_ENV` | development | `production` (set in compose) |
| `ALLOW_PREVIEW_MODE` | optional for local | **never** in production |

Vercel needs at minimum: `NEXT_PUBLIC_API_BASE_URL` pointing at the EC2 backend. Backend `.env.production` on EC2 needs the matching `FRONTEND_URL` for CORS.

---

## Local development

Two modes — pick one:

### A. Host-native (default)

```bash
docker compose -f docker-compose.dev.yml up   # Watchman on :8084
cp .env.example .env && pnpm install
pnpm dev                                       # backend :3001 + frontend :3000
```

### B. Production parity (EC2-like)

Use Atlas + Upstash from `.env` the same way production does; only Watchman runs in Docker locally unless you also test the full compose stack on a dev machine.

---

## Production deploy

### EC2 (backend + Watchman)

```bash
cp .env.example .env.production   # fill secrets; do not commit
docker compose --env-file .env.production up -d --build
docker compose ps                  # backend healthy after watchman loads
curl https://<your-api-host>/health
```

### Vercel (frontend)

- Root directory: `frontend` (or monorepo with `frontend` as app path)
- Build: `pnpm --filter capscreen build` (or Vercel auto-detect)
- Environment: `NEXT_PUBLIC_API_BASE_URL=https://<api-host>`

Redeploy Vercel whenever the public API URL changes. Redeploy/restart EC2 when backend env or Docker image changes.

---

## Backend modules (logical)

| Area | Path | Role |
|------|------|------|
| HTTP entry | `backend/src/index.ts` | Express, CORS, rate limits, route mounts |
| Screening | `backend/src/lib/screening/` | parse, graph, watchman, classify, runScreening |
| Agent loop | `backend/src/lib/llm/agent.ts`, `chatTools.ts` | Claude tool-use |
| Auth | `backend/src/lib/auth/`, `middleware/requireAuth.ts` | JWT RS256, cookies |
| RAG | `backend/src/lib/rag/` | embeddings, vector search (Atlas) |
| Infra | `backend/src/lib/infra/` | db, cache, R2, rate limits |

---

## Frontend modules (logical)

| Area | Path | Role |
|------|------|------|
| Assistant shell | `frontend/src/app/.../assistant/` | Chat-first compliance UI |
| Screener | `frontend/src/app/components/screen/` | Graph, risk table, chat |
| Startups | `frontend/src/app/components/startups/` | Deal folders, CSV strip |
| API clients | `frontend/src/lib/screenerApi.ts`, `startupsApi.ts` | Fetch wrappers to EC2 |

Session context (`useScreenerChat`): `csvRef` + `screeningResult` sent on every chat turn so follow-ups stay grounded in the last screen.

---

## Security notes

- Watchman is not exposed to the public internet in production.
- `ANTHROPIC_API_KEY` and other secrets live only on EC2 (and local `.env`); Vercel gets `NEXT_PUBLIC_*` only.
- Auth uses httpOnly cookies; `FRONTEND_URL` must exactly match the Vercel origin for CORS.
- Preview mode bypasses auth — local dev only.

---

## Related docs

- `CLAUDE.md` — source map and commands for AI assistants
- `.claude/PROJECT.md` — platform capability map and agents
- `.env.example` — full env reference
