# Series A Due Diligence — Sanctions Screening Memo (Draft)

**Company:** NexaFlow AI Inc  
**Round:** $18M Series A (fund is lead investor)  
**Date:** Demo dataset — synthetic engagement

## Executive summary

The fund completed an ownership-graph sanctions screen of NexaFlow's extended Series A cap table. The platform screened all entities in the ownership graph against Watchman (OFAC SDN and EU Consolidated lists). **One entity is flagged for immediate compliance review**, **two entities are in the review tier** for human verification, and the majority of founders, institutional investors, and LPs cleared.

The highest-priority finding is **Ivan Petrovich Kozlov**, who does not appear on the cap table directly but is the ultimate beneficial owner behind a four-layer chain through Cascade Series A SPV LLC. His effective indirect stake in NexaFlow is approximately **11%**.

## Methodology

- **Input:** Extended cap-table CSV (80 ownership records)
- **Engine:** Watchman v2 search + directed ownership graph (BFS traversal, cycle detection)
- **Thresholds:** Review ≥ 80% match score; Flagged ≥ 95%
- **Scope:** All nodes in the ownership graph, including SPVs, trusts, and offshore holdings

## Key findings

### Flagged — requires escalation

| Entity | Effective stake | Path |
|--------|-----------------|------|
| Ivan Petrovich Kozlov | ~11% | NexaFlow → Cascade SPV → Meridian Offshore → Ashford Trust → Ivan |

### Review — human verification required

| Entity | Context | Notes |
|--------|---------|-------|
| Johan Petrovitch Kozlov | UBO behind Atlantic Bridge → Sterling → Gamma | Near-match; verify against primary SDN listing |
| Mohammed Al Rahman | 28% owner of Riverside Angel Syndicate | Transliteration / fuzzy match |

### Cleared — representative sample

Emma Richardson, Marcus Webb, Horizon Seed Fund I LP, Robert Chen (Wellington Trust branch), and most European institutional LPs cleared at current list versions.

### Structural notes

- **Circular ownership** detected: Apex Circular Holdings LP ↔ Loopback Holdings Ltd (handled safely by graph engine).
- **Co-investor / vendor rosters** screened separately — see linked tabular reviews.

## Recommended next steps

1. Escalate Ivan Petrovich Kozlov to CCO — do not treat automated match as confirmed designation.
2. Complete alias review for Johan Petrovitch Kozlov and Mohammed Al Rahman.
3. Request enhanced KYC on Cascade Series A SPV LLC and Meridian Offshore Holdings Ltd.
4. File AML screening summary and IC compliance memo before investment committee vote.

---

*Decision support only. This memo does not constitute a legal determination of sanctions status.*
