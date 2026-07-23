# Fractured Order 2.0 — Glasl Escalation Codebook

**Track:** Escalation (Glasl)  
**Bibliography:** Sources 15–17 in `PLI_Annotated_Bibliography.md` `(Escalation / Glasl)`

**Operating principle — PLI proposes, the SME approves.** The agent matches the action to Glasl stage criteria and proposes a stage delta; `tracks/glasl_engine.py` applies the transition against session state.

---

## Scope

- **All actions** receive a Glasl adjudication (Economic and non-economic).
- Session maintains a current escalation **stage** (integer 1–9).
- FO 1.0 operating range was typically stages **4–7**; default session start = **4**.
- Offline Glasl stage is stored in `adjudications/_session_state.json` for local replay (global file). **Live Plenum will scope escalation state per `session_id`.**

---

## Nine stages (Glasl)

| Stage | Label (short) | Adjudication cue |
|-------|---------------|------------------|
| 1 | Hardening | Positions stiffen; debate still possible |
| 2 | Debate & polemics | Polarized argument; win/lose framing |
| 3 | Actions, not words | Unilateral faits accomplis; talking stalls |
| 4 | Images & coalitions | Coalition/reputation competition; image campaigns |
| 5 | Loss of face | Public humiliation / prestige attacks |
| 6 | Strategies of power & ultimata | Explicit strategic threats and ultimatums |
| 7 | Limited destructive blows | Materially destructive limited strikes on vital capabilities (incl. severe economic coercion that destroys capacity) |
| 8 | Fragmentation | Systematic destruction of systems/coalitions |
| 9 | Together into the abyss | Mutual destruction logic |

FO operating notes (Interim Report): Stage 4 = coalition/reputation competition; 5 = public loss of face; 6 = strategic threats/ultimatums; 7 = limited destructive blows.

---

## Per-action delta rules

| Rule | Detail |
|------|--------|
| Allowed delta | {-2, -1, 0, +1, +2} without needs_human |
| Abs(delta) > 2 | Requires needs_human=true and SME confirmation |
| Stage bounds | After application, clamp to [1, 9] |
| Rationale | Must cite the Glasl stage definition that matches the **resulting** stage |
| De-escalation | Negative Δ only when the action credibly reduces confrontation (reassurance, off-ramps, confidence-building) — not merely because it is “economic” |

Escalation and National Interest are **related but not identical**: pain on an adversary ≠ U.S. interest gain; high escalation can coincide with positive NI-2 and negative NI-3.

---

## Agent worksheet contract

JSON matching `schemas/glasl_worksheet_schema.json`:

- `stage_before` (from session state; agent may echo)
- `delta` (−2…+2, or larger only with needs_human)
- `stage_after` (must equal clamp(stage_before + delta))
- `rationale` citing stage criteria
- `needs_human` / reason

---

## Engine validation rules

1. `stage_before` ∈ 1…9; `delta` integer.
2. If abs(delta) > 2 and not needs_human → reject.
3. `stage_after` must equal `max(1, min(9, stage_before + delta))`.
4. Emit trace: before, delta, after, rationale, citations.
