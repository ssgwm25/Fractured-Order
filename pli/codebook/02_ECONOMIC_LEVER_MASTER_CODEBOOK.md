# Fractured Order 2.0 — Economic Lever & Instrument Master Codebook

## Architecture: three layers, one hierarchy

```
Layer 1 — PRIMARY LEVER (exactly one)     What economic domain are you operating in?
Layer 2 — POLICY INSTRUMENT (exactly one primary)   What specific tool executes the action?
Layer 3 — IMPLEMENTATION FIT (0–4)        Right lever, but wrong action plan?

Facets (tie-breaks & context only)        Direction, Sector, Target, Coalition
```

PLI separates three distinct layers — levers, instruments, and Implementation Fit — with a strict hierarchy and no overlapping names between layers:

- Levers answer **"where in economic statecraft?"**
- Instruments answer **"how, specifically?"**
- Implementation Fit answers **"is this the right plan for that lever?"**

A team can land in the correct lever (L4 Sanctions) with the wrong instrument (I4.06 Asset Remedies when a targeted specially designated national listing would suffice) or an implausible action plan (retroactive intellectual-property seizure with no legal pathway). That is an **implementation failure**, not a classification failure.

---

## Layer 1 — The ten economic levers

Ten levers cover the full Blue/Red/Green economic action corpus with minimal overlap. No undifferentiated catch-all bucket — each lever has a defined domain and instrument table.

| Code | Lever | Definition | Boundary |
|------|-------|------------|----------|
| **L1** | Trade & Customs | Tariffs, quotas, trade remedies (Section 301, Section 232, anti-dumping and countervailing duties), import/export bans on ordinary goods and services | Dual-use technology denial → **L2** |
| **L2** | Export Controls & Entity Lists | Entity lists, license denials, information and communications technology and services restrictions, deemed-export, strategic technology access denial | Generic tariffs → **L1** |
| **L3** | Investment & Capital Controls | Foreign investment screening, outbound investment rules, ownership caps, investment bans, **reciprocal FDI / investment-access packages** | Asset freeze → **L4**. Ordinary FDI / land investment without sovereignty or exclusive basing rights stays **L3**. Named reciprocal FDI packages → **I3.05** (not `needs_human` for inbound/outbound ambiguity) |
| **L4** | Financial Sanctions & Coercion | Targeted/secondary sanctions, asset freezes, payment-system denial, financial-market access bans, **legal-economic asset remedies** | Non-punitive regulation → **L5**. Sovereignty or basing-access transfer between states → **L10** (not I4.06) |
| **L5** | Financial Regulation & Digital Policy | Prudential and anti-money-laundering rules, digital asset policy, market-structure regulation, **domestic foreign-exchange intervention / rate-check coordination** without country-specific punishment | Bilateral partner-support swaps → **L6** (rule 4). Any sanction element → **L4** |
| **L6** | Development & Infrastructure Finance | Development finance institutions, foreign aid, export credit, overseas infrastructure/connectivity financing, **bilateral currency swaps for partner support**, **sovereign bond purchase/guarantee for partner states** | Domestic-only capacity → **L7**. Domestic foreign-exchange operations (not partner swap) → **L5**. Overseas infra finance whose *object* is territory/basing rights → **L10** |
| **L7** | Industrial Policy & Domestic Capacity | Subsidies, tax incentives, deregulation, procurement preferences, domestic research and development / industrial funding | Foreign deployment → **L6** |
| **L8** | Strategic Reserves & Supply Security | Stockpiling, reserve mandates, supply contingency authorities | New production → **L7** |
| **L9** | Standards, Regulation & Data Governance | Technical standards, regulatory harmonization, data governance, certification/trust regimes | Access bans → **L1/L2** |
| **L10** | Territorial Acquisition, Basing & Strategic Access | Negotiated acquisition, cession, long-term lease, or compensatory transfer of **sovereign territory, exclusive basing rights, or strategic geographic access** (including SLOC-critical islands/ports) where the economic bargain (payment, lease, offset package) is the operative instrument | Pure Military force posture, alliance messaging, or diplomacy with no purchase/lease/concession bargain → **NE**. Asset/IP/fund seizure inside a jurisdiction → **L4 / I4.06**. Ordinary FDI without sovereignty or exclusive basing → **L3**. Overseas infra finance without territorial/basing rights as the deal object → **L6** |

| Code | Special | Use |
|------|---------|-----|
| **NE** | Non-Economic | Default when Instrument of Power is Diplomatic, Informational, or Military — or when an Economic filing has no economic lever vector (mislabel / needs_human). No macro lever vector. Always routed to National Interest + Glasl; Diplomacy Index and Information brief follow default lanes or cited secondary facets (see Architecture / track routing). |

**Design notes:**
- Legal-economic coercion (intellectual-property seizure, eminent domain, retroactive compensation) is coercive financial punishment — it belongs under **L4** as instrument **I4.06**, not as its own lever.
- **L10 is not the retired legal-coercion lever.** The 2026-06-15 consolidation moved former legal-coercion L10 into I4.06. The current **L10** is a distinct domain for sovereignty / basing / strategic-access *transactions* between states.

---

## Layer 2 — Policy instruments (by lever)

Each action gets **one primary instrument**. Secondary instruments optional when bundled authorities are distinct.

### L1 — Trade & Customs
| Code | Instrument |
|------|------------|
| I1.01 | Tariffs / ad valorem duties |
| I1.02 | Quotas / quantitative restrictions |
| I1.03 | Trade investigations (Section 301 / Section 232 / anti-dumping and countervailing duties) |
| I1.04 | Import/export bans (non-dual-use goods) |
| I1.05 | Preferential trade access / free trade agreement expansion |

### L2 — Export Controls
| Code | Instrument |
|------|------------|
| I2.01 | Entity List designation |
| I2.02 | Export license denial / licensing regime |
| I2.03 | Information and communications technology and services / technology-transfer restriction |
| I2.04 | Market exclusion of foreign-affiliated technology systems |

### L3 — Investment & Capital
| Code | Instrument |
|------|------------|
| I3.01 | Inbound investment screening |
| I3.02 | Outbound investment restriction |
| I3.03 | Foreign ownership cap / divestment order |
| I3.04 | Investment ban (sector- or country-specific) |
| I3.05 | Reciprocal FDI / investment-access package (coupled screening, outbound rules, and/or market-access reciprocity) |

**Default direction for I3.05:** Mixed (security restriction + reciprocal access bargain). Use Coercive when the filing is framed only as denial/decoupling; Inducement when framed only as opening access conditional on partner reciprocity.

**Instrument selection — Reciprocal FDI Package:** When the action title, objective, or UI lever names a **Reciprocal FDI Package** (or equivalent security-restricted reciprocal investment package) and no single inbound/outbound/ban instrument clearly dominates, assign **L3 / I3.05**. Do **not** set `needs_human` solely because UI levers are empty, Implementation/Legislative fields are blank, or the package could be read as I3.01 vs I3.02 vs I3.04. Prefer a discrete I3.01–I3.04 code only when the operative act is clearly one of those alone.

**Worked example — Reciprocal FDI Package:** Economic Instrument of Power; objective cites alliance cohesion and security-restricted investment (biotech/telecom) without specifying inbound-only or outbound-only → **L3 / I3.05**, direction Mixed. National Interest and Glasl still run in parallel.

### L4 — Financial Sanctions & Coercion
| Code | Instrument |
|------|------------|
| I4.01 | Targeted sanctions (specially designated national / sectoral) |
| I4.02 | Secondary sanctions |
| I4.03 | Asset freeze / seizure |
| I4.04 | Payment-system / correspondent-banking restriction |
| I4.05 | Financial-market access ban |
| I4.06 | Legal-economic asset remedies (intellectual-property seizure, eminent domain, retroactive compensation, sovereign-fund confiscation) |

### L5 — Financial Regulation
| Code | Instrument |
|------|------------|
| I5.01 | Prudential / anti-money-laundering regulation |
| I5.02 | Digital asset / central bank digital currency policy |
| I5.03 | Market-structure / systemic-risk rule |
| I5.04 | Foreign-exchange market intervention / rate-check coordination (Treasury–central-bank signaling; not punitive) |

### L6 — Development & Infrastructure Finance
| Code | Instrument |
|------|------------|
| I6.01 | Bilateral development finance / aid |
| I6.02 | Multilateral development finance institution commitment |
| I6.03 | Export credit / loan guarantee |
| I6.04 | Overseas infrastructure / connectivity investment |
| I6.05 | Joint purchasing / allied finance facility |
| I6.06 | Bilateral currency swap / central-bank liquidity line (partner support) |
| I6.07 | Sovereign bond purchase or guarantee for partner state (inducement stabilization) |

### L7 — Industrial Policy
| Code | Instrument |
|------|------------|
| I7.01 | Subsidies / tax incentives |
| I7.02 | Deregulation for capacity expansion |
| I7.03 | Government procurement / domestic content requirement |
| I7.04 | Domestic research and development / industrial funding program |

### L8 — Strategic Reserves
| Code | Instrument |
|------|------------|
| I8.01 | Strategic stockpile build |
| I8.02 | Reserve mandate / release authority |
| I8.03 | Supply-security emergency authority |

### L9 — Standards & Data Governance
| Code | Instrument |
|------|------------|
| I9.01 | Technical standards-setting / adoption mandate |
| I9.02 | Regulatory harmonization / mutual recognition |
| I9.03 | Data localization / cross-border data rule |
| I9.04 | Certification / trusted-vendor regime |

### L10 — Territorial Acquisition, Basing & Strategic Access
| Code | Instrument |
|------|------------|
| I10.01 | Sovereign territory purchase or cession (treaty / legislative transfer) |
| I10.02 | Long-term basing / Status of Forces Agreement / exclusive facility rights package |
| I10.03 | Strategic port, canal, or sea-lane-of-communication access concession |
| I10.04 | Compensatory economic package tied to territorial or basing settlement |

**Default direction:** Inducement (purchase/lease packages). Use Coercive or Mixed when the deal is framed as compelled cession or dual carrot-stick.

**Worked example — Purchase Chagos Archipelago:** Economic Instrument of Power; operative act is UK–US sovereign territory purchase/cession for Indian Ocean basing and SLOC protection → **L10 / I10.01**, direction Inducement. National Interest (NI-1 / NI-4) and Glasl still run in parallel. Do **not** force-fit L1–L9 or route to `needs_human` solely because no prior L-code existed.

---

## Layer 3 — Implementation Fit score (0–4)

Scored by White Cell **after** lever and instrument are assigned. This is where "right lever, wrong action plan" lives.

| Score | Label | Criteria |
|-------|-------|----------|
| **4** | Well-fit | Primary instrument matches lever and objective; authority/pathway plausible; sequencing sound |
| **3** | Acceptable | Correct instrument class; minor gaps in authority, funding, or timeline |
| **2** | Misfit | Correct lever domain, but **wrong instrument choice** for the objective (e.g., broad secondary sanctions when a targeted specially designated national listing would suffice; development finance promised without funding source) |
| **1** | Implausible | Instrument identified correctly, but action plan is **not executable** in-round (legal dead-end, missing allied prerequisite, incoherent bundling) |
| **0** | Incoherent | Lever-instrument mismatch, or action plan contradicts stated objective |

### Implementation Fit is separate from the existing Design/Feasibility/Alignment rubric

| Rubric dimension | What it measures |
|------------------|------------------|
| Action Design | Specificity, clarity, internal logic |
| Feasibility | Can it actually be executed given scenario constraints? |
| Alignment | Fit with team orientation and scenario logic |
| **Implementation Fit (new)** | Given the lever, is this the **right instrument and action plan**? |

Example — M1-A5 Intellectual-Property Enforced Remuneration:
- Lever: **L4** (correct domain — coercive financial/legal)
- Instrument: **I4.06** (correct identification of what they proposed)
- Implementation Fit: **1** (instrument class recognized, plan implausible — matches adjudication Feasibility 0–1/4)
- The team did not fail classification; they failed execution design.

Example — M2-A2 Global Telecommunications Initiative:
- Lever: **L6** (correct)
- Instrument: **I6.04** (overseas connectivity investment)
- Implementation Fit: **2** (right domain, wrong plan — assumes allied funding and intellectual-property-enforcement revenue that does not exist)

### Model hook

```
EffectiveDesign = DesignScore × (ImplementationFit / 4)
```

Or additive: Implementation Fit feeds Feasibility cap. White Cell choice at build time — document records both options.

---

## Facets — tie-breaks and context only

Facets do **not** compete with levers or instruments. Use when:

| Facet | Values | Primary use |
|-------|--------|-------------|
| **Direction** | Coercive / Inducement / Mixed | Tie-break between adjacent levers (L1 vs L4 when both restrictive) |
| **Sector** | Telecommunications, Biotech, Agriculture, Minerals, Semiconductors, Finance, Energy, Digital, General | Routes to sector-growth tracker; exposure weight |
| **Target** | United States, People's Republic of China, All actors, Third countries, Mixed | People's Republic of China exposure for economic model |
| **Coalition** | Unilateral, Bilateral, Plurilateral, Multilateral | Feasibility modifier — not a lever |

**Not required for intake:** Orientation (captured in rubric Alignment), Implementation Tier (captured by instrument and feasibility), Horizon (White Cell adjudication note, not a coding field).

---

## Tie-break hierarchy (lever assignment)

1. Asset seizure / retroactive compensation / payment denial → **L4**
2. Export license / entity list / technology-system exclusion → **L2**
3. Investment screening / capital-flow ban → **L3**
4. **Bilateral currency swap / central-bank liquidity line for partner support → L6**
5. Tariff / quota / trade remedy → **L1**
6. Stockpiling / reserves → **L8**
7. Overseas infrastructure / development finance → **L6**
8. Domestic subsidy / deregulation / procurement → **L7**
9. Standards / harmonization → **L9**
10. Non-sanctions financial rule → **L5**
11. **Sovereign territory purchase/cession, exclusive basing rights, or strategic geographic access concession (payment, lease, or compensatory package) → L10**

**Rule 4 scope:** Partner-support swaps only. Domestic/prudential foreign-exchange management stays **L5** (rule 10). Punitive denial of swap or bond market access stays **L4** (rule 1). Swap used as capital-control enforcement stays **L3** (rule 3).

**Rule 11 scope:** The object of the bargain must be sovereignty, exclusive basing, or strategic geographic access. Ordinary overseas infrastructure without those rights stays **L6** (rule 7). Intra-jurisdiction asset seizure stays **L4 / I4.06** (rule 1). Pure Military/Diplomatic acts without a transactional access deal stay **NE**.

If Direction is Inducement and two levers fit, prefer L6/L7/L8/L10 over L1–L4.  
If Direction is Coercive, prefer L1–L4 over L6–L10 unless rule 11 (territory/basing) clearly dominates.

---

## Currency, bond, and foreign exchange operations

| Example | Lever | Instrument | Notes |
|---------|-------|------------|-------|
| Argentina–United Arab Emirates currency swap | **L6** | **I6.06** | Rule 4 (partner-support swap); Inducement |
| People's Republic of China swap line to Global South partner | **L6** | **I6.06** | Rule 4 (partner-support swap); same mechanism |
| United States Treasury rate-check response to Bank of Japan | **L5** | **I5.04** | Rule 10 (non-sanctions financial rule); foreign-exchange coordination, not punitive |
| Ban on adversary sovereign bond access | **L4** | **I4.05** | Rule 1; coercive market access denial |
| United States purchase of partner sovereign bonds (inducement) | **L6** | **I6.07** | Rule 7 if infrastructure-framed; I6.07 when bond support dominates |
| Outbound ban on buying adversary sovereign debt | **L3** or **L4** | I3.04 or I4.05 | Dominance rule; both covered |
| United States purchase of Chagos Archipelago from the United Kingdom | **L10** | **I10.01** | Rule 11; sovereignty transfer for basing / SLOC |
| Long-term exclusive basing rights package with host-nation offsets | **L10** | **I10.02** | Rule 11; not L6 overseas infra alone |
| Strategic port access concession tied to lease payments | **L10** | **I10.03** | Rule 11 |
| Reciprocal FDI Package (security-restricted investment + access bargain; inbound/outbound not specified) | **L3** | **I3.05** | Rule 3; package instrument when I3.01–I3.04 do not uniquely dominate |

---

## White Cell intake form

```
ActionID:           M1-A5
Cell:               Blue
Title:              Intellectual-Property Enforced Remuneration
PrimaryLever:       L4
PrimaryInstrument:  I4.06
SecondaryInstrument: I3.04
Direction:          Coercive
Sector:             Digital
Target:             People's Republic of China
Coalition:          Plurilateral
ImplementationFit:  1
DesignScore:        1/4
Feasibility:        0/4
Alignment:          1/4
EscalationDelta:    +2
Notes:              Right lever; wrong action plan
```

---

## Fractured Order 1.0 Blue corpus quick reference

Reference classifications for the eleven economic actions submitted by the Blue team in Fractured Order 1.0.

| Action | Lever | Instrument | Implementation Fit |
|--------|-------|------------|-------------------|
| M1-A1 Wedges & Incentive | NE | — | — |
| M1-A2 No BRICS+ in America | L2 | I2.04 | 2 |
| M1-A3 Minerals for All | L7 | I7.02 | 3 |
| M1-A4 Trade Investigations | L1 | I1.03 | 4 |
| M1-A5 Intellectual-Property Enforced Remuneration | L4 | I4.06 | 1 |
| M1-A6 Stockpiling | L8 | I8.01 | 3 |
| M1-A7 Probiotic Act | L7 | I7.01 | 3 |
| M2-A1 European Union Critical Minerals (withdrawn) | L6 | I6.05 | 2 |
| M2-A2 Global Telecommunications | L6 | I6.04 | 2 |
| M2-A3 Global Strategic Futures | L7 | I7.04 | 3 |
| M2-A4 Sanctions & Critical Minerals | L4 | I4.02 | 2 |

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-15 | Initial 10-lever + facet model (superseded) |
| 2026-06-15 | Nine-lever architecture; instrument layer; Implementation Fit; former L10 consolidated into I4.06; facets simplified |
| 2026-06-30 | Master codebook: I5.04, I6.06, I6.07; tie-break rule 4 (partner-support swaps); currency/bond/foreign-exchange guidance |
| 2026-07-29 | Add **L10 Territorial Acquisition, Basing & Strategic Access** (I10.01–I10.04) and tie-break rule 11. Distinct from the retired legal-coercion L10 that was merged into I4.06. Covers Chagos-style sovereignty / basing transactions so they classify under Macro instead of `needs_human`. |
| 2026-07-30 | Add **I3.05 Reciprocal FDI / investment-access package** under L3. Named reciprocal FDI / security-restricted investment packages classify as L3/I3.05 instead of `needs_human` when inbound vs outbound vs ban cannot be uniquely assigned. |
