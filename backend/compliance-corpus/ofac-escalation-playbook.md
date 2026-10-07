# OFAC Escalation Playbook

**Last updated:** June 2026  
**Applies to:** All cap-table screenings and entity reviews conducted by the compliance team.

---

## 1. Match Score Thresholds

| Score | Classification | Action |
|---|---|---|
| ≥ 95% | **Flagged** | Mandatory escalation to CCO within 24 hours. Do not proceed with investment. |
| 80–94% | **Review** | Compliance analyst review required within 5 business days. Investment may proceed conditionally. |
| < 80% | **Clear** | No action required. Record clearance in audit log. |

---

## 2. What to Do for an 85% Match (Review tier)

An 85% match falls in the **Review** tier (80–94%). The steps are:

1. **Do not block the deal automatically.** An 85% match indicates a likely alias or transliteration variant, not a confirmed hit.
2. **Retrieve the full SDN entry** from the OFAC website (https://ofac.treasury.gov) using the matched SDN name, programs, and remarks.
3. **Compare identifying information:** DOB, nationality, passport number, address, or known aliases. Document your comparison in the entity review notes.
4. **Escalate to the CCO** if any two identifying details match (name + DOB, name + nationality, etc.).
5. **Clear** if no additional identifying details match and the name difference is explainable (common name, transliteration, spelling variant). Record the justification.
6. **Timeline:** Resolution must be documented within 5 business days of the initial screen date.

---

## 3. What to Do for a 95%+ Match (Flagged tier)

A ≥ 95% match is treated as a presumed hit.

1. **Immediately pause the investment process.** Do not issue a term sheet, transfer funds, or sign closing documents.
2. **Notify the CCO within 24 hours** (same business day if match is found during business hours).
3. **Do not contact the subject entity** — OFAC regulations may prohibit tipping off.
4. **Document the match** in the audit log: entity name, SDN name, match score, programs, and the ownership chain.
5. **Seek OFAC guidance** if the CCO determines there is genuine uncertainty. OFAC's Compliance hotline: +1 (800) 540-6322.
6. **Do not proceed** without explicit CCO and legal counsel sign-off, and if required, an OFAC specific licence.

---

## 4. Ultimate Beneficial Owner (UBO) Rule

Screen every entity in the ownership chain, not just top-level names. The firm applies a 25% ownership threshold consistent with FinCEN UBO rules:

- Any individual owning ≥ 25% of the target company (directly or indirectly) must be screened.
- Ownership through holding companies is aggregated across paths.
- Circular ownership structures must be flagged to the CCO.

---

## 5. Continuous Portfolio Monitoring

- All portfolio companies must be re-screened **quarterly** against fresh OFAC/UN lists.
- New flags on re-screen trigger the same escalation protocol above.
- Re-screen results are logged automatically; the CCO receives a weekly digest of changed flags.

---

## 6. Record Keeping

- Screening results and review decisions must be retained for **5 years** from the date of the screen.
- For investments not made: retain for **5 years** from the date of the decision not to invest.
- Audit trail format: entity name, screen date, score, reviewer name, outcome, and justification notes.

---

## 7. Applicable Sanctions Lists

| List | Authority | Coverage |
|---|---|---|
| OFAC SDN | U.S. Treasury | Individuals and entities blocked from U.S. transactions |
| UN Consolidated | UN Security Council | Global multilateral sanctions |
| EU Consolidated | European Council | EU-level sanctions (forthcoming in engine) |
| HM Treasury | UK Government | UK sanctions (forthcoming in engine) |
