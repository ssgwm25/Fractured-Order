# Fractured Order 2.0 — National Interest Codebook

**Track:** National Interest  
**Evidence:** `evidence/ni/US_National_Interest_Assessment_Methodology.md`, `evidence/ni/NSS_Interest_Matrix.xlsx`, National War College primer (`evidence/ni/2025 NWC NSS Primer copy.pdf`)  
**Bibliography:** Sources 11–14 in `PLI_Annotated_Bibliography.md` `(National Interest)`

**Operating principle — PLI proposes, the SME approves.** The agent assigns per-domain tier deltas with cited rationale; `tracks/ni_engine.py` validates grammar and cross-checks; White Cell approves or overrides.

---

## Scope

- **All actions** (Economic, Diplomatic, Informational, Military) receive an NI adjudication.
- Output is a **U.S.-centric six-domain vector**, not FO 1.0’s US/PRC scalar (−5…+5).
- Tier movement uses **National War College** vital / important / peripheral grammar against NSS-derived domains.
- Economic actions may use macro PLI trend summaries as context; they do not replace domain judgment.

---

## Six interest domains

| ID | Domain | Definition |
|----|--------|------------|
| **NI-1** | Homeland & Strategic Access | Protection of people, territory, critical infrastructure; energy/strategic supply access; force posture to deny catastrophic harm |
| **NI-2** | Economic Prosperity & Tech Leadership | Competitiveness, jobs, innovation, industrial capacity, leadership in power-defining sectors |
| **NI-3** | Alliance / Partner Credibility | Ally/partner willingness to align, share burden, resist hedging toward adversaries or alternative blocs |
| **NI-4** | Indo-Pacific Stability & Deterrence | Regional balance preventing PRC coercion, preserving Taiwan-related supply chains, avoiding uncontrolled escalation |
| **NI-5** | Rules / Market Integrity / Reciprocity | Ability to shape standards, trade rules, financial architecture, nonproliferation norms; enforce reciprocity |
| **NI-6** | Domestic Political Sustainability | Congressional/public support; industry acceptance; avoidance of self-inflicted economic shock undermining policy continuity |

---

## Orientation priors (analytic)

| Orientation | Primary domains (typical) | Effect horizon |
|-------------|---------------------------|----------------|
| **Pressure** | NI-4, NI-3, NI-5 | Immediate |
| **Stabilization** | NI-3, NI-1, NI-6 | Medium (1–2 years) |
| **Reframing** | NI-2, NI-5, NI-4 | Long (2–4 years) |

Priors guide assessment order and expected lag; they are not hard rules.

---

## National War College tier rubric

| Tier | Use | Delta |
|------|-----|-------|
| Vital | Nearly any cost/risk, including significant war risk | **+2 / −2** (sparingly; requires `vital_justification`) |
| Important / Major | State weakened if it did not act; costs weighed | **+1 / −1** (default) |
| Peripheral | Desirable only if costs/risks extremely limited | **0** |

Allowed delta set per domain: `{+2, +1, 0, −1, −2}`.

---

## Threat cross-check

Required when **any** domain delta ≤ −1:

```
Threat = Capability (adversary) × Will (adversary) × Vulnerability (U.S.)
```

Record a short narrative for each factor. High Glasl stage with negative NI-3 often signals alliance-credibility damage even when NI-2 is positive (cross-domain alert).

---

## Agent worksheet contract

The NI agent returns JSON matching `schemas/ni_worksheet_schema.json`:

- `orientation` echo
- `domain_deltas`: NI-1…NI-6 each with `delta`, `rationale`, optional `vital_justification`
- `threat_cross_check`: required if any delta ≤ −1; else null
- `evidence_refs`: NSS era / matrix / National War College citations
- `needs_human` / reason when judgment is unclean

---

## Engine validation rules

1. Every domain present with delta ∈ {−2…+2}.
2. ±2 without non-empty `vital_justification` → `needs_human` or reject.
3. Any delta ≤ −1 without threat cross-check → reject.
4. If Glasl stage_after ≥ 6 and NI-3 ≤ −1 and NI-2 ≥ +1 → set `cross_domain_alert` true.
5. Emit full trace for SME audit and per-action reports.
