# CapScreen Desktop — Conversion Plan

Goal: ship CapScreen as a native desktop app (Electron) where **no cap-table,
document, or screening data leaves the machine** unless the user explicitly
opts into a cloud model. The hosted web build (Vercel + EC2) keeps working from
the same codebase.

## Decisions (2026-10-25)

| Question | Decision |
|---|---|
| Local database | **SQLite** — implemented as a MongoDB-driver-compatible store under mongoose (`node:sqlite`), so no call sites changed. |
| Web version | **Desktop only** (revised 2026-10-25: no server costs). Cloud services removed from the runtime. |
| Feature priority | Local model onboarding, background re-screening, exports & backup, folder watch + sanctions-list versioning. |

## Runtime topology (desktop)

```
Electron main
 ├─ Watchman sidecar      127.0.0.1:<rand>   (Go binary, bundled per-OS)
 ├─ Express backend       127.0.0.1:<rand>   (utilityProcess; per-launch bearer token)
 │    └─ SQLite file      <userData>/capscreen.db
 │    └─ Documents        <userData>/documents/
 ├─ Next standalone       127.0.0.1:<rand>   → BrowserWindow
 └─ Secrets               OS keychain via safeStorage → injected as env to backend
```

Network egress in desktop mode is limited to: sanctions-list downloads (can be
disabled via offline import) and cloud LLM/embedding calls **only** when the
user selects a non-local provider. The UI shows an egress indicator.

## Cloud dependency → desktop replacement

| Server mode | Desktop mode |
|---|---|
| MongoDB Atlas (mongoose, ~170 live call sites) | SQLite via repositories |
| Atlas `$vectorSearch` (`lib/rag/retrieveChunks.ts`) | In-process cosine over per-startup chunks |
| Cloudflare R2 (`lib/infra/r2Storage.ts`) | Local filesystem |
| Upstash Redis (`lib/infra/cache.ts`) | In-memory (already the fallback) |
| JWT cookies + Resend email auth | Single local user; optional OS-auth app lock |
| Watchman in Docker | Bundled Watchman binary |
| Anthropic-only LLM | Pluggable providers (see Phase 1) |
| Web search tool | Off by default; flagged as egress |

## Phases

### Phase 1 — Pluggable model providers ✅ done
`backend/src/lib/llm/providers/`: provider-neutral message/tool/stream types,
an Anthropic adapter, and one OpenAI-compatible adapter covering Ollama,
LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter, Groq, Gemini (OpenAI endpoint).
Model roles: `agent` (tool-calling chat) and `utility` (narratives, CSV schema
inference, entity extraction). Config from env or `LLM_CONFIG_FILE` (JSON).
Data-residency checks become per-provider: local providers are always allowed.

### Phase 2 — SQLite ✅ done (mongoose driver shim instead of a repository layer)
1. Delete dead code (`routes/startups.ts`, duplicate root-level models).
2. Introduce `backend/src/data/` repositories per aggregate (startups, csvs,
   chats, documents, RAG, screening snapshots/digests/reviews, tabular,
   workflows, audit, users). Mongo implementation first — pure refactor.
3. SQLite implementation + migrations; vector search in-process.
4. Embeddings through the provider layer (local `nomic-embed-text` via Ollama).

### Phase 3 — Desktop runtime ✅ done (local files, memory cache, local user, token gate)
Storage (fs vs R2), cache, auth (local user vs JWT), CORS/loopback token,
rate limiting relaxed for loopback.

### Phase 4 — Electron shell ✅ done (signing/notarization + auto-update still TODO)
`desktop/` workspace: main process, sidecar supervisor (Watchman, backend,
Next standalone), safeStorage key vault, IPC for native dialogs, tray,
notifications, auto-update (electron-updater), electron-builder targets
(dmg, nsis, AppImage), code signing.

### Phase 5 — Desktop features ✅ done
- **Local model onboarding:** detect Ollama/LM Studio, read RAM/GPU, recommend
  a model tier, pull with progress, custom endpoint form, capability probe
  (tool-calling support) with a guided no-tools fallback.
- **Background re-screening:** tray-resident scheduler (`rescreenScheduler.ts`),
  native notifications on risk-level delta.
- **Exports & backup:** IC memo PDF, signed audit-log export, encrypted DB
  backup/restore via native dialogs.
- **Folder watch + list versioning:** watch a data-room folder for ingest;
  stamp every screening with Watchman list versions/hashes; offline list import.

## Status (2026-10-25)

Verified end to end in the packaged macOS build (`desktop/release/CapScreen-1.0.0-arm64.dmg`):
on-device screening chat with qwen3:4b (tool call → Watchman → SQLite, ~70 s on an 8 GB M2),
real OFAC match + OFAC 50% rule propagation, encrypted backup → restore, hash-chained audit
export with tamper detection, watched-folder ingest (CSV + documents), crash restart of the
backend, clean shutdown (no orphaned sidecars).

### Open items
- Code signing + notarization (macOS), Authenticode (Windows); `electron-updater` feeds.
- Windows/Linux builds must be produced on those OSes (platform-specific `sharp` in the UI bundle).
- Database is not encrypted at rest (API keys are); rely on FileVault/BitLocker or add SQLCipher.
- `sample-data/DEMO.md` expects "Ivan Petrovich Kozlov" to be flagged, but no such entity exists in
  current OFAC/EU lists — the demo data needs a real or fixture-backed match.
- Deploy the auth service to Vercel and set `capscreenAuthUrl` in `desktop/package.json` before
  building installers (until then packaged builds stop at the sign-in screen).
- Unused server-era code still in the tree: frontend login/signup pages (sign-in now happens on the
  hosted portal), `docker-compose.yml`, `backend/Dockerfile`, Cloudflare/OpenNext config.

## Accounts (2026-10-25)

Claude-Code-style sign-in added: hosted auth service (existing account system, Vercel + Atlas),
browser hand-off via RFC 8252 loopback + PKCE, session sealed in the OS keychain, 14-day offline
grace, identity stamped on audit entries/reviews. Verified: 17-check protocol suite (replayed codes,
wrong PKCE verifier, non-loopback redirects, forged callbacks, rotation, revocation), real portal UI
driven in Chromium, gate → restore → offline → sign-out in the dev app.

Offline sanctions data: the shell keeps a snapshot of the OFAC/EU source files and starts Watchman
from it when an online start fails; it returns to live lists automatically (verified with network
blocked for Watchman: boot in ~12 s, identical screening results).
