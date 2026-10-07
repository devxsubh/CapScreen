# Sanctions Screening — Review Tier Guidance

**Last updated:** June 2026

---

## What is the Review Tier?

Entities scoring 80–94% on Watchman screening are classified as **Review**. This means:

- A potential name match was found on OFAC SDN or UN Consolidated lists.
- The match confidence is high enough to warrant human review but not high enough to presume a confirmed hit.
- Common causes: transliteration variants (Arabic, Chinese, Russian names romanised differently), common surnames, or partial alias matches.

---

## How Long Does a Review Take?

The target SLA is **5 business days** from the screen date. For deals with compressed timelines, the CCO may approve an expedited 48-hour review.

---

## Who Can Clear a Review-Tier Entity?

- **Compliance Analyst:** May clear entities where no identifying information matches (name only, explainable variant). Must document justification.
- **CCO sign-off required:** If any additional identifying detail (DOB, nationality, passport, address) matches or cannot be ruled out.

---

## How to Document a Clearance

In the entity review Status field, record:

1. The OFAC/UN entry that was compared.
2. Which identifying details were checked (DOB, nationality, etc.).
3. The basis for clearance (e.g., "Different DOB — OFAC entry born 1951, entity born 1978; common surname").
4. Reviewer name and date.

---

## What If You Cannot Resolve the Match?

If additional information cannot be obtained (entity refuses to provide ID, UBO is opaque), escalate to the CCO. The CCO will determine whether to:

1. Decline the investment on risk grounds.
2. Obtain OFAC guidance.
3. Request the entity provide notarised identification.

---

## False Positives: Common Patterns

| Pattern | Example | Typical resolution |
|---|---|---|
| Common surname | "Wang Holdings" vs SDN entry "Wang" | Clear if entity type, country, and DOB differ |
| Transliteration variant | "Mohammed Al-Rashid" vs "Mohammad Al-Rasheed" | Check DOB, nationality, passport |
| Abbreviation | "GIC" vs "Gulf Investment Corp" | Resolve by full name lookup |
| Partial alias | "Viktor" vs "Viktor Fedorov" | Clear only if full name and DOB clearly differ |

---

## Interaction with UBO Screening

Review-tier classifications cascade: if a UBO is Review tier, all entities they control should be noted in the review file, even if those downstream entities are individually clear. The UBO review outcome governs the chain.

---

## Regulatory Basis

FinCEN AML/KYC guidance (January 2026) requires ERAs and RIAs to:

- Screen all investors and beneficial owners against OFAC SDN.
- Maintain records of screening dates, outcomes, and reviewer decisions.
- Re-screen at least annually (firm policy: quarterly).
