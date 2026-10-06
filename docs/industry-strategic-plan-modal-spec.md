# Industry Strategic Plan — Decision Modal Specification

> **Consolidated version 2 amendment:** The shipped modal now records one
> package containing mandatory `Agriculture`, `Telecommunications`, and
> `Biotechnology` plans. The field definitions below apply independently to
> each sector, except the Blue forecast, which is shared by the package. The
> modal uses six pages per sector plus a final review, removes “for the Game”
> from the Strategic Priorities heading, and stores the plans under
> `industryStrategicPlan.sectorPlans`. See
> [Industry Strategic Plan architecture](architecture/industry-strategic-plan.md)
> for the authoritative version 2 persistence and compatibility contract. The
> original single-sector wording below is retained as the version 1 field
> history.

## Purpose

This document defines **what the Industry Strategic Plan modal must capture** for **Move 1 — Strategic Plan** in Fractured Order.

It is intended as an implementation-ready field specification for an AI coding agent. It describes:

- required entries;
- selectable options;
- repeatable rows;
- validation rules;
- recommended field IDs / data keys;
- display copy; and
- the normalized data shape expected from the modal.

This specification covers **only the Move 1 Strategic Plan**. The separate **Turn Sheet** is explicitly out of scope.

---

# 1. Modal Identity

**Modal title:** `Industry Strategic Plan`

**Context label:** `Move 1 — Strategic Plan`

**Primary action:** `Record Strategic Plan`

**Secondary action:** `Cancel`

The modal represents one Industry Strategic Plan artifact for the current session.

---

# 2. Section Overview

The modal must capture the following sections in this order:

1. Sector
2. A. Business Overview
3. B. Top Three Risk Factors
4. C. Opening Read of the Environment
5. D. Partner Map
6. E. Strategic Priorities for the Game
7. Strategic Stance
8. Red Line

---

# 3. Sector

## Source prompt

`Sector: Agriculture / Telecom / Biotech`

## Modal field

**Key:** `sector`

**Type:** single-select radio group

**Required:** yes

### Options

| Stored value | Display label |
|---|---|
| `agriculture` | Agriculture |
| `telecom` | Telecom |
| `biotech` | Biotech |

## Validation

- Exactly one sector must be selected.
- No free-text sector value.

## Implementation note

The source document visually uses checkboxes. For the platform modal, treat this as a **single sector selection** unless the existing application explicitly supports one Industry artifact representing multiple sectors.

---

# 4. A. Business Overview

## Source prompt

> In your own words, what does your company do, and what matters most to it right now?

The source notes that this helps participants understand their role, including strengths and points of exposure.

## Modal field

**Key:** `businessOverview`

**Type:** multiline textarea

**Required:** yes

**Recommended visible label:** `Business Overview`

**Recommended helper text:**

`Describe what the company does, what matters most to it right now, and the strengths or exposures that shape its position.`

## Validation

- Must contain non-whitespace text.
- Do not auto-generate or infer the participant's answer.

---

# 5. B. Top Three Risk Factors

## Source requirement

The Industry team identifies its **top three risk factors**.

The modal must display exactly **three risk rows**.

## Data structure

```js
risks: [
  {
    type,
    otherText,
    likelihood,
    impact,
    tiedCell
  },
  {
    type,
    otherText,
    likelihood,
    impact,
    tiedCell
  },
  {
    type,
    otherText,
    likelihood,
    impact,
    tiedCell
  }
]
```

---

## 5.1 Risk Type

**Key:** `risks[n].type`

**Type:** select / combobox

**Required:** yes

### Options

| Stored value | Display label |
|---|---|
| `retaliation` | Retaliation |
| `secondary_sanctions_exposure` | Secondary-sanctions exposure |
| `supply_disruption` | Supply disruption |
| `ip_theft_forced_tech_transfer` | IP theft / forced tech transfer |
| `regulatory_legal` | Regulatory / legal |
| `reputational` | Reputational |
| `stranded_assets` | Stranded assets |
| `lost_market_access` | Lost market access |
| `other` | Other |

### Other risk text

If `type === 'other'`:

**Key:** `risks[n].otherText`

**Type:** short text input

**Required:** yes when `type === 'other'`

**Label:** `Describe other risk`

---

## 5.2 Likelihood

**Key:** `risks[n].likelihood`

**Type:** segmented control / radio group

**Required:** yes

### Options

| Stored value | Display label |
|---|---|
| `low` | Low |
| `medium` | Medium |
| `high` | High |

The source form abbreviates these as `L / M / H`.

---

## 5.3 Impact

**Key:** `risks[n].impact`

**Type:** segmented control / radio group

**Required:** yes

### Options

| Stored value | Display label |
|---|---|
| `low` | Low |
| `medium` | Medium |
| `high` | High |

---

## 5.4 Tied to Which Cell?

**Key:** `risks[n].tiedCell`

**Type:** segmented control / radio group

**Required:** yes

### Options

| Stored value | Display label | Source abbreviation |
|---|---|---|
| `blue` | Blue | B |
| `red` | Red | R |
| `green` | Green | G |

---

## 5.5 Risk Validation

- Exactly three risk rows must be complete.
- Every row requires:
  - risk type;
  - likelihood;
  - impact;
  - tied cell.
- `otherText` is mandatory when the type is `other`.
- Ordinary risk types should not be duplicated across rows.
- Multiple `other` risks may be permitted only when the descriptions differ.
- Reject partially completed rows.

---

# 6. C. Opening Read of the Environment

This section captures the Industry team's initial assessment of Blue and Red.

---

## 6.1 Expected Blue Strategic Orientation

## Source prompt

> What do you expect Blue's overall strategic orientation to be?

**Key:** `blueForecast`

**Canonical platform representation:** existing Blue forecast target in `forecastTargets`

**Type:** single-select catalogue cards / radio group

**Required:** yes

### Platform options

The source document asks the question but does not itself define a closed option list. The existing Fractured Order Strategic Orientation catalogue provides the following platform options and should remain the source of truth for this field:

| Stored value | Display label | Existing platform description/tag |
|---|---|---|
| `pressure` | Pressure | Focus on affecting PRC GDP growth |
| `stabilization` | Stabilization | Achieve normalization with partners and existing relationships |
| `reframe` | Reframe | Develop new alliance and partnership structures |

### UI label

`What do you expect Blue's overall strategic orientation to be?`

### Validation

- Exactly one option must be selected.
- Continue using the existing canonical `forecastTargets` representation rather than creating a second independent Blue-forecast field in persistence.

---

## 6.2 Expected Red Priorities

## Source prompt

> What do you expect Red (China / Russia) to prioritize?

**Key:** `redPriorities`

**Type:** multiline textarea

**Required:** yes

**Recommended visible label:** `What do you expect Red (China / Russia) to prioritize?`

## Validation

- Must contain non-whitespace text.
- Do not force this answer into the Pressure / Stabilization / Reframe catalogue unless a separate Red-specific catalogue is explicitly introduced elsewhere.

---

# 7. D. Partner Map

## Source framing

`No one wins this alone.`

The source provides a table with the following columns:

1. Green nation or allied firm
2. Why they matter to you
3. What they likely want from you

The source form visually provides **three partner rows**.

---

## 7.1 Partner Entries

**Key:** `partners`

**Type:** repeatable rows, render three rows

### Row shape

```js
{
  partner,
  whyTheyMatter,
  likelyWant
}
```

### Column 1 — Partner

**Key:** `partners[n].partner`

**Label:** `Green Nation or Allied Firm`

**Type:** text input

### Column 2 — Why They Matter

**Key:** `partners[n].whyTheyMatter`

**Label:** `Why They Matter to You`

**Type:** text input or compact textarea

### Column 3 — What They Likely Want

**Key:** `partners[n].likelyWant`

**Label:** `What They Likely Want From You`

**Type:** text input or compact textarea

## Validation

- Render three partner rows.
- At least one complete partner row is required.
- Fully blank optional rows may be ignored in normalized storage.
- If any field in a row is filled, all fields in that row must be completed.
- Do not persist empty partner objects.

---

# 8. First Ambassador Target

## Source prompt

`First ambassador target (cell and reason)`

## Data structure

```js
firstAmbassadorTarget: {
  cell,
  reason
}
```

---

## 8.1 Cell

**Key:** `firstAmbassadorTarget.cell`

**Type:** select

**Required:** yes

### Option source

Reuse the platform's existing canonical cell/team options if available.

Do not create a new database enum solely for this field.

The source document requires a cell, but does not provide a dedicated closed list in this section.

---

## 8.2 Reason

**Key:** `firstAmbassadorTarget.reason`

**Type:** text input or compact textarea

**Required:** yes

**Label:** `Reason`

## Validation

Both cell and reason must be present.

---

# 9. E. Strategic Priorities for the Game

## Source framing

`Like an MD&A outlook`

The source form provides three numbered rows.

Each row contains:

1. Priority
2. Success looks like...

## Data structure

```js
strategicPriorities: [
  {
    priority,
    successLooksLike
  },
  {
    priority,
    successLooksLike
  },
  {
    priority,
    successLooksLike
  }
]
```

Render exactly **three rows**.

---

## 9.1 Priority

**Key:** `strategicPriorities[n].priority`

**Type:** text input or compact textarea

**Required:** yes

**Label:** `Priority`

---

## 9.2 Success Criteria

**Key:** `strategicPriorities[n].successLooksLike`

**Type:** text input or compact textarea

**Required:** yes

**Label:** `Success Looks Like...`

## Validation

- Exactly three strategic-priority rows must be complete.
- Reject partially completed rows.
- These are baseline objectives; they are **not** normal action records.

---

# 10. Strategic Stance

## Source control

`PROFIT FIRST  ◄ 1 2 3 4 5 ►  NATIONAL INTEREST FIRST`

Source interpretation:

- `1` = maximize the business even against Blue's wishes
- `3` = balanced
- `5` = align with Blue even at real cost

## Modal field

**Key:** `strategicStance`

**Type:** accessible 1–5 radio scale / segmented control

**Required:** yes

### Options

| Stored value | Display value |
|---:|---:|
| `1` | 1 |
| `2` | 2 |
| `3` | 3 |
| `4` | 4 |
| `5` | 5 |

### Endpoint labels

Left: `Profit First`

Right: `National Interest First`

### Helper text

`1 = maximize the business even against Blue's wishes · 3 = balanced · 5 = align with Blue even at real cost`

## Validation

- Must be an integer from 1 through 5.
- Persist the numeric value, not the endpoint label.

---

# 11. Red Line

## Source prompt

> What would you never do, even under pressure? (your red line)

## Modal field

**Key:** `redLine`

**Type:** multiline textarea

**Required:** yes

**Visible label:** `What would you never do, even under pressure?`

**Supporting label:** `Your Red Line`

## Validation

- Must contain non-whitespace text.
- Capture as participant-authored baseline strategic constraint.
- Do not convert this field into automated enforcement logic in the modal.

---

# 12. Normalized Modal Data Shape

The modal should produce a normalized object approximately like:

```js
{
  version: 1,

  sector: 'telecom',

  businessOverview: '...',

  risks: [
    {
      type: 'supply_disruption',
      otherText: '',
      likelihood: 'high',
      impact: 'high',
      tiedCell: 'red'
    },
    {
      type: 'secondary_sanctions_exposure',
      otherText: '',
      likelihood: 'medium',
      impact: 'high',
      tiedCell: 'blue'
    },
    {
      type: 'reputational',
      otherText: '',
      likelihood: 'medium',
      impact: 'medium',
      tiedCell: 'green'
    }
  ],

  redPriorities: '...',

  partners: [
    {
      partner: '...',
      whyTheyMatter: '...',
      likelyWant: '...'
    }
  ],

  firstAmbassadorTarget: {
    cell: '...',
    reason: '...'
  },

  strategicPriorities: [
    {
      priority: '...',
      successLooksLike: '...'
    },
    {
      priority: '...',
      successLooksLike: '...'
    },
    {
      priority: '...',
      successLooksLike: '...'
    }
  ],

  strategicStance: 3,

  redLine: '...'
}
```

The Blue orientation forecast should continue to use the platform's existing canonical Strategic Orientation forecast representation rather than becoming a second independently editable value inside this object.

---

# 13. Form-Level Validation Summary

The modal may be submitted only when all of the following are true:

| Requirement | Rule |
|---|---|
| Sector | Exactly one selected |
| Business Overview | Required |
| Risk Factors | Exactly three complete risk rows |
| Blue Forecast | Exactly one valid Pressure / Stabilization / Reframe selection |
| Red Priorities | Required |
| Partner Map | At least one complete partner row; no partial rows |
| First Ambassador Target | Cell and reason required |
| Strategic Priorities | Exactly three complete rows |
| Strategic Stance | Integer 1–5 |
| Red Line | Required |

On failed validation:

- show an error summary at the top of the modal;
- show inline field/row errors;
- mark invalid controls using `aria-invalid` where appropriate;
- move focus to the error summary;
- preserve all entered values.

---

# 14. Recommended Modal Layout

Use a sectioned modal rather than a single unbroken form.

Recommended order:

```text
Move 1 — Strategic Plan

Sector

A. Business Overview

B. Top Three Risk Factors
[Risk 1]
[Risk 2]
[Risk 3]

C. Opening Read of the Environment
[Blue forecast]
[Red priorities]

D. Partner Map
[Partner 1]
[Partner 2]
[Partner 3]
[First ambassador target]

E. Strategic Priorities for the Game
[Priority 1]
[Priority 2]
[Priority 3]

Strategic Stance

Red Line

[Cancel] [Record Strategic Plan]
```

A vertical stepper, accordion, or clearly separated section layout is acceptable, provided the full plan is still one saved artifact.

---

# 15. Source-Derived vs Platform-Derived Controls

The AI coding agent must distinguish between fields explicitly defined by the Strategic Plan source and controls supplied by the existing platform.

## Explicitly defined by the Strategic Plan

- sector labels: Agriculture / Telecom / Biotech;
- business overview prompt;
- risk categories;
- likelihood L/M/H;
- impact L/M/H;
- tied cell B/R/G;
- Blue orientation question;
- Red priorities question;
- partner-map columns;
- first ambassador target and reason;
- three strategic-priority rows;
- strategic stance 1–5;
- red line.

## Platform-derived implementation detail

The closed options:

```text
Pressure
Stabilization
Reframe
```

for the Blue orientation forecast come from the platform's existing Strategic Orientation catalogue, not from the paper Strategic Plan itself.

Use the existing catalogue rather than introducing a duplicate taxonomy.

---

# 16. Explicitly Out of Scope — Turn Sheet

Do **not** capture the following in this Strategic Plan modal:

- move-by-move environment read;
- action codes;
- supply-chain stages;
- Red dependency rating by supply-chain stage;
- Hold / Diversify / Reshore / Stockpile / Partner / Exit decisions;
- weakest-link assessment;
- status of previous move position;
- primary move;
- counterparty;
- capital commitment;
- visibility;
- ASK;
- OFFER;
- stakeholder gain/risk table;
- intended effect;
- move implementation steps;
- expected revenue effect;
- operating-cost effect;
- U.S. jobs effect;
- capacity / supply-security effect;
- effect timing;
- escalation markers;
- ambassador outcome;
- inbound ambassador log;
- move-specific risk and spillover;
- move stance check;
- forecast for next move;
- facilitator hand-off summary.

Those belong to the separate Turn Sheet / move-decision workflow.

---

# 17. Blank Reference Object

Use the following as a convenient blank-state reference:

```js
{
  version: 1,
  sector: '',
  businessOverview: '',
  risks: [
    {
      type: '',
      otherText: '',
      likelihood: '',
      impact: '',
      tiedCell: ''
    },
    {
      type: '',
      otherText: '',
      likelihood: '',
      impact: '',
      tiedCell: ''
    },
    {
      type: '',
      otherText: '',
      likelihood: '',
      impact: '',
      tiedCell: ''
    }
  ],
  redPriorities: '',
  partners: [
    {
      partner: '',
      whyTheyMatter: '',
      likelyWant: ''
    },
    {
      partner: '',
      whyTheyMatter: '',
      likelyWant: ''
    },
    {
      partner: '',
      whyTheyMatter: '',
      likelyWant: ''
    }
  ],
  firstAmbassadorTarget: {
    cell: '',
    reason: ''
  },
  strategicPriorities: [
    {
      priority: '',
      successLooksLike: ''
    },
    {
      priority: '',
      successLooksLike: ''
    },
    {
      priority: '',
      successLooksLike: ''
    }
  ],
  strategicStance: null,
  redLine: ''
}
```

The Blue Strategic Orientation forecast remains separately represented through the existing canonical `forecastTargets` state/contract.

---

# 18. Acceptance Checklist for the Modal

- [ ] Modal title is `Industry Strategic Plan`.
- [ ] Move 1 context is visible.
- [ ] User selects one sector.
- [ ] Business overview is captured.
- [ ] Exactly three risks can be recorded.
- [ ] Every risk captures type, likelihood, impact, and tied cell.
- [ ] Other risk requires description.
- [ ] Blue orientation forecast uses Pressure / Stabilization / Reframe.
- [ ] Red priorities are captured as narrative.
- [ ] Three partner rows are available.
- [ ] First ambassador target captures cell and reason.
- [ ] Exactly three strategic-priority rows are captured.
- [ ] Strategic stance captures 1–5 numerically.
- [ ] Red line is captured.
- [ ] Invalid or partial rows cannot be submitted.
- [ ] Form values survive validation errors.
- [ ] No Turn Sheet fields appear in this modal.
- [ ] The full modal represents one Industry Strategic Plan artifact.
