# Demo Startup Seed — MongoDB Showcase Dataset

One-command seed for a fully populated **NexaFlow AI Inc (Demo)** startup: cap-table screening, tabular reviews, workflows, and project documents.

## What gets created

The seeded workspace is **global sample data** (`isSample: true`) — every logged-in user sees it. If one user chooses **Hide sample**, it disappears only for them (stored in `HiddenSampleAsset`); MongoDB is untouched.

| Asset | Description |
|-------|-------------|
| **Startup** | `NexaFlow AI Inc (Demo)` — read-only, visible to all users |
| **CSV files** | Extended cap table (~80 rows), co-investor roster, vendor roster |
| **Screening** | Live Watchman results stored on the startup (`lastScreeningResult`, co-investor, vendor) |
| **Tabular review** | Full entity grid — one row per graph node, all columns pre-filled |
| **Triage queue** | Flagged + review entities only (`builtin-sanctions-triage` workflow) |
| **Documents** | Due diligence checklist, Series A DD memo, IC compliance memo |
| **Entity reviews** | Sample dispositions on Ivan (escalated), Johan (pending), Mohammed (cleared) |
| **Portfolio grid** | Synced portfolio monitoring row for this startup |

## Prerequisites

1. **MongoDB** — `MONGODB_URI` in repo root `.env`
2. **Watchman** — required for live screening during seed:

```bash
docker compose -f docker-compose.dev.yml up
# wait ~30–60 s for list ingestion
```

## Run the seed

```bash
cd backend && npx tsx scripts/seed-demo-startup.ts
```

### Options

```bash
# Replace existing demo startup for preview-user
npx tsx scripts/seed-demo-startup.ts --reset

# Seed for a registered user (uses their MongoDB user id as ownerId)
npx tsx scripts/seed-demo-startup.ts --email compliance@capscreen.local --reset

# Preview without writing
npx tsx scripts/seed-demo-startup.ts --dry-run
```

## After seeding

| URL | What you'll see |
|-----|-----------------|
| `/startups/:id` | CSV strip, screener chat, screening side panel |
| Tabular reviews (sidebar) | Cap Table Sanctions Review + Sanctions Triage Queue |

## Sample files

| File | Role |
|------|------|
| `demo-cap-table-extended.csv` | Long ownership graph (original demo cases + extra LPs/SPVs) |
| `due-diligence-checklist.md` | Due diligence checklist document |
| `series-a-dd-memo.md` | Screening analysis document |
| `../sample-co-investors.csv` | Co-investor roster |
| `../sample-vendors.csv` | Vendor roster |

## Narrative (5-minute demo)

1. Open the **sample startup** — run or review cap-table screening
2. Open **ownership graph** — Ivan Kozlov behind Cascade SPV
3. Open **tabular review** — scroll the full entity grid; open triage queue for exceptions only
4. Show **documents** — DD checklist, IC memo

See also: `../DEMO.md` for planted risk scenarios and expected graph math.

## Resetting test data

```bash
cd backend && pnpm run db:reset
```

Interactive modes:

1. **Complete erase** — empty every collection (including users)
2. **Interview prep** — keep users + this demo startup only; delete all other test data

Non-interactive:

```bash
pnpm run db:reset -- --mode interview --confirm "KEEP DEMO"
pnpm run db:reset -- --mode full --confirm "ERASE ALL"
```
