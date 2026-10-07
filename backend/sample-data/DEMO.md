# Series A Demo Cap Table — CapScreen Sanctions Screening

This dataset simulates a **Series A due-diligence engagement** for a VC fund's evaluation of **NexaFlow AI Inc.**, an enterprise AI startup. It is designed for customer demos, workflow walkthroughs, and regression testing of ownership-graph traversal and Watchman sanctions matching.

**File:** `sample-cap-table.csv`  
**Format:** Strict 5-column cap table (`entity`, `entity_type`, `owner`, `owner_type`, `ownership_pct`)

> **Note:** Real cap tables are confidential. This is synthetic data with planted risk scenarios. Names resembling sanctioned persons are intentional teaching cases — the platform never concludes guilt.

---

## Engagement narrative

The fund receives NexaFlow's cap table ahead of a $18M Series A lead. The table includes founders, an employee option pool, a Riverside angel syndicate, Horizon Seed Fund (prior round), Atlantic Bridge Ventures (Series A lead), a Cascade Series A SPV (co-investor vehicle), and Apex Circular Holdings (legacy investor with a known circular structure).

Compliance must answer:

1. Who are the ultimate beneficial owners (UBOs)?
2. Are any owners or UBOs on OFAC/EU sanctions lists?
3. Is sanctions risk hidden behind SPVs, offshore holdings, or trusts?
4. Which entities need human review vs. immediate escalation?

---

## Ownership overview

```
NexaFlow AI Inc (portfolio company)
├── Founders (30%) — Emma Richardson, Marcus Webb
├── NexaFlow 2024 Option Pool (10%)
├── Riverside Angel Syndicate LLC (8%)
├── Horizon Seed Fund I LP (15%)
├── Atlantic Bridge Ventures Ltd (20%) — Series A lead
├── Cascade Series A SPV LLC (12%) — co-investor vehicle
└── Apex Circular Holdings LP (5%) — legacy circular structure
```

---

## Planted demo cases

### 1. Clean screening — founders & institutional investors

| Entity | Role | Expected risk |
|--------|------|---------------|
| Emma Richardson | Co-founder / CEO | **Clear** |
| Marcus Webb | Co-founder / CTO | **Clear** |
| James Okonkwo | Angel syndicate member | **Clear** |
| Patricia Lennox | Angel syndicate member | **Clear** |
| Emily Torres | Seed fund GP | **Clear** |
| Horizon Seed Fund I LP | Prior-round lead | **Clear** (entity; UBOs also clear) |
| Sarah Mitchell / David Park | Atlantic Bridge GP principals | **Clear** |

**Demo point:** Most of the cap table clears — the tool narrows review to exceptions, not a flood of false positives.

---

### 2. Fuzzy-match review — false-positive handling

| Entity | Placement | Expected risk |
|--------|-----------|---------------|
| **Johan Petrovitch Kozlov** | UBO behind Atlantic Bridge → Sterling Capital → Gamma Holdings | **Review** (~80–94% match) |
| **Mohammed Al Rahman** | 28% owner of Riverside Angel Syndicate LLC | **Review** (transliteration / near-match) |

**Ownership paths:**

```
NexaFlow → Atlantic Bridge Ventures (20%) → Sterling Capital Partners (65%)
         → Gamma Holdings Ltd → Johan Petrovitch Kozlov
Effective indirect stake in NexaFlow: ~13%

NexaFlow → Riverside Angel Syndicate (8%) → Mohammed Al Rahman (28%)
Effective indirect stake: ~2.2%
```

**Demo point:** Similar names trigger review-tier matches requiring human verification — not automatic escalation.

---

### 3. Deep ownership discovery — primary demo scenario ★

**Ivan Petrovich Kozlov** does not appear on NexaFlow's cap table. He is the UBO behind a four-layer chain:

```
NexaFlow AI Inc
  ← Cascade Series A SPV LLC (12%)
    ← Meridian Offshore Holdings Ltd (100%)
      ← Ashford Family Trust (100%)
        ← Ivan Petrovich Kozlov (100%)
```

**Expected results:**

| Signal | Value |
|--------|-------|
| Ivan Petrovich Kozlov | **Flagged** (high-confidence Watchman match) |
| Effective indirect stake | **12.0%** in NexaFlow |
| Ownership path | 4 layers — visible in React Flow graph |
| Cascade SPV / offshore entities | Risk propagates up the chain |

**Demo point:** A flat CSV name check would miss Ivan entirely. The ownership graph discovers the hidden UBO and surfaces the full chain for compliance investigation.

---

### 4. High-risk sanctions — escalation workflow

**Ivan Petrovich Kozlov** (Case 3) is the primary **flagged** entity (match score ≥ 95% against Watchman OFAC/EU lists).

**Expected compliance actions:**

- Cascade Series A SPV LLC flagged or elevated via ownership exposure rules
- Analyst narrative explains match score, source list, and ownership path
- Workflow routes to **Flagged Entity Investigation** or **IC Compliance Memo**
- Human sign-off required — platform does not confirm a sanctions violation

**Demo point:** Demonstrates escalation from screening → investigation → memo generation.

---

### 5. Circular ownership — graph robustness

```
Apex Circular Holdings LP (5% of NexaFlow)
  → Loopback Holdings Ltd (80%)
    → Apex Circular Holdings LP (100%)   ← cycle
  → Pacific Rim Capital LLC (20%)
    → Wellington Family Trust → Robert Chen (clean UBO)
```

**Expected results:**

| Check | Expected |
|-------|----------|
| Cycle detection | 1 cycle: `Apex Circular Holdings LP → Loopback Holdings Ltd → Apex Circular Holdings LP` |
| Graph traversal | Terminates safely — no infinite recursion |
| Robert Chen | Clear UBO on the non-circular branch |
| Screening preview | `circularOwnershipCount: 1` |

**Demo point:** Validates production-grade graph processing on messy real-world structures.

---

### 6. Complex VC structure — full ecosystem

The dataset models a realistic venture stack:

| Layer | Entities |
|-------|----------|
| Portfolio company | NexaFlow AI Inc |
| Founders | Emma Richardson (18%), Marcus Webb (12%) |
| Employee equity | NexaFlow 2024 Option Pool (10%) |
| Angel syndicate | Riverside Angel Syndicate LLC (8%) |
| Seed fund | Horizon Seed Fund I LP (15%) with multi-LP structure |
| Series A lead | Atlantic Bridge Ventures Ltd (20%) |
| Series A SPV | Cascade Series A SPV LLC (12%) |
| Legacy investor | Apex Circular Holdings LP (5%) |

**Expected results:**

- Ownership percentages aggregate correctly across paths
- UBOs resolved for every investor vehicle
- Screening output is readable by non-technical compliance officers (risk tiers, paths, counts)
- Side panel shows interactive ownership graph with color-coded risk

---

## Expected screening summary (with Watchman running)

| Tier | Approx. count | Key entities |
|------|---------------|--------------|
| **Clear** | Majority (~30+ nodes) | Founders, seed LPs, clean angels, Robert Chen |
| **Review** | 2 | Johan Petrovitch Kozlov, Mohammed Al Rahman |
| **Flagged** | 1+ | Ivan Petrovich Kozlov (+ propagated exposure on chain parents) |

Exact match scores depend on the live OFAC SDN and EU Consolidated lists loaded in Watchman.

---

## Running the demo

### 1. Start Watchman

```bash
docker compose -f docker-compose.dev.yml up
# Wait ~30–60 s for list ingestion
```

### 2. Verify graph math (no Watchman required)

```bash
cd backend && npx tsx scripts/verify-demo-dataset.ts
```

### 3. Screen in the UI

1. Create a startup: **NexaFlow AI Inc**
2. Upload `sample-cap-table.csv`
3. Run **Cap Table Sanctions Screen** workflow
4. Open the ownership graph and entity risk table

### 4. Suggested demo script (5 minutes)

1. **Ingest** — upload CSV; show automatic column detection
2. **Graph** — expand Cascade SPV chain to reveal Ivan Petrovich Kozlov
3. **Flagged** — click Ivan; show match score, path, analyst narrative
4. **Review** — show Johan and Mohammed as review-tier (human verification)
5. **Clean** — show founders and Horizon Seed clear
6. **Cycle** — mention Apex ↔ Loopback circular structure handled safely
7. **Workflow** — run **AML Screening Summary** or **IC Compliance Memo** on saved results

---

## Related sample files

| File | Purpose |
|------|---------|
| `sample-entity-roster.csv` | Flat entity list (co-investor / vendor roster mode) |
| `sample-co-investors.csv` | Co-investor roster screening |
| `sample-vendors.csv` | Vendor roster screening |

---

## Maintenance

When updating planted names, re-run screening against a live Watchman instance and update the **Review** / **Flagged** tables above if match scores shift after list updates.

Thresholds (configurable via env): `SCREENING_REVIEW_MIN_SCORE` (default 0.80), `SCREENING_FLAGGED_MIN_SCORE` (default 0.95).
