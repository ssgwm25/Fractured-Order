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

## Orientation priors (scoring grammar — Source 12)

Declared strategic orientation is a **required NI scoring input**. Priors are engine-enforced; the agent may not invent a domain list.

| Orientation | Primary domains | Effect horizon |
|-------------|-----------------|----------------|
| **Pressure** | NI-4, NI-3, NI-5 | Immediate |
| **Stabilization** | NI-3, NI-1, NI-6 | Medium (1–2 years) |
| **Reframing** | NI-2, NI-5, NI-4 | Long (2–4 years) |

**Definitions (Fractured Order 1.0):** Pressure — impose costs to coerce or degrade adversary capacity. Stabilization — reduce volatility and escalation risk; reassure partners, markets, and domestic constituencies. Reframing — change the structure of the competition (alternative capacity, institutions, standards, or coalitions).

### Alignment class (relocated Macro Fit diagnostic)

| Alignment | Meaning | Engine coherence |
|-----------|---------|------------------|
| **advances** | Primary mechanism serves the declared orientation | At least one primary-domain delta ≥ +1 |
| **mixed** | Orientation-agnostic, or advancing and contradicting elements roughly balance | Allowed; rationale required |
| **contradicts** | Primary mechanism cuts against the declared orientation | At least one primary-domain delta ≤ −1 |

Retired Macro Fit bands map as: 9–10 / 7–8 → `advances`; 5–6 → `mixed`; 3–4 / 1–2 → `contradicts`. Alignment is **not** a 1–10 and does **not** scale NWC intensity (Source 11 / Source 13: type vs intensity stay separate).

### `orientation_net`

Headline NI score = sum of **primary-domain** deltas only. All six domains remain on the record (Source 13: every interest type can carry intensity). Non-primary domains do not enter `orientation_net`.

Effect horizon is SME context (expected lag). It does not time-discount tier deltas.

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

- `orientation` echo (must match intake)
- `orientation_assessment`: `alignment` (`advances` / `mixed` / `contradicts`), `primary_domains` (must equal the Source 12 prior), `effect_horizon` (must equal the prior row), `rationale`
- `domain_deltas`: NI-1…NI-6 each with `delta`, `rationale`, optional `vital_justification`
- `threat_cross_check`: required if any delta ≤ −1; else null
- `evidence_refs`: NSS era / matrix / National War College / Source 12 citations
- `needs_human` / reason when judgment is unclean

### Actor attribution (team field)

- The authoritative actor is `actions.team` (blue / red / green / industry).
- Plenum action details often use the shared form header **"Blue Team Action Details"** even for Red (and other) filings. That label is a **form prefix**, not an actor claim.
- Do **not** set `needs_human` solely because the details block says "Blue Team Action Details" while `team` is red/green/industry, or because objective vs expected-outcomes tone differs across teams.
- Score NI from the Red/Blue/Green actor in `team`, using title, objective, expected outcomes, and macro summary. Note form-prefix quirks in a rationale only if useful; they are not attribution blockers.

---

## Engine validation rules

1. Every domain present with delta ∈ {−2…+2}.
2. ±2 without non-empty `vital_justification` → `needs_human` or reject.
3. Any delta ≤ −1 without threat cross-check → reject.
4. `orientation` must match intake. `primary_domains` and `effect_horizon` must match the Source 12 prior for that orientation.
5. Alignment coherence: `advances` requires a primary-domain delta ≥ +1; `contradicts` requires a primary-domain delta ≤ −1.
6. Emit `orientation_net` (sum of primary-domain deltas). Do not auto-write or scale domain deltas from orientation.
7. If Glasl stage_after ≥ 6 and NI-3 ≤ −1 and NI-2 ≥ +1 → set `cross_domain_alert` true.
8. Emit full trace for SME audit and per-action reports.
