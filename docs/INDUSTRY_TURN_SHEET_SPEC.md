# INDUSTRY TURN SHEET / PROPOSAL SPECIFICATION

## 1. Purpose

This specification defines the **Industry Turn Sheet** for the PLENUM platform.

In PLENUM terminology, the Industry Turn Sheet **is the Industry Proposal artifact**. It is not a separate reflection form and must not require the Industry cell to create a second proposal after completing the Turn Sheet.

The canonical workflow is:

```text
Industry Scribe
    ↓
Industry Turn Sheet / Proposal
    ↓
Facilitator review and optional edit
    ↓
White Cell
    ↓
Complete OR Return for Revision
```

The Turn Sheet is completed after the Industry Strategic Plan phase and is used for recurring move-level decision-making.

---

# 2. Industry Cell Structure

There is **one Industry cell**.

The Industry cell represents three industries:

```text
Agriculture
Biotechnology
Telecommunications
```

Each proposal belongs to exactly one of those industries.

Stable IDs:

```js
'agriculture'
'biotechnology'
'telecommunications'
```

Display labels:

```text
Agriculture
Biotechnology
Telecommunications
```

---

# 3. Proposal Frequency and First-Proposal Rule

The Industry cell may submit:

- at least one proposal for each industry in each move;
- more than one proposal for the same industry in the same move.

However, **Environment Read** and **Supply Chain Exposure** are only completed as editable sections on the **first proposal for that industry in that move**.

Example:

```text
Move 2

Agriculture Proposal 1
- Environment Read: editable and required
- Supply Chain: editable and required
- Remaining sections: editable and required

Agriculture Proposal 2
- Environment Read: read-only carry-forward from Agriculture Proposal 1
- Supply Chain: read-only carry-forward from Agriculture Proposal 1
- Remaining sections: editable and required

Biotechnology Proposal 1
- Environment Read: editable and required
- Supply Chain: editable and required
- Remaining sections: editable and required
```

The system must determine first-proposal status using persisted proposal records, not only client state.

---

# 4. Artifact Identity

The Turn Sheet must remain part of the existing PLENUM proposal workflow.

Do not create a second artifact representing the same decision.

The artifact should be treated conceptually as:

```text
Industry Proposal
subtype: Industry Turn Sheet
industry: Agriculture | Biotechnology | Telecommunications
move: N
```

The Turn Sheet is the authoritative Industry proposal record for that decision.

---

# 5. Ownership and Workflow

## Author

The **Industry Scribe** completes the proposal.

## Handoff

The Scribe forwards the proposal to the **Industry Facilitator**.

## Facilitator

The Facilitator may:

- review the full proposal;
- edit the proposal before submission;
- add a separate facilitator note;
- submit the proposal to White Cell.

A facilitator note must not silently replace or alter the Industry team's underlying responses.

## White Cell

White Cell may:

- review the full proposal;
- mark it complete;
- return it for revision with review notes.

## Revision behavior

Once submitted to White Cell:

- the proposal is locked;
- a White Cell return creates a revision workflow;
- prior revisions remain immutable;
- the returned revision becomes editable;
- resubmission follows the existing PLENUM artifact workflow.

---

# 6. Three-Page Modal Structure

The Turn Sheet modal uses **three pages**, with two logical steps per page.

This avoids an excessively long scrolling modal while preserving the full information model.

## Page 1

```text
Step 1 — Environment
Step 2 — Supply Chain
```

## Page 2

```text
Step 3 — Decision
Step 4 — Expected Effects
```

## Page 3

```text
Step 5 — Engagement & Risk
Step 6 — Position & Forecast
```

## Final Review

After Page 3, the user sees a **Review Proposal** screen before forwarding.

The review screen is not counted as one of the three form pages.

---

# 7. Modal Header

Recommended header pattern:

```text
Industry Proposal · Move {N}
{Industry Name}

Page {X} of 3
```

Do not repeat:

```text
Industry Turn Sheet
Turn Sheet Details
Industry Proposal Details
Proposal Turn Sheet
```

throughout the modal.

The interface should use one clear artifact title and then concise section headings.

---

# 8. Global Requiredness Rule

**Everything is required** before the Scribe can forward the proposal.

The only exceptions are fields that are structurally inapplicable because the UI is in a read-only carry-forward state.

Examples:

- Environment Read and Supply Chain are read-only on second/subsequent proposals for the same industry in the same move.
- `Other` free-text is required only when `Other` is selected, because otherwise the field does not exist.
- A linked engagement outcome is required when an engagement is linked.
- Expected effects may use `Unknown` or `Not applicable`, but a value must still be selected.
- Escalation rationale is required whenever the escalation section is present; if `None` is selected, rationale must still explain why escalation is not expected.

The submit/forward action must remain disabled until all applicable required fields pass validation.

## 8.1 Draft minimum

A persisted draft requires all of the following:

- one Industry sector;
- the completed Industry Strategic Plan reference;
- at least one intended recipient: Blue, Red, or both.

The remaining applicable fields may be incomplete in a draft, but they are all
required before forwarding. Client validation and the database trigger enforce
the same draft minimum. A rejected save remains in the editor and must not be
shown as saved or forwarded.

---

# 9. Page 1 — Step 1: Environment Read

## Purpose

Capture the Industry cell's current assessment of major actor behavior.

For the first proposal for an industry in a move, the section is editable.

For subsequent proposals by the same industry in the same move, the section appears read-only using the first proposal's submitted values.

## 9.1 Actor Rows

The Environment Read contains four actor rows:

```js
'blue'
'red_china'
'green_asia_pacific'
'green_europe'
```

Display labels:

```text
Blue (U.S.)
Red — China
Green — Asia Pacific
Green — Europe
```

## 9.2 Action Code Taxonomy

Each actor may have **multiple action codes**.

Use the same taxonomy for forecasts and observed actions.

Stable values:

```js
'A'
'B'
'C'
'D'
'E'
'F'
'G'
'H'
'I'
'J'
'K'
'L'
'M'
'N'
```

Labels:

```text
A — Sanctions / secondary sanctions
B — Export controls
C — Tariffs
D — Subsidies or incentives
E — Investment screening
F — Procurement / “buy national” rules
G — Trade deal or purchase pledge
H — Diplomatic signal or summit
I — Retaliation
J — Critical-mineral or input restriction
K — Security or military escalation
L — IP enforcement or tech-transfer restriction
M — No significant action
N — Other
```

### Rules

- multi-select;
- if `N — Other` is selected, `otherActionDescription` is required;
- `M — No significant action` cannot be combined with another action code;
- preserve selected codes in stable order A–N.

## 9.3 What They Did / Will Do

Required narrative field per actor:

```js
actionNarrative
```

Label:

```text
What they did / will do
```

This field explains the selected codes in plain language.

## 9.4 Impact on Firm Interests

Required per actor.

Canonical numeric values:

```js
-2
-1
0
1
2
```

Display with semantic labels:

```text
−2 — Major harm
−1 — Harm
 0 — Neutral
+1 — Benefit
+2 — Major benefit
```

Do not display only the numbers.

## 9.5 Confidence

Required per actor.

Stable values:

```js
'low'
'medium'
'high'
```

Labels:

```text
Low
Medium
High
```

## 9.6 Matched My Forecast

Required.

The Industry team makes this judgment manually.

Stable values:

```js
'yes'
'partly'
'no'
```

Labels:

```text
Yes
Partly
No
```

PLENUM may later derive an analytical forecast-accuracy score, but that score must remain separate from the team's self-assessment.

Do not overwrite the team's answer with a system-calculated value.

## 9.7 Biggest Surprise

Required every move.

Field:

```js
biggestSurprise
```

Label:

```text
Biggest surprise this move
```

Multiline narrative.

---

# 10. Page 1 — Step 2: Supply Chain Exposure

## Purpose

Capture current supply-chain exposure for the selected Industry sector.

On the first proposal for the industry in the move:

- previous-move state is shown read-only;
- current state must be confirmed or updated.

On later proposals for the same industry in the same move:

- the current move's state from the first proposal is shown read-only.

## 10.1 Supply-Chain Stages

Always display all five stages:

```js
'raw_inputs'
'refinement_processing'
'manufacturing_production'
'distribution_logistics'
'end_market_customers'
```

Labels:

```text
Inputs / raw materials
Refinement / processing
Manufacturing / production
Distribution / logistics
End market / customers
```

## 10.2 Where / Who

Required for every stage.

Prefer structured actor-region options where possible.

Selectable values:

```js
'blue'
'red'
'green_asia_pacific'
'green_europe'
'other'
```

Labels:

```text
Blue
Red
Green — Asia Pacific
Green — Europe
Other
```

Allow multi-select.

If `Other` is selected, require:

```js
otherLocationDescription
```

Where repository/scenario data provides named countries or suppliers, the UI may offer those as secondary selections beneath the actor-region category.

Do not require free-text country names if a canonical scenario entity exists.

## 10.3 Red Dependencies

Required for every stage.

Stable values:

```js
'low'
'medium'
'high'
```

Display:

```text
Low
Medium
High
```

## 10.4 Planned Actions

Each supply-chain stage may have **multiple planned actions**.

Stable values:

```js
'hold'
'diversify'
'reshore'
'stockpile'
'partner'
'exit'
```

Labels:

```text
Hold
Diversify
Reshore
Stockpile
Partner
Exit
```

At least one required per stage.

## 10.5 Notes

Required per stage.

Field:

```js
notes
```

Multiline or compact textarea.

## 10.6 Weakest Link

Required.

Field:

```js
weakestLink
```

Label:

```text
Weakest link right now
```

## 10.7 Change Since Last Move

Required.

Stable values:

```js
'better'
'same'
'worse'
```

Labels:

```text
Better
Same
Worse
```

---

# 11. Previous-State Display

Where change matters, show the immediately previous value beside the current field.

Example:

```text
Red dependency

Previous move: High

Current:
[ Low ] [ Medium ] [ High ]
```

Do this for:

- supply-chain dependency;
- supply-chain planned action;
- weakest-link context where useful;
- stance;
- carried-forward risks;
- continuing business position.

Also provide:

```text
View history
```

which opens a compact history view for all prior moves.

The historical view is read-only.

---

# 12. Page 2 — Step 3: Decision

## 12.1 Industry

Required.

Exactly one:

```text
Agriculture
Biotechnology
Telecommunications
```

This is selected before or at proposal creation and remains tied to the proposal.

## 12.2 Coordinated With Other Industry Sector

Required.

```js
coordinatedWithOtherSector: true | false
```

Labels:

```text
Yes
No
```

If `Yes`, require one or both of the other sectors.

The current proposal's own industry cannot be selected.

## 12.3 Decision Status

Required.

Stable values:

```js
'new'
'continuing'
'modified'
'abandoned'
```

Labels:

```text
New
Continuing
Modified
Abandoned
```

### Prior-decision linkage

If the status is:

```text
Continuing
Modified
Abandoned
```

the user must select the prior Industry proposal/decision being referenced.

Store:

```js
priorDecisionId
```

PLENUM should present eligible prior decisions rather than requiring the user to type an ID.

## 12.4 Primary Move

Exactly one primary move is required.

Stable values:

```js
'diversify_friendshore_suppliers'
'reshore_production_us'
'stockpile'
'acquire_invest_us_green'
'divest_exit_red_exposed'
'partner_green_nation_firm'
'lobby_blue'
'seek_license_waiver_carveout'
'overcomply_derisk'
'protect_enforce_ip'
'shift_rd_product'
'engage_red_trade_licensing_jv'
'coordinate_other_industry'
'hold_wait'
'other'
```

Display labels:

```text
Diversify / friend-shore suppliers
Reshore production to the U.S.
Stockpile
Acquire / invest in U.S. or Green
Divest / exit Red-exposed assets
Partner with Green nation / firm
Lobby Blue
Seek license / waiver / carve-out
Over-comply / de-risk
Protect / enforce IP
Shift R&D / product
Engage Red through trade / licensing / joint venture
Coordinate with another industry
Hold / wait
Other
```

If `Other`, require free text:

```js
otherPrimaryMove
```

---

# 13. Counterparty

One counterparty category per proposal.

Stable categories:

```js
'blue_agency'
'green_nation_firm'
'red_nation_firm'
'other_industry_sector'
'other'
```

Labels:

```text
Blue agency
Green nation / firm
Red nation / firm
Other Industry sector
Other
```

## Names

Within the selected category, multiple named organizations/actors are allowed.

Store:

```js
counterpartyNames: []
```

At least one name required.

Use canonical scenario entities where available.

If `Other`, require an explanatory name/description.

Mixed categories in the same proposal are not supported.

---

# 14. Capital Commitment

Required.

Stable values:

```js
'low'
'medium'
'high'
```

Labels:

```text
Low
Medium
High
```

---

# 15. Visibility

Required.

Stable values:

```js
'public'
'private'
'confidential_blue'
```

Labels:

```text
Public
Private
Confidential — Blue
```

### Confidential — Blue visibility rule

Visible only to:

```text
Industry
Blue
White Cell
```

It must not be visible to:

```text
Red
Green
unrelated participant roles
```

The visibility rule must be enforced by the platform's authorization/read model, not only by UI hiding.

---

# 16. ASK

Required.

Multi-select.

Stable values:

```js
'subsidy'
'waiver'
'protection'
'intelligence'
'market_access'
'other'
```

Labels:

```text
Subsidy
Waiver
Protection
Intelligence
Market access
Other
```

At least one required.

If `Other`, require:

```js
askOtherDescription
```

---

# 17. OFFER

Required.

Multi-select.

Stable values:

```js
'investment'
'jobs'
'compliance'
'capacity'
'information'
'other'
```

Labels:

```text
Investment
Jobs
Compliance
Capacity
Information
Other
```

At least one required.

If `Other`, require:

```js
offerOtherDescription
```

---

# 18. Stakeholder Value

Required for:

```text
Blue
Counterparty
Other
```

For each stakeholder capture:

```js
gain
giveUpOrRisk
net
```

`gain` and `giveUpOrRisk` are required narratives.

`net` is required with stable values:

```js
'positive'
'neutral'
'negative'
```

Labels:

```text
Positive
Neutral
Negative
```

For `Other`, require stakeholder name.

---

# 19. Intended Effect

Required narrative:

```js
intendedEffect
```

Label:

```text
Intended effect
```

---

# 20. Rationale

Required narrative:

```js
rationale
```

Prompt should explain:

```text
How does this decision serve the industry's objectives?
```

Avoid repeating the label in helper text.

---

# 21. Implementation

Required narrative:

```js
implementation
```

Capture how the team expects to carry out the decision.

---

# 22. Strategic Priority Linkage

The original Industry Strategic Plan is shown as read-only context.

Display:

- original strategic priorities;
- baseline risks;
- baseline stance;
- red line.

The proposal must be tagged to at least one original strategic priority.

Store:

```js
linkedStrategicPriorityIds: []
```

At least one required.

Do not allow the Turn Sheet to edit the Strategic Plan.

The Strategic Plan red line is context only.

Do not add a new red-line breach question.

---

# 23. Page 2 — Step 4: Expected Effects

Expected effects are required across four dimensions.

Dimensions:

```js
'firm_revenue'
'operating_cost'
'us_jobs'
'capacity_supply_security'
```

Labels:

```text
Firm revenue
Operating cost
U.S. jobs
Capacity / supply security
```

Each effect has its own:

- direction;
- magnitude;
- timing;
- pattern.

---

# 24. Effect Direction

Required.

Stable values:

```js
'down'
'unchanged'
'up'
'unknown'
'not_applicable'
```

Labels:

```text
Down
No change
Up
Unknown
Not applicable
```

---

# 25. Effect Magnitude

Required.

Stable values:

```js
'small'
'medium'
'large'
'unknown'
'not_applicable'
```

Labels:

```text
Small
Medium
Large
Unknown
Not applicable
```

If direction is `not_applicable`, magnitude must also be `not_applicable`.

---

# 26. Effect Timing

Required independently for each effect.

Stable values:

```js
'this_quarter'
'q_plus_1'
'q_plus_2'
'q_plus_3'
'q_plus_4_or_later'
'unknown'
'not_applicable'
```

Labels:

```text
This quarter
Q+1
Q+2
Q+3
Q+4 or later
Unknown
Not applicable
```

---

# 27. Effect Pattern

Required independently for each effect.

Stable values:

```js
'one_time'
'ongoing'
'phased'
'unknown'
'not_applicable'
```

Labels:

```text
One-time
Ongoing
Phased
Unknown
Not applicable
```

---

# 28. Escalation Markers

Required.

Multi-select options:

```js
'red_loss_of_face'
'strain_green'
'strain_blue'
'likely_red_retaliation'
'none'
```

Labels:

```text
Loss of face for Red
Strain with Green
Strain with Blue
Likely Red retaliation
None
```

Rules:

- `None` cannot be selected with any other marker;
- at least one selection required.

---

# 29. Escalation Rationale

Required.

Field:

```js
escalationRationale
```

Label:

```text
Escalation rationale
```

Required even if `None` is selected.

The rationale should explain why the team does or does not expect escalation.

---

# 30. Page 3 — Step 5: Engagement

The Turn Sheet does not duplicate communication content.

It links existing PLENUM records.

Only one outbound and one inbound engagement may be linked per proposal.

---

# 31. Outbound Engagement

Required.

The user must either:

- link one eligible outbound record from the current move; or
- explicitly select `No outbound engagement`.

Stable structure:

```js
outboundEngagement: {
  engaged: true | false,
  linkedRecordId: string | null,
  destination: string | null,
  contact: string | null,
  outcome: string
}
```

If `engaged === true`:

- linked record required;
- outcome required.

The system should derive destination/contact from the linked record when available.

---

# 32. Inbound Engagement

Required.

The user must either:

- link one eligible inbound record from the current move; or
- explicitly select `No inbound engagement`.

Stable structure:

```js
inboundEngagement: {
  engaged: true | false,
  linkedRecordId: string | null,
  source: string | null,
  contact: string | null,
  outcome: string
}
```

If `engaged === true`:

- linked record required;
- outcome required.

---

# 33. Partner Check

Required.

Question:

```text
Has the counterparty been consulted?
```

Stable:

```js
partnerCheckComplete: true | false
```

Labels:

```text
Yes
No
```

A `No` answer is valid but must remain visible in the review/handoff summary.

---

# 34. Page 3 — Step 5: Move-Level Risks

Maximum three risks.

At least one risk is required, and the user must explicitly complete the risk section.

Risk taxonomy:

```js
'retaliation'
'secondary_sanctions_exposure'
'supply_disruption'
'ip_theft_forced_tech_transfer'
'regulatory_legal'
'reputational'
'stranded_assets'
'lost_market_access'
'other'
```

Labels:

```text
Retaliation
Secondary-sanctions exposure
Supply disruption
IP theft / forced tech transfer
Regulatory / legal
Reputational
Stranded assets
Lost market access
Other
```

---

# 35. Risk Fields

Each risk requires:

```js
{
  type,
  otherDescription,
  likelihood,
  impact,
  mitigation,
  movementStatus
}
```

Likelihood:

```js
'low'
'medium'
'high'
```

Impact:

```js
'low'
'medium'
'high'
```

Movement status:

```js
'reduced'
'unchanged'
'increased'
'materialized'
'new'
```

Labels:

```text
Reduced
Unchanged
Increased
Materialized
New
```

Carried-forward risks should preserve lineage to the prior risk record.

Store:

```js
priorRiskId
```

where applicable.

If `Other`, require `otherDescription`.

Mitigation is always required.

---

# 36. IP / Security Effect

Required.

Stable values:

```js
'reduces'
'no_change'
'raises'
```

Labels:

```text
Reduces risk
No change
Raises risk
```

---

# 37. Other-Sector Spillover

Required.

This refers to sectors outside:

```text
Agriculture
Biotechnology
Telecommunications
```

Capture:

```js
{
  affectedSector,
  direction,
  explanation
}
```

At least one explicit response required.

Allow:

```text
No material external-sector spillover
```

as a valid explicit selection.

If a sector is specified, direction and explanation are required.

Direction:

```js
'positive'
'neutral'
'negative'
'mixed'
```

---

# 38. Page 3 — Step 6: Strategic Stance

Required.

Canonical numeric values:

```js
1
2
3
4
5
```

Display:

```text
1 — Profit first
2 — Business leaning
3 — Balanced
4 — National-interest leaning
5 — National interest first
```

Show previous move stance read-only beside the selector.

---

# 39. Did Blue Make Serving Both Harder?

Required.

Stable structure:

```js
blueMadeBothHarder: true | false
blueTradeoffExplanation: string
```

Labels:

```text
Yes
No
```

Explanation is always required.

---

# 40. Next-Move Forecast

Forecasts are separate for:

```js
'blue'
'red_china'
'green_asia_pacific'
'green_europe'
```

Each forecast uses the same A–N action-code taxonomy as the Environment Read.

Each forecast requires:

```js
{
  actionCodes: [],
  otherActionDescription,
  explanation
}
```

Action codes are multi-select.

If `N — Other`, free-text description required.

`M — No significant action` cannot be combined with another action code.

Explanation is required.

---

# 41. Position-Change Trigger

Required narrative.

Field:

```js
positionChangeTrigger
```

Label:

```text
What would trigger you to change your position?
```

---

# 42. Carry-Forward Rules

Carry forward from the previous move:

```text
Supply-chain state
Current business position
Ongoing counterparties
Risks
Stance context
```

Start fresh each move:

```text
Environment observations
Current decision
Expected effects
Engagement outcomes
Next-move forecasts
Biggest surprise
```

Carry-forward values must be treated as prior context, not silently copied as new user-confirmed data.

The Scribe must confirm or update carried-forward editable values.

---

# 43. Previous-Move History

Use a hybrid history pattern.

## Inline previous value

Show the immediately previous value beside the current field where comparison helps decision-making.

## Full history

Provide:

```text
View history
```

The history surface should show, where relevant:

```text
Move 1
Move 2
Move 3
...
```

in chronological order.

History is read-only.

---

# 44. Review Proposal Screen

Before forwarding, show a compact structured review.

Recommended order:

```text
Industry / Move
Decision status
Primary move
Counterparty
Visibility
Ask
Offer
Strategic priority alignment

Expected effects
Escalation

Engagement
Partner check

Top risks
Stance

Next-move forecasts
Position-change trigger
```

For the first proposal by an industry in the move, also include summarized:

```text
Environment Read
Supply Chain Exposure
```

For subsequent proposals, show:

```text
Environment and Supply Chain
Using {Industry} Move {N} baseline from Proposal {reference}
```

with a `View` control.

---

# 45. Auto-Generated Facilitator Handoff

The facilitator handoff is generated automatically from proposal data.

Do not ask users to re-enter:

```text
action
counterparty
supply-chain stage
ask
offer
effect
escalation
partner check
```

Recommended summary:

```text
INDUSTRY — {Industry} — MOVE {N}

Decision
{Primary move}

Status
{New / Continuing / Modified / Abandoned}

Counterparty
{Category}: {Names}

Supply-chain focus
{Relevant stage(s)}

Ask
{Selected asks}

Offer
{Selected offers}

Expected effect
{Compact effect summary}

Escalation
{Selected markers}

Partner consulted
{Yes / No}

Strategic priority
{Linked priorities}
```

---

# 46. Facilitator Note

The Facilitator may add:

```js
facilitatorNote
```

This is separate from Industry-authored content.

Requirements:

- optional for Facilitator;
- clearly labeled as Facilitator note;
- does not overwrite Industry rationale;
- included in White Cell view;
- revision history preserves it.

---

# 47. Analytics Requirements

The schema must support future analytics from the beginning.

Use stable IDs and explicit lineage for:

```text
forecast accuracy
stance movement
risk movement
supply-chain exposure change
decision continuity / modification / abandonment
strategic-priority alignment
expected versus adjudicated effect
counterparty patterns
Ask / Offer patterns
coordination across industries
engagement behavior
```

Do not derive lineage from display text.

Persist explicit references.

---

# 48. Required Stable Lineage Fields

At minimum:

```js
proposalId
sessionId
move
industry
proposalOrdinalForIndustryMove
isFirstProposalForIndustryMove

strategicPlanId
linkedStrategicPriorityIds

priorDecisionId
previousMoveProposalId

environmentBaselineProposalId
supplyChainBaselineProposalId

riskIds
priorRiskIds

linkedOutboundEngagementId
linkedInboundEngagementId
```

Use repository naming conventions where existing equivalents already exist.

Do not create duplicate identifiers where PLENUM already has authoritative fields.

---

# 49. Suggested Normalized Data Shape

```js
{
  version: 1,

  industry: 'agriculture',
  move: 2,
  proposalOrdinalForIndustryMove: 1,
  isFirstProposalForIndustryMove: true,

  strategicPlanId: '...',
  linkedStrategicPriorityIds: ['priority-1'],

  environment: {
    actors: [
      {
        actor: 'blue',
        actionCodes: ['C', 'D'],
        otherActionDescription: '',
        actionNarrative: '...',
        interestImpact: 1,
        confidence: 'medium',
        matchedForecast: 'partly'
      }
    ],
    biggestSurprise: '...'
  },

  supplyChain: {
    stages: [
      {
        stage: 'raw_inputs',
        whereWho: ['red', 'green_asia_pacific'],
        otherLocationDescription: '',
        redDependency: 'high',
        plannedActions: ['diversify', 'stockpile'],
        notes: '...'
      }
    ],
    weakestLink: '...',
    changeSinceLastMove: 'worse'
  },

  decision: {
    coordinatedWithOtherSector: true,
    coordinatedSectors: ['biotechnology'],

    status: 'modified',
    priorDecisionId: '...',

    primaryMove: 'diversify_friendshore_suppliers',
    otherPrimaryMove: '',

    counterparty: {
      type: 'green_nation_firm',
      names: ['...']
    },

    capitalCommitment: 'medium',
    visibility: 'private',

    ask: ['market_access'],
    askOtherDescription: '',

    offer: ['investment', 'capacity'],
    offerOtherDescription: '',

    stakeholderValue: {
      blue: {
        gain: '...',
        giveUpOrRisk: '...',
        net: 'positive'
      },
      counterparty: {
        gain: '...',
        giveUpOrRisk: '...',
        net: 'positive'
      },
      other: {
        name: '...',
        gain: '...',
        giveUpOrRisk: '...',
        net: 'neutral'
      }
    },

    intendedEffect: '...',
    rationale: '...',
    implementation: '...'
  },

  expectedEffects: {
    firmRevenue: {
      direction: 'up',
      magnitude: 'medium',
      timing: 'q_plus_2',
      pattern: 'ongoing'
    },
    operatingCost: {
      direction: 'up',
      magnitude: 'small',
      timing: 'this_quarter',
      pattern: 'phased'
    },
    usJobs: {
      direction: 'unknown',
      magnitude: 'unknown',
      timing: 'unknown',
      pattern: 'unknown'
    },
    capacitySupplySecurity: {
      direction: 'up',
      magnitude: 'large',
      timing: 'q_plus_1',
      pattern: 'ongoing'
    },

    escalationMarkers: ['likely_red_retaliation'],
    escalationRationale: '...'
  },

  engagement: {
    outbound: {
      engaged: true,
      linkedRecordId: '...',
      outcome: '...'
    },
    inbound: {
      engaged: false,
      linkedRecordId: null,
      outcome: 'No inbound engagement'
    },
    partnerCheckComplete: true
  },

  risks: [
    {
      id: '...',
      priorRiskId: '...',
      type: 'supply_disruption',
      otherDescription: '',
      likelihood: 'high',
      impact: 'high',
      mitigation: '...',
      movementStatus: 'increased'
    }
  ],

  ipSecurityEffect: 'raises',

  otherSectorSpillover: {
    affectedSector: 'semiconductors',
    direction: 'negative',
    explanation: '...'
  },

  position: {
    stance: 3,
    blueMadeBothHarder: true,
    blueTradeoffExplanation: '...'
  },

  nextMoveForecast: {
    blue: {
      actionCodes: ['D'],
      otherActionDescription: '',
      explanation: '...'
    },
    redChina: {
      actionCodes: ['I'],
      otherActionDescription: '',
      explanation: '...'
    },
    greenAsiaPacific: {
      actionCodes: ['G'],
      otherActionDescription: '',
      explanation: '...'
    },
    greenEurope: {
      actionCodes: ['H'],
      otherActionDescription: '',
      explanation: '...'
    }
  },

  positionChangeTrigger: '...',

  facilitatorNote: ''
}
```

---

# 50. Validation Summary

Before forwarding, validate:

## Always required

```text
Industry
Coordination yes/no
Decision status
Prior decision if Continuing / Modified / Abandoned
Primary move
Counterparty category
At least one counterparty name
Capital commitment
Visibility
At least one Ask
At least one Offer
Stakeholder value for Blue
Stakeholder value for counterparty
Stakeholder value for Other
Intended effect
Rationale
Implementation
At least one strategic-priority link

All four expected-effect records
Escalation selection
Escalation rationale

Outbound engagement explicit state
Inbound engagement explicit state
Partner check

Risk section
IP/security effect
Other-sector spillover response

Stance
Blue tradeoff yes/no
Blue tradeoff explanation

All four next-move forecasts
Position-change trigger
```

## First proposal for industry in move only

Also require:

```text
Environment Read for all four actors
Biggest surprise
All five supply-chain stages
Weakest link
Change since last move
```

## Conditional-but-required

```text
Other action-code description if N selected
Other location description if Other selected
Other primary move description if Other selected
Other Ask description if Other selected
Other Offer description if Other selected
Other risk description if Other selected
Prior-decision link for Continuing / Modified / Abandoned
Engagement link + outcome if engagement exists
```

---

# 51. First-Proposal Detection

The platform must reliably determine whether an Industry proposal is the first for:

```text
session + move + industry
```

Do not infer this from modal order or client-local counters.

A returned revision remains the same logical proposal and must not be counted as a new proposal.

---

# 52. Subsequent Proposal Page 1 Behavior

For a second or later proposal by the same industry in the move:

Page 1 remains visible for context.

Show:

```text
Environment
Using the {Industry} Move {N} environment read from Proposal {reference}

[View details]

Supply Chain
Using the {Industry} Move {N} supply-chain assessment from Proposal {reference}

[View details]
```

Do not duplicate the editable controls.

The `View details` disclosure is the complete bounded baseline view. It must
show all four Environment actor rows, including codes, narrative, firm-interest
impact, confidence, and forecast match; Biggest Surprise; all five Supply Chain
stages, including Where / Who, Red dependency, planned actions, and notes; plus
Weakest Link and Change Since Last Move. The disclosure is read-only and names
the referenced move and proposal number.

Do not allow the second proposal to silently alter the baseline established by the first proposal.

---

# 53. Data Integrity Rules

1. Never overwrite previous-move forecasts with observed actions.
2. Never overwrite previous revisions.
3. Never treat facilitator notes as Industry-authored content.
4. Never duplicate linked communications inside Turn Sheet text.
5. Never infer decision lineage from matching text.
6. Never infer risk lineage from risk names alone when explicit IDs exist.
7. Never use display labels as authoritative enum values.
8. Never use color alone to represent team, status, severity, or direction.
9. Never expose backend enum names directly to users.
10. Never create a second proposal object for the same completed Turn Sheet.

---

# 54. User-Facing Terminology

Use:

```text
Industry Proposal
```

as the PLENUM artifact term.

Within the modal, section labels can reflect the Turn Sheet structure without repeatedly saying “Turn Sheet.”

Recommended visible terminology:

```text
Environment
Supply Chain
Decision
Expected Effects
Engagement & Risk
Position & Forecast
Review Proposal
Forward to Facilitator
Submit to White Cell
Return for Revision
Resubmit to White Cell
Complete
```

These workflow verbs must align with PLENUM's canonical vocabulary.

---

# 55. Color Semantics

Industry identity, workflow state, and alert severity are separate semantic systems.

Do not make Green team identity indistinguishable from Success.

Do not make Red team identity indistinguishable from Error / Critical.

Every state must use a non-color cue such as:

- text label;
- icon/symbol;
- border/pattern treatment;
- position.

Follow PLENUM's design standards and token system.

---

# 56. Notification and Toast Rules

The proposal workflow may use toasts for immediate feedback, but no important state may exist only in a toast.

Examples of useful transient feedback:

```text
Proposal forwarded to Facilitator
Proposal submitted to White Cell
Proposal resubmitted to White Cell
Draft saved
```

Examples of durable state that must also remain visible:

```text
Returned for revision
White Cell review notes
Submission status
Failed submission requiring retry
```

Do not expose backend errors or raw technical exceptions in user-facing toasts.

---

# 57. Review / Analytics Separation

The Turn Sheet records:

```text
what Industry believed
what Industry decided
what Industry expected
```

White Cell adjudication records:

```text
what the simulation determined
```

Analytics may later compare:

```text
forecast vs observation
expected effect vs adjudicated effect
stance over time
risk over time
supply-chain exposure over time
decision continuation / modification
```

Never overwrite the original Industry record with derived analytical outputs.

---

# 58. Out of Scope

This specification does not define:

- White Cell adjudication mechanics;
- automatic economic modeling;
- automated forecast scoring methodology;
- scenario consequence engine rules;
- proposal-recipient negotiation threads beyond linking them;
- Strategic Plan editing;
- visual redesign outside this modal and its review/projection surfaces.

---

# 59. Definition of Done

The Industry Turn Sheet / Proposal implementation is complete when:

- [ ] One Industry cell supports Agriculture, Biotechnology, and Telecommunications.
- [ ] Each proposal belongs to exactly one industry.
- [ ] Multiple proposals per industry per move are supported.
- [ ] Only the first proposal per industry per move has editable Environment and Supply Chain sections.
- [ ] Later proposals display those sections read-only for context.
- [ ] The modal uses three pages with two steps per page.
- [ ] Every applicable field is required.
- [ ] Environment actors support multiple A–N action codes.
- [ ] Team-selected `Yes / Partly / No` forecast matching is preserved separately from future analytics.
- [ ] Supply-chain state carries forward with previous values visible.
- [ ] Supply-chain stages support multiple planned actions.
- [ ] Continuing / Modified / Abandoned decisions link to a prior decision.
- [ ] One counterparty category with multiple named counterparties is supported.
- [ ] Confidential Blue is limited to Industry, Blue, and White Cell.
- [ ] Ask and Offer retain provided options and support Other descriptions.
- [ ] Expected effects each have their own direction, magnitude, timing, and pattern.
- [ ] Escalation supports multi-select and required rationale.
- [ ] Engagement links existing PLENUM records instead of duplicating them.
- [ ] One inbound and one outbound engagement are supported.
- [ ] Partner check is explicit Yes/No.
- [ ] Up to three move-level risks are supported with movement status.
- [ ] Previous-move values and full history are available.
- [ ] Next-move forecasts are separate for Blue, Red, Green Asia Pacific, and Green Europe.
- [ ] Forecasts use the A–N taxonomy plus required explanation.
- [ ] Facilitator handoff is auto-generated.
- [ ] Facilitator may add a separate note.
- [ ] Original Strategic Plan priorities, risks, stance, and red line appear as read-only context.
- [ ] Proposals link to one or more Strategic Plan priorities.
- [ ] Submitted proposals lock and use the existing return/revision workflow.
- [ ] Stable IDs and explicit lineage support future analytics.
- [ ] No duplicate Proposal artifact is created after the Turn Sheet is completed.
