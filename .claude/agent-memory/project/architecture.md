---
name: architecture
description: CapScreen deployment topology, Docker, and service boundaries
metadata:
  type: project
---

## Deployment (current)

- **Frontend:** Vercel — `frontend/` Next.js 15 app
- **Backend + Watchman:** AWS EC2 — `docker-compose.yml` (two containers on `internal` network)
- **MongoDB:** Atlas (`MONGODB_URI`)
- **Cache:** Upstash Redis (optional Watchman cache)
- **R2:** Cloudflare object storage for documents
- **LLM:** Anthropic Haiku on EC2; OpenAI for RAG embeddings when enabled

Full diagram and env split: `docs/ARCHITECTURE.md`.

## Local vs production

| | Local | Production |
|---|---|---|
| Frontend | `pnpm dev` :3000 | Vercel |
| Backend | `pnpm dev` :3001 | EC2 Docker |
| Watchman | `docker-compose.dev.yml` → :8084 | compose internal `watchman:8084` |
| Env file | `.env` | `.env.production` on EC2; Vercel dashboard for `NEXT_PUBLIC_*` |

## Agent loop (unchanged)

`POST /api/chat` → `runAgentWithTools` → `SCREENER_TOOLS` in `chatTools.ts`.

Screening calls Watchman over Docker network on EC2; over `localhost:8084` locally.

## When editing

- CORS: backend `FRONTEND_URL` must match Vercel origin
- Never expose Watchman publicly in production compose
- Secrets only on EC2 / local `.env` — not in Docker image (see `.dockerignore`)
