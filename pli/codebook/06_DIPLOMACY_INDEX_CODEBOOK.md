# Fractured Order 2.0 — Diplomacy Index Codebook

**Track:** Diplomacy (indexing — not a numeric score)  
**Bibliography:** Sources 18–20 in `PLI_Annotated_Bibliography.md` `(Diplomacy)`

**Operating principle — PLI indexes, the SME approves.** Output is a four-field taxonomy code. There is **no** diplomacy score.

---

## When this track runs

**Default lane:** Plenum **Instrument of Power** (`actions.mechanism`) — starting map only, not the sole authority. Bundled tools and mislabeled filings must be caught by the agent/SME (see Architecture / track routing).

| Instrument of Power | Diplomacy track |
|---------------------|-----------------|
| Diplomatic | **Required** |
| Informational / Economic / Military | Off by default; open as a **secondary facet** only with cited dual-lane evidence (`secondary_facet_citation`), or flag `needs_human` if the Diplomatic label is wrong |

---

## Four-field coding format

```
TopLayer | DiplomaticCategory | DiplomaticBand | PolicyStyle
```

Example: `D/E | Coalition-Building / Partner Alignment | Pressure | Agenda-Shaping / Norm-Setting`

### 1. Top layer (DIME)

Allowed: `D`, `D/E`, `D/I`, `D/M`, `D/E/I`, `D/I/M`, `D/E/M` (must start with Diplomatic primary).

### 2. Diplomatic category (hierarchy, pressure → cooperative)

**Pressure band categories**
- Signaling / Strategic Communication
- Consular / Societal Diplomacy
- Coalition-Building / Partner Alignment

**Positioning band categories**
- Multilateral / Institutional Diplomacy
- Bilateral Diplomacy
- Digital Diplomacy

**Relationship-Building band categories**
- Public Diplomacy → Information / Media / Narrative Engagement
- Public Diplomacy → Outreach / Audience Engagement
- Public Diplomacy → Platform-Based Engagement
- Public Diplomacy → Exchanges

### 3. Diplomatic band

Exactly one of: `Pressure` | `Positioning` | `Relationship-Building`

Category must belong to the selected band (engine validates).

### 4. Policy style

Exactly one of:
- Directive / Exclusionary
- Structured Alignment
- Targeted Strategic Coordination
- Agenda-Shaping / Norm-Setting
- Internal Coordination
- Consultative / Exploratory
- Facilitative / Capacity-Building

---

## Tie-break rules

1. Code by **main delivery mechanism**, not only intended effect.
2. If instruments mix, use a combined top layer (e.g., `D/E`).
3. If diplomacy and economics mix, keep the diplomatic category focused on the diplomatic delivery element.
4. Band shows relative coerciveness: Pressure hardest, Relationship-Building softest.
5. Subcategories are grounded in State FAM/FAH materials; the coercive-to-cooperative **ordering** is an analytic synthesis for the game (see bibliography Source 18 note).

---

## Agent worksheet contract

JSON matching `schemas/diplomacy_worksheet_schema.json`:

- `top_layer`, `category`, `band`, `policy_style`
- `code_string` (normalized display)
- `rationale`, `needs_human` / reason

---

## Engine validation

Validate enum membership; ensure category ∈ band; normalize `code_string`; no numeric fields allowed.
