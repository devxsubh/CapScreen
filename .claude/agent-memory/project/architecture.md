---
name: architecture
description: CapScreen runtime topology and service boundaries
metadata:
  type: project
---

## Runtime (desktop app)

- **Electron shell** (`desktop/`) starts three loopback sidecars on free ports: Watchman (bundled Go binary), the Express backend (utilityProcess, per-launch token) and the Next.js standalone UI. The window loads `capscreen://app`; `/__api/*` is proxied to the backend with the token.
- **Data:** SQLite at `<userData>/capscreen.db` via the mongoose driver shim (`backend/src/lib/infra/sqliteStore/`); files under `<userData>/files/`.
- **Models:** chosen in the AI Control Center (local Ollama/LM Studio or BYO cloud keys); keys encrypted with a keychain-sealed master key.
- **Cloud:** only the auth service (`backend/src/authApp.ts` + `backend/src/modules/auth/`, Vercel + Atlas) — accounts, never screening data.

Full picture: `docs/DESKTOP_PLAN.md`, `docs/PROJECT_GUIDE.md`.

## Browser-only dev

`pnpm dev` (backend :3001 + Next :3000), root `.env`, data in `~/.capscreen`, Watchman via `docker compose -f docker-compose.dev.yml up`.

## When editing

- The desktop backend never reads `.env`; everything arrives from the shell.
- Screening must fail closed when Watchman is unavailable.
