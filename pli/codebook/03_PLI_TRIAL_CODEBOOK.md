# Fractured Order 2.0 — PLI Trial Codebook (Implementation & Fit revision)

## What this trial changes

This trial codebook replaces the single Implementation Fit score (0–4) with **two independent scores on a 1–10 scale**, and gives PLI a defined primary output: **macroeconomic adjudication**.

| Retired | Replaced by |
|---------|-------------|
| Implementation Fit (0–4, one combined judgment) | **Implementation (1–10):** precedent, feasibility, and timeline of execution |
| — | **Fit (1–10):** alignment with the team's declared strategic orientation |

The two scores are assessed independently: an action can be highly executable but strategically misaligned (high Implementation, low Fit), or perfectly on-strategy but unexecutable (low Implementation, high Fit).

The primary purpose of PLI in this revision is **macroeconomic adjudication**: every scored economic action produces a new quarterly trend line for each of five macroeconomic indicators (grid through 2034Q4), shown against the pre-action baseline in a color-coded chart. **National Interest, Glasl escalation, Diplomacy indexing, and Information briefs** are parallel tracks documented in codebooks 04–07 and routed from the Plenum Instrument of Power (`Diplomatic` / `Informational` / `Military` / `Economic`).

**Operating principle — PLI adjudicates, the SME approves.** PLI produces every score and trend line mechanically from the documented rules in this codebook (precedent tiers, modifiers, orientation anchors, the directionality matrix, and the modulation tables). Each step is recorded in the adjudication record, so a subject-matter expert can retrace the full chain and approve or override the result afterwards. No score in this system depends on unrecorded judgment.

**SME staffing (game director):** National Interest and Escalation (Glasl) are reviewed by the **same SME**; Diplomacy Index and Information are reviewed by the **same SME**. Macroeconomic approve/override remains Macro / White Cell. FO 2.0 `submission_month` uses a fixed **6-month session cadence** (not the Plenum timer) — see Master Codebook Architecture and `submission_timing.py`.

---

## Architecture: three layers, one hierarchy

```
Layer 1 — PRIMARY LEVER (exactly one)      What economic domain are you operating in?
Layer 2 — POLICY INSTRUMENT (one primary)  What specific tool executes the action?
Layer 3 — IMPLEMENTATION (1-10)            Can it be executed, and on what timeline?
          FIT (1-10)                       Does it advance the declared orientation?

Facets (tie-breaks & context only)         Direction, Sector, Target, Coalition, Orientation
```

- Levers answer **"where in economic statecraft?"**
- Instruments answer **"how, specifically?"**
- Implementation answers **"can it be done, and when do effects arrive?"**
- Fit answers **"is it the right move for the declared strategy?"**

Layers 1 and 2 (levers and instruments) are unchanged from the master codebook and are reproduced here for completeness.

---

## Layer 1 — The ten economic levers

Ten levers cover the full Blue/Red/Green economic action corpus with minimal overlap. No undifferentiated catch-all bucket — each lever has a defined domain and instrument table.

| Code | Lever | Definition | Boundary |
|------|-------|------------|----------|
| **L1** | Trade & Customs | Tariffs, quotas, trade remedies (Section 301, Section 232, anti-dumping and countervailing duties), import/export bans on ordinary goods and services | Dual-use technology denial → **L2** |
| **L2** | Export Controls & Entity Lists | Entity lists, license denials, information and communications technology and services restrictions, deemed-export, strategic technology access denial | Generic tariffs → **L1** |
| **L3** | Investment & Capital Controls | Foreign investment screening, outbound investment rules, ownership caps, investment bans, reciprocal FDI / investment-access packages | Asset freeze → **L4**. Ordinary FDI / land investment without sovereignty or exclusive basing rights stays **L3**. Named reciprocal FDI packages → **I3.05** (not `needs_human` for inbound/outbound ambiguity) |
| **L4** | Financial Sanctions & Coercion | Targeted/secondary sanctions, asset freezes, payment-system denial, financial-market access bans, legal-economic asset remedies | Non-punitive regulation → **L5**. Sovereignty or basing-access transfer between states → **L10** (not I4.06) |
| **L5** | Financial Regulation & Digital Policy | Prudential and anti-money-laundering rules, digital asset policy, market-structure regulation, domestic foreign-exchange intervention / rate-check coordination without country-specific punishment | Bilateral partner-support swaps → **L6** (rule 4). Any sanction element → **L4** |
| **L6** | Development & Infrastructure Finance | Development finance institutions, foreign aid, export credit, overseas infrastructure/connectivity financing, bilateral currency swaps for partner support, sovereign bond purchase/guarantee for partner states | Domestic-only capacity → **L7**. Domestic foreign-exchange operations (not partner swap) → **L5**. Overseas infra finance whose *object* is territory/basing rights → **L10** |
| **L7** | Industrial Policy & Domestic Capacity | Subsidies, tax incentives, deregulation, procurement preferences, domestic research and development / industrial funding | Foreign deployment → **L6** |
| **L8** | Strategic Reserves & Supply Security | Stockpiling, reserve mandates, supply contingency authorities, official reserve / commodity sales to move market prices | New production → **L7**. Gold/commodity sell-offs for price intervention → **I8.04** (not L5 FX rate-check; not L4 unless sanctions/asset remedies named) |
| **L9** | Standards, Regulation & Data Governance | Technical standards, regulatory harmonization, data governance, certification/trust regimes | Access bans → **L1/L2** |
| **L10** | Territorial Acquisition, Basing & Strategic Access | Negotiated acquisition, cession, long-term lease, or compensatory transfer of sovereign territory, exclusive basing rights, or strategic geographic access where the economic bargain is the operative instrument | Pure Military/Diplomatic acts without a purchase/lease/concession bargain → **NE**. Intra-jurisdiction asset/IP/fund seizure → **L4 / I4.06**. Ordinary FDI without sovereignty or exclusive basing → **L3**. Overseas infra without territorial/basing rights as the deal object → **L6** |

| Code | Special | Use |
|------|---------|-----|
| **NE** | Non-Economic | Set when Instrument of Power is Diplomatic, Informational, or Military (or when an Economic filing has no economic lever vector). **No macro lever vector.** Always routed to National Interest + Glasl. Diplomatic → Diplomacy Index; Informational → Information brief (see `adjudication_data.json` routing table). |

---

## Layer 2 — Policy instruments (by lever)

Each action gets **one primary instrument**. Secondary instruments optional when bundled authorities are distinct. Instrument tables follow the master codebook (I1.01–I10.04, including I3.05, I5.04, I6.06, I6.07, I8.04, I10.01–I10.04). See the master codebook for the full listing; instrument codes cited in this document carry the same definitions.

---

## Layer 3a — Implementation score (1–10)

PLI produces the Implementation score **after** lever and instrument are assigned, by applying the precedent test and modifiers below. Implementation measures whether the action can actually be executed as proposed, and on what timeline its economic effects arrive. It absorbs what the old rubric split between Feasibility and Implementation Fit. The tier selected, each modifier applied, and the resulting arithmetic are written to the adjudication record for SME approval.

### The precedent test (sets the base score)

Existing precedent is the main consideration. Work down the tree and take the first tier that applies:

| Tier | Precedent condition | Base score |
|------|--------------------|------------|
| **Tier 1 — Proven authority** | Enacted statute or standing executive authority exists **and has been used for this instrument class before**; funding and administrative machinery in place (e.g., a new Section 301 investigation) | 8–10 |
| **Tier 2 — Existing but untested authority** | Authority exists but has not been used for this purpose or target, or requires rulemaking before use; funding identified but not yet committed | 6–7 |
| **Tier 3 — New authority required** | No existing authority: requires new legislation, new appropriations, or a new international agreement. Score within band on game-state feasibility — congressional composition, coalition posture, closest historical analog | 3–5 |
| **Tier 4 — No plausible pathway** | Legal dead-end, constitutional or treaty bar, or a prerequisite that cannot be obtained in-game (e.g., retroactive intellectual-property seizure with no legal basis) | 1–2 |

**Why precedent anchors the score:** an instrument with a proven statutory track record has known machinery, known legal survivability, and a known timeline. Absence of precedent is not disqualifying — Tier 3 exists for novel actions — but it must cost points, because novel authority is exactly where wargame proposals historically overestimate executability.

### Modifiers (applied to the base score)

Start at the midpoint of the tier band, then apply each modifier that holds. The final score may cross a band edge by at most one point and is clamped to 1–10; Tier 4 is capped at 2.

| Modifier | Adjustment |
|----------|------------|
| Funding appropriated or otherwise available in-round | +1 |
| Required partners or allies already committed on the record | +1 |
| Timeline mismatch: declared objective expects effects sooner than the instrument can deliver (see indicator onset in Section 6) | -1 |
| Requires simultaneous action by multiple independent authorities (e.g., Congress plus two allied governments) | -1 |

### The timeline consideration

Implementation is where timing realism lives. Every lever has a characteristic **onset** — the number of game years before its macroeconomic effects appear (Section 6 matrix). A supply-chain investment program does not show favorable indicator movement in the round it is announced; a tariff does. Teams cannot claim faster effects than the matrix onset; a plan built on effects arriving faster than the onset takes the timeline-mismatch modifier.

### Scoring anchors

| Score | Reading |
|-------|---------|
| 9–10 | Proven authority, funded, sequenced correctly; effects arrive on the matrix timeline |
| 7–8 | Proven or near-proven authority with minor gaps (rulemaking pending, funding identified but not committed) |
| 5–6 | Untested authority or a plausible new-authority path with favorable game state |
| 3–4 | New authority required against an unfavorable game state (e.g., partisan bill, divided Congress) |
| 1–2 | Not executable: legal dead-end or missing prerequisite that cannot be obtained |

---

## Layer 3b — Fit score (1–10)

Fit is **entirely an alignment score**: does the action advance the team's declared strategic orientation? PLI assigns Fit from the anchors below against the orientation declared at intake, and records the anchor band and a one-line mechanism rationale for SME approval. Orientations carry the Fractured Order 1.0 definitions:

| Orientation | Definition |
|-------------|------------|
| **Pressure** | Impose costs on the adversary to coerce behavior change or degrade adversary capacity |
| **Stabilization** | Reduce volatility and escalation risk; reassure partners, markets, and domestic constituencies |
| **Reframing** | Change the structure of the competition — build alternative capacity, institutions, standards, or coalitions rather than contest the existing terms |

### Scoring anchors

| Score | Label | Criteria |
|-------|-------|----------|
| 9–10 | Direct advance | Primary mechanism directly advances the declared orientation; no contradicting element |
| 7–8 | Advance with friction | Advances the orientation; secondary elements are neutral or slightly mixed |
| 5–6 | Neutral / mixed | Orientation-agnostic, or advancing and contradicting elements roughly balance |
| 3–4 | Partial contradiction | Primary mechanism cuts against the declared orientation even if the stated intent matches |
| 1–2 | Direct contradiction | Action undermines the declared orientation (e.g., broad coercive escalation under a declared Stabilization strategy) |

### Natural-home guidance (not a rule)

Coercive levers (L1–L4) are the natural home of Pressure; L5, L6, and L8 of Stabilization; L6, L7, and L9 of Reframing. An action outside its orientation's natural home is not automatically penalized — score the mechanism, not the lever code — but the burden of explanation rises.

**Intake change:** Orientation, previously optional ("captured in rubric Alignment"), is now a **required intake field**, because Fit cannot be scored without it.

---

## Section 6 — Macroeconomic adjudication

### Purpose and output

PLI's primary output is directional: for each scored action, PLI produces the **new quarterly trend line of each of five macroeconomic indicators**, plotted against the pre-action baseline in a color-coded chart (baseline navy solid; post-action gold dashed; divergence shaded green where favorable to the acting team, red where unfavorable). PLI adjudicates **directionality, not point forecasts** — across the six institutional forecasters reviewed, point estimates for the same indicator-year differ by up to 1.4 percentage points, but direction and shape are unanimous. Direction is the empirically defensible layer. The trend lines are computed from the tables in this section, not judged case-by-case; the SME's role is to review the recorded chain and approve the adjudication.

### The five indicators and the quarterly adjudication grid (2026Q1–2034Q4)

Baseline trend lines are anchored to the IMF United States 2026 Article IV projections, corroborated by CBO, Fed SEP, WTO, and OECD. Institutions publish annual or Q4/Q4 rates; PLI expands them to a **quarterly adjudication grid** by **within-year hold** through 2034Q4 (discretization for month anchors — not higher-frequency forecasts). See *PLI_Annotated_Bibliography.md* (“Quarterly adjudication grid and month anchors”).

| Indicator | 2026 | 2027 | 2028 | 2029 | 2030 | 2031 | 2032* |
|-----------|------|------|------|------|------|------|-------|
| Real GDP growth (%) | 2.5 | 2.2 | 2.1 | 1.9 | 1.8 | 1.8 | 1.8 |
| PCE inflation (Q4/Q4, %) | 2.8 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 |
| Unemployment rate (%) | 4.3 | 4.2 | 4.0 | 3.9 | 3.9 | 3.9 | 3.9 |
| Trade volume growth (%) | 1.0 | 3.6 | 1.4 | 1.4 | 1.7 | 1.5 | 1.5 |
| Fixed investment growth (%) | 4.0 | 3.3 | 2.1 | 1.8 | 1.8 | 1.8 | 1.8 |

\*2032 holds the 2031 annual anchor. FO 2.0 worksheets require `submission_month` (`YYYY-MM`).

### Multi-action stacking (FO 2.0)

Single-action adjudication is unchanged. Multi-action stacking uses `stack_action_deltas` with codebook default **`uncapped`** (profiled quarterly deltas sum without a cumulative ±S clamp so higher-order effects remain visible). Alternate modes: **`same_quarter`** (clamp cumulative per quarter to ±S after each add) and **`per_move`** (uncapped within a move; clamp each move’s contribution to ±S before adding to the running total). See Master Codebook for the full table. Annual display is Q4 aggregate only; `same_year_cap_class` is legacy.

### Lever × indicator directionality matrix (static)

Each lever carries a static directional impulse per indicator, with magnitude class and timing in **quarters** (`onset_quarters`, `ramp_in_quarters`, `decay_quarters`; optional `duration_quarters`). Default directions and sign-flip rules are unchanged from the Master Codebook; machine-readable values live in `codebook_data.json` (`trial-2026-07-13-quarterly`).

| Lever | GDP | Inflation | Unemployment | Trade | Investment | Timing (bib) |
|-------|-----|-----------|--------------|-------|------------|--------------|
| L1 Trade & Customs | -s | +M | +tr | -S | -s | Fast (Source 7) |
| L2 Export Controls | -tr | 0 | 0 | -M | -s | Prompt/slow macro (Source 8) |
| L3 Investment & Capital | -tr | 0 | 0 | -s | -M | Medium lag |
| L4 Financial Sanctions | -tr | +s | 0 | -M | -s | Completeness (Source 9) |
| L5 Financial Regulation | +tr | -s | 0 | 0 | +tr | Medium lag |
| L6 Development Finance | +tr | 0 | 0 | +M | +s | Long ramp (Source 10) |
| L7 Industrial Policy | +M | +s (transitory) | -s | -s | +S | Long onset/ramp (Source 10) |
| L8 Strategic Reserves | 0 | -s | 0 | +s | +s | Medium lag |
| L9 Standards & Data | +tr | 0 | 0 | +s | +tr | Slow (Source 10) |

**Magnitude classes:** **S** = 0.8, **M** = 0.5, **s** = 0.2, **tr** = 0.1, **0** = no effect.

### How Implementation modulates the trend line (magnitude and onset)

| Implementation | Magnitude | Onset delay |
|----------------|-----------|-------------|
| 9–10 | Full matrix class | Matrix onset |
| 7–8 | Full matrix class | Matrix + 4 quarters |
| 5–6 | One class down | Matrix + 4 quarters |
| 3–4 | Two classes down | Matrix + 8 quarters |
| 1–2 | No macroeconomic effect | — |

### How Fit modulates the trend line (persistence)

| Fit | Persistence |
|-----|-------------|
| 9–10 | Horizon plateau; duration-limited effects +4 quarters |
| 7–8 | Horizon plateau |
| 5–6 | 8-quarter plateau after ramp, then decay |
| 3–4 | 4-quarter plateau after ramp, then decay |
| 1–2 | No sustained macroeconomic effect; strategic incoherence flag |

### Traceability chain and SME approval

Every adjudicated trend line must be reproducible from five recorded facts: **(1)** lever and instrument → matrix row; **(2)** Direction facet → sign check; **(3)** Implementation score → magnitude/onset-delay band; **(4)** Fit score → persistence/decay band; **(5)** `submission_month` → start quarter + profiled weights.

The adjudication record carries this chain plus the Implementation worksheet (tier, modifiers) and the Fit anchor rationale. The SME reviews the record after PLI produces it and marks it **Approved** or **Overridden**; an override records the changed value and a one-line rationale, and the override — not the mechanical output — becomes the adjudication of record. The approval loop validates the rules themselves: repeated overrides of the same table entry are the signal to revise the table, not the scores.

### Worked example — L7 / I7.01 domestic supply-chain investment

Blue submits a domestic semiconductor supply-chain investment program in **2026-01**. Lever L7, instrument I7.01, Direction Inducement (default — no sign flip), Orientation Reframing.

- **Implementation 6:** Tier 2 midpoint 6.5 → 6. Band 5–6: magnitudes one class down, onset delay +4 quarters.
- **Fit 8:** band 7–8: horizon plateau after ramp.

Illustrative path shape (not annual bricks): fixed investment starts **2028Q1** and ramps; GDP starts **2029Q1** and rises across multiple quarters (Source 10); inflation is duration-capped and transitory. Exact quarter weights are in `codebook_data.json` / `engine.py`.

![PLI adjudication output example](PLI_Trend_Example.png)

Reading the chart: investment leads, GDP and jobs follow with multi-quarter ramps, the build-phase inflation bump is transitory, and the trade drag reflects import substitution. Green shading marks favorable divergence for the acting team, red unfavorable. This is the standard adjudication output for every scored action.

---

## Facets — tie-breaks and context only

| Facet | Values | Primary use |
|-------|--------|-------------|
| **Direction** | Coercive / Inducement / Mixed | Tie-break between adjacent levers; sign check for the directionality matrix |
| **Sector** | Telecommunications, Biotech, Agriculture, Minerals, Semiconductors, Finance, Energy, Digital, General | Routes to sector-growth tracker; exposure weight |
| **Target** | United States, People's Republic of China, All actors, Third countries, Mixed | People's Republic of China exposure for economic model |
| **Coalition** | Unilateral, Bilateral, Plurilateral, Multilateral | Implementation modifier input — not a lever |
| **Orientation** | Pressure, Stabilization, Reframing | **Required** — Fit cannot be scored without it |

**Not required for intake:** Implementation Tier (captured by the precedent test), Horizon (captured by matrix onset).

---

## Tie-break hierarchy (lever assignment)

Unchanged from the master codebook: eleven ordered rules (rule 4 scoped to bilateral partner-support swaps; rule 11 for territory / basing / strategic access); the currency, bond, and foreign-exchange guidance table carries over as-is.

---

## Intake and adjudication record (revised)

```
ActionID:           M1-A7
Cell:               Blue
Title:              Probiotic Act
PrimaryLever:       L7
PrimaryInstrument:  I7.01
SecondaryInstrument: -
Direction:          Inducement
Sector:             Biotech
Target:             United States
Coalition:          Unilateral
Orientation:        Reframing
Implementation:     6      (Tier 2: authority exists, appropriations new)
Fit:                8      (capacity-building under Reframing)
EscalationDelta:    0
MacroAdjudication:  L7 row; Impl band 5-6; Fit band 7-8; executed 2026
Notes:              Effects onset 2028-2029 per matrix + Implementation delay
SMEReview:          Approved   (or: Overridden - new value + rationale)
```

Retired fields: `ImplementationFit`, `Feasibility` (absorbed into Implementation), `Alignment` (absorbed into Fit). `DesignScore` remains a rubric matter outside PLI. New field: `SMEReview` — no adjudication is final until it carries an SME approval or a documented override.

---

## Fractured Order 1.0 Blue corpus — provisional rescoring

Provisional Implementation and Fit scores for the eleven Blue actions, applying the new rubrics to the FO 1.0 record (Blue's declared orientation: Reframing). Flagged for SME review; one-line rationale each.

| Action | Lever | Instr. | Implementation | Fit |
|--------|-------|--------|----------------|-----|
| M1-A1 Wedges & Incentive | NE | — | — | — |
| M1-A2 No BRICS+ in America | L2 | I2.04 | 5 — untested exclusion authority | 4 — coercive exclusion under Reframing |
| M1-A3 Minerals for All | L7 | I7.02 | 7 — deregulation, existing authority | 8 — capacity-building |
| M1-A4 Trade Investigations | L1 | I1.03 | 9 — deep Section 301/232 precedent | 6 — coercive tool, neutral to Reframing |
| M1-A5 Intellectual-Property Enforced Remuneration | L4 | I4.06 | 2 — no legal pathway (Tier 4) | 3 — coercive seizure cuts against Reframing |
| M1-A6 Stockpiling | L8 | I8.01 | 8 — standing reserve authority | 8 — resilience-building |
| M1-A7 Probiotic Act | L7 | I7.01 | 6 — authority exists, appropriations new | 8 — capacity-building |
| M2-A1 European Union Critical Minerals (withdrawn) | L6 | I6.05 | 4 — new plurilateral facility required | 7 — coalition-building |
| M2-A2 Global Telecommunications | L6 | I6.04 | 3 — funding source does not exist | 9 — textbook Reframing |
| M2-A3 Global Strategic Futures | L7 | I7.04 | 6 — research funding, authority exists | 8 — capacity-building |
| M2-A4 Sanctions & Critical Minerals | L4 | I4.02 | 6 — authority exists, untested scope | 4 — coercive escalation under Reframing |

Note the diagnostic gain over the old combined score: M1-A4 (old Implementation Fit 4) and M2-A2 (old 2) now read as *executable-but-off-strategy* (9/6) versus *on-strategy-but-unfunded* (3/9) — a distinction the single score could not express.

---

## Open items for SME review

- Magnitude display values (S=0.8, M=0.5, s=0.2, tr=0.1 percentage points) are charting conventions, not estimates — confirm they read as directional.
- The Fit-persistence rationale (misaligned actions decay for lack of strategic reinforcement) is a design choice — confirm or propose an alternative Fit channel.
- Inflation normalization date disagreement (IMF 2027 vs CBO 2030) — the baseline uses the IMF path; scenario bands documented in the annotated bibliography.
- Multi-action stacking default is **`uncapped`** (FO 2.0). Confirm whether any scenario pack should opt into `same_quarter` or `per_move` for display, or keep uncapped so higher-order effects stay visible.
- Move 3 display bands on FO packs that only stack Moves 1–2 are **continuation-only** (no new submissions). The live grid now runs through **2034Q4** so Move 3 filings remain on-horizon; FO report packs may still truncate display at 2032Q4 for the Blue corpus.
