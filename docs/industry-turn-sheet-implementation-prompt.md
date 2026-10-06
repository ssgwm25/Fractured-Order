# IMPLEMENTATION PROMPT — INDUSTRY PROPOSAL MODAL FOR PLENUM

## Role

Act as a senior product engineer, interaction designer, data-modeling engineer, and simulation-platform architect working on the PLENUM / Fractured Order codebase.

Repository:

```text
ssgwm25/Fractured-Order
```

Your task is to implement the new **Industry Proposal modal** for the Industry cell.

This is a substantial feature change, but it must be implemented as a **bounded evolution of the existing Industry proposal workflow**, not as a parallel application or a replacement of the shared proposal architecture.

The primary product objective is:

> Replace the current simple Industry proposal form with a structured, three-page Industry Turn Sheet that is itself the Industry Proposal artifact, preserves the existing Scribe → Facilitator → White Cell lifecycle, supports revisions and longitudinal analytics, and does not destabilize Green proposals, other teams, or unrelated PLENUM workflows.

---

# 1. READ THESE DOCUMENTS FIRST

Before changing code, read these files in full:

```text
INDUSTRY_TURN_SHEET_SPEC.md
DESIGN_STANDARDS.md
WRITING_STANDARDS.md
```

If present, also read:

```text
PLENUM_INTERFACE_AUDIT.md
```

and apply any relevant findings to the Industry proposal surfaces.

## Precedence

Use this order when resolving conflicts:

1. `INDUSTRY_TURN_SHEET_SPEC.md` — authoritative functional and data requirements for the Industry Turn Sheet.
2. `DESIGN_STANDARDS.md` — authoritative interaction, hierarchy, accessibility, component, color, and visual-semantic requirements.
3. `WRITING_STANDARDS.md` — authoritative user-facing copy and terminology requirements.
4. Existing PLENUM backend/workflow contracts — preserve unless the Turn Sheet cannot be represented correctly without a bounded compatibility change.
5. Existing Industry proposal UI — implementation history only; it is NOT the new product specification.

Do not silently drop a field or change a product rule because the current code does not support it.

If the specification and current architecture genuinely conflict, make the smallest safe architectural change and document it.

---

# 2. DO NOT START CODING UNTIL YOU TRACE THE CURRENT IMPLEMENTATION

Trace the current `main` branch end-to-end.

At minimum inspect:

```text
teams/industry/facilitator.html
src/roles/facilitator.js
src/features/actions/proposalDetails.js
src/features/actions/proposalRecipientState.js
src/services/database.js
src/roles/scribe.js
src/roles/whitecell.js
src/stores/actions.js
src/stores/communications.js
src/stores/timeline.js
src/core/enums.js
```

Inspect relevant tests:

```text
src/features/actions/proposalDetails.test.js
src/roles/facilitator.test.js
src/roles/scribe.test.js
src/roles/whitecell.test.js
src/services/database.action-write.test.js
src/services/database.actions.test.js
```

Inspect all current SQL/migrations affecting:

```text
actions
artifact_type = proposal
proposal_recipient_team
workflow_state
artifact_payload
artifact_workflow_reviews
operator_review_artifact
operator_review_proposal
Industry action permissions
proposal recipient state
```

Do NOT assume an older migration is still the final database contract. Search all later migrations before adding a new one.

---

# 3. CURRENT CODE PATH TO VERIFY

The current Industry proposal flow is already specialized at the form-entry point.

Verify the current chain approximately follows:

```text
teams/industry/facilitator.html
    #newActionBtn
        ↓
FacilitatorController.showCreateActionModal()
        ↓
showGreenProposalModal()
        ↓
teamId === 'industry'
        ↓
createIndustryProposalContent()
        ↓
createProposalContent(... proposalKind: 'industry')
        ↓
bindGreenProposalModal()
        ↓
getGreenProposalData()
        ↓
validateGreenProposal()
        ↓
buildGreenProposalPayload()
        ↓
saveGreenProposalDraft()
    OR
forwardGreenProposalToFacilitator()
        ↓
database.createAction() / updateDraftAction()
        ↓
Facilitator presentation in src/roles/scribe.js
        ↓
submitScribeProposal()
        ↓
White Cell proposal queue/review
```

Confirm the exact current path before modifying it.

The implementation must preserve the general artifact lifecycle while replacing the Industry-specific data entry experience.

---

# 4. CURRENT INDUSTRY FORM IS TO BE REPLACED, NOT EXTENDED WITH MORE FIELDS

The current Industry proposal UI uses a relatively simple form with concepts such as:

```text
Proposal Title
Industry of Focus
Country of Focus
Proposed Activity
intended partners
focus sectors
supply-chain focus
timing and conditions
expected outcomes
```

Do NOT simply append the Turn Sheet fields below this existing form.

That would create an extremely long, repetitive and semantically inconsistent modal.

For NEW Industry Turn Sheet proposals, the three-page Turn Sheet defined in `INDUSTRY_TURN_SHEET_SPEC.md` becomes the Industry proposal authoring interface.

Green proposals retain their existing interface and behavior.

Legacy Industry proposals must remain readable.

---

# 5. FUNDAMENTAL DOMAIN RULE

The Industry Turn Sheet is the Industry Proposal.

Do NOT create:

```text
Turn Sheet artifact
+
Proposal artifact
```

for the same decision.

The authoritative flow is:

```text
Industry Scribe
    ↓
Industry Proposal / Turn Sheet
    ↓
Facilitator review + optional edit
    ↓
White Cell
    ↓
Complete OR Return for Revision
```

The proposal action row remains the logical artifact through every revision.

---

# 6. INDUSTRY STRUCTURE

There is one Industry cell containing three represented industries:

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

Each Industry proposal belongs to exactly one of these industries.

Do not create three separate PLENUM teams.

Do not use `delegation_id` to represent these industries unless the existing architecture explicitly defines that use. They are sub-domains within the single Industry team.

---

# 7. PROPOSAL FREQUENCY AND FIRST-PROPOSAL RULE

The Industry cell may create multiple proposals per industry per move.

For each unique:

```text
session + move + industry
```

only the **first logical proposal** owns editable:

```text
Environment Read
Supply Chain Exposure
```

Example:

```text
Move 2 — Agriculture Proposal 1
Environment: editable
Supply Chain: editable
Decision onward: editable

Move 2 — Agriculture Proposal 2
Environment: read-only reference to Agriculture Proposal 1
Supply Chain: read-only reference to Agriculture Proposal 1
Decision onward: editable

Move 2 — Biotechnology Proposal 1
Environment: editable
Supply Chain: editable
Decision onward: editable
```

A returned revision is still the same logical proposal and must not increment the proposal ordinal or become a new “first proposal.”

---

# 8. FIRST-PROPOSAL DETECTION MUST USE PERSISTED DATA

Do not determine first-proposal status from:

```text
modal open count
local arrays only
client-only counters
DOM state
```

Use persisted Industry proposal records for the same session/move/industry.

Implement a reusable helper/service returning at least:

```js
{
  industry,
  move,
  proposalOrdinalForIndustryMove,
  isFirstProposalForIndustryMove,
  baselineProposalId,
  previousMoveProposalId,
  previousMoveBaselineProposalId
}
```

Use existing repository patterns for fetching actions and filtering logical/revision state.

If client-side persisted-data lookup cannot reliably guarantee this rule under the existing architecture, introduce the smallest server-side helper/RPC required rather than inventing a parallel persistence model.

Do not create a new table merely for proposal ordinals unless there is no safe alternative.

---

# 9. PREVIOUS-MOVE SOURCE RULES

Use deterministic carry-forward sources.

For **Environment/Supply Chain baseline context**:

- current move source = the first proposal for the same industry in the current move;
- previous move source = the first proposal for the same industry in the immediately previous move.

For **stance, current business position, risks and ongoing counterparties**:

- use the most recent valid logical Industry Turn Sheet proposal for the same industry in the immediately previous move;
- prefer latest completed/submitted logical proposal by proposal ordinal/revision state;
- do not infer chronology from title text.

If the repository already has a stronger canonical sequencing rule, use it and document the choice.

---

# 10. CREATE A BOUNDED DOMAIN MODULE

Prefer adding:

```text
src/features/actions/industryTurnSheet.js
src/features/actions/industryTurnSheet.test.js
```

This module should own domain constants and pure logic such as:

```js
INDUSTRY_TURN_SHEET_VERSION
INDUSTRY_SECTORS
INDUSTRY_ACTION_CODES
INDUSTRY_ENVIRONMENT_ACTORS
INDUSTRY_SUPPLY_CHAIN_STAGES
INDUSTRY_SUPPLY_CHAIN_ACTIONS
INDUSTRY_DECISION_STATUSES
INDUSTRY_PRIMARY_MOVES
INDUSTRY_COUNTERPARTY_TYPES
INDUSTRY_ASK_OPTIONS
INDUSTRY_OFFER_OPTIONS
INDUSTRY_EFFECT_DIMENSIONS
INDUSTRY_ESCALATION_MARKERS
INDUSTRY_RISK_TYPES
INDUSTRY_RISK_MOVEMENT_STATUSES
INDUSTRY_STANCE_OPTIONS

normalizeIndustryTurnSheet()
validateIndustryTurnSheet()
getIndustryTurnSheetDisplayModel()
getIndustryTurnSheetSummary()
```

The domain module should not depend on:

```text
DOM
Supabase
Modal.js
role controllers
```

Normalization and validation must not mutate input objects.

---

# 11. KEEP THE LARGE ROLE CONTROLLERS BOUNDED

`src/roles/facilitator.js` is already large.

Do not put the entire three-page form renderer, all option data, all validation rules, and all display formatting directly into that file.

Prefer a bounded UI helper such as:

```text
src/features/actions/industryTurnSheetForm.js
```

if this matches repository conventions.

The form helper may own:

```text
three-page DOM creation
page navigation
field binding
form-state extraction
conditional field rendering
inline validation rendering
review-page rendering
read-only baseline rendering
```

Keep database/stores/workflow mutations in the role/service layers.

---

# 12. PROPOSAL ENVELOPE AND BACKWARD COMPATIBILITY

Read `src/features/actions/proposalDetails.js` carefully.

Existing proposals use the line-oriented compatibility envelope beginning:

```text
Proposal Details
```

Preserve this prefix so new Industry Turn Sheets remain proposal artifacts.

Do NOT introduce a new `artifact_type`.

Add an optional Industry-specific sub-contract to the existing proposal envelope, for example:

```text
Proposal Details
...
Industry Turn Sheet Version: 1
Industry Turn Sheet: {single-line JSON}
Scribe Handoff: Forwarded
```

Use a single-line JSON value.

Do not pretty-print JSON inside the line-oriented envelope.

Do not force a global proposal contract rewrite merely to support the new Industry data model.

---

# 13. PARSER REQUIREMENTS

Extend `parseProposalDetails()` so it can:

1. read every existing Green proposal;
2. read every existing legacy Industry proposal;
3. parse a new optional Industry Turn Sheet version;
4. parse the nested Industry Turn Sheet data;
5. tolerate the Turn Sheet fields being absent;
6. tolerate incomplete Turn Sheet data for saved drafts;
7. fail safely if the optional Turn Sheet JSON is malformed without making unrelated legacy proposal data unreadable;
8. preserve all existing proposal revision and Scribe-handoff behavior.

Expose through the proposal details/view model something equivalent to:

```js
industryTurnSheetVersion
industryTurnSheet
hasIndustryTurnSheet
isLegacyIndustryProposal
```

Do not treat every `team === 'industry'` proposal as a new Turn Sheet because historical Industry proposals already exist.

---

# 14. GETPROPOSALVIEWMODEL MUST BECOME THE DISPLAY BOUNDARY

Extend `getProposalViewModel()` so callers do not independently parse Turn Sheet JSON.

For a new Industry Turn Sheet expose normalized properties including:

```js
hasIndustryTurnSheet
industryTurnSheet
industry
proposalOrdinalForIndustryMove
isFirstProposalForIndustryMove
counterparty
linkedStrategicPriorityIds
facilitatorNote
```

Also expose a shared structured display model.

Use that same display model for:

```text
Industry artifact cards
Facilitator presentation/review
White Cell queue
White Cell review modal
returned revision history
history drawer
```

Do not duplicate formatting logic across roles.

---

# 15. IMPORTANT CURRENT BACKEND CONFLICT — PROPOSAL RECIPIENT IS NOT COUNTERPARTY

The current repository has a legacy proposal-recipient model.

At current HEAD, verify that:

```js
PROPOSAL_RECIPIENT_TEAMS
```

is limited to:

```js
['blue', 'red']
```

and that the database currently constrains:

```text
artifact_type = proposal
→ proposal_recipient_team must be blue or red
```

The new Industry Turn Sheet specification defines a **counterparty**, not the same concept as the legacy proposal recipient.

Counterparty categories are:

```text
Blue agency
Green nation / firm
Red nation / firm
Other Industry sector
Other
```

One category is selected, with multiple named counterparties permitted within that category.

### DO NOT

Do not fake this by:

- storing Green counterparties as `blue` or `red` recipients;
- stuffing counterparties into `recipientTeams` merely to satisfy the old constraint;
- expanding the global Green proposal recipient workflow without a product reason;
- changing Green proposal semantics.

### Required compatibility approach

For NEW Industry Turn Sheet proposals:

- store the Turn Sheet counterparty inside the nested Turn Sheet contract;
- legacy `recipientTeams` may be empty;
- `proposal_recipient_team` may therefore be null;
- Green proposals and legacy recipient-driven proposals keep their current Blue/Red recipient behavior.

If the current database constraint prevents this, add a NEW bounded migration allowing `proposal_recipient_team IS NULL` specifically for valid new Industry Turn Sheet proposal rows while preserving the old requirement for Green and legacy recipient-driven proposals.

Do not edit old migration files in place.

Add a new dated migration.

The migration must be covered by SQL/unit tests.

---

# 16. WHITE CELL REVIEW SEMANTICS FOR THE NEW INDUSTRY TURN SHEET

Do not route new Industry Turn Sheets through the legacy “approve recipient and forward to Blue/Red” review path.

The required new Industry Turn Sheet White Cell outcomes are:

```text
Complete
Return for Revision
```

The repository already has a generic team-neutral artifact review path.

Verify current `operator_review_artifact` semantics.

At current HEAD it should support proposal rows owned by Green/Industry through artifact kind `action` and should support:

```text
complete
return_to_team
```

Reuse that path if still valid.

### Desired routing

Conceptually:

```js
if (proposalViewModel.hasIndustryTurnSheet) {
    // use generic complete / return artifact review
} else {
    // preserve existing recipient-driven Green/legacy proposal review
}
```

Do not modify Green White Cell proposal behavior.

Do not create a new review RPC if the generic artifact review already satisfies the requirement.

---

# 17. THREE-PAGE MODAL

Implement exactly three form pages plus a review screen.

## Page 1

```text
Environment
Supply Chain
```

## Page 2

```text
Decision
Expected Effects
```

## Page 3

```text
Engagement & Risk
Position & Forecast
```

## Final screen

```text
Review Proposal
```

The final Review screen is not “Page 4.”

Use the existing modal infrastructure.

Do not build a separate modal framework.

---

# 18. MODAL HEADER AND COPY

Use concise context.

Recommended pattern:

```text
Industry Proposal · Move {N}
{Industry Name}

Page {X} of 3
```

Do not repeatedly render:

```text
Industry Turn Sheet
Turn Sheet Details
Industry Proposal Details
Proposal Turn Sheet
```

inside the same modal.

Follow `WRITING_STANDARDS.md`:

- one concept = one term;
- one workflow transition = one verb;
- helper text must add information, not repeat labels;
- backend terminology must not leak into user copy.

---

# 19. FORM NAVIGATION

The form must support:

```text
Previous
Next
Save Draft
Review Proposal
Forward to Facilitator
Cancel / Close
```

Use canonical labels consistent with PLENUM.

## Save Draft

Saving a draft MAY persist an incomplete Turn Sheet.

Do not require full proposal validation to save a draft.

Validate only structural integrity needed to serialize safely.

## Next

Use page-scoped validation sufficient to prevent obviously incomplete sections from being accidentally skipped, but do not destroy entered data if the user navigates backward.

## Forward to Facilitator

Full applicable validation is mandatory.

Every applicable field defined as required in `INDUSTRY_TURN_SHEET_SPEC.md` must pass.

---

# 20. STATE MUST SURVIVE PAGE NAVIGATION

Use one canonical in-memory Turn Sheet state object for all pages.

Do not use DOM text as the source of truth.

Navigating:

```text
Page 1 → Page 2 → Page 1
```

must preserve values.

Saving/reopening must hydrate the same normalized model.

Returned revisions must hydrate the saved revision exactly.

---

# 21. PAGE 1 — FIRST PROPOSAL BEHAVIOR

If the proposal is the first for the selected industry in the move:

```text
Environment = editable
Supply Chain = editable
```

All fields required before forwarding.

Use the exact taxonomies and validation rules from `INDUSTRY_TURN_SHEET_SPEC.md`.

Do not improvise alternate options.

---

# 22. PAGE 1 — SUBSEQUENT PROPOSAL BEHAVIOR

If another proposal already owns the current industry/move baseline:

Page 1 remains visible but read-only.

Show concise context such as:

```text
Environment
Using the Agriculture Move 2 environment read from Proposal 1
[View details]

Supply Chain
Using the Agriculture Move 2 supply-chain assessment from Proposal 1
[View details]
```

Do not duplicate editable controls.

Do not allow later proposals to silently change the move baseline.

Persist explicit references:

```js
environmentBaselineProposalId
supplyChainBaselineProposalId
```

---

# 23. ENVIRONMENT ACTION CODES

Use one A–N taxonomy everywhere the specification requires action codes.

Each actor supports multiple codes.

Enforce:

- `N — Other` requires description;
- `M — No significant action` is mutually exclusive with all other codes;
- stable order A–N;
- same taxonomy reused for next-move forecasts.

Do not define duplicate arrays in multiple UI files.

The domain module is authoritative.

---

# 24. IMPACT ON FIRM INTERESTS

Persist numeric values:

```js
-2, -1, 0, 1, 2
```

Display semantic labels:

```text
−2 — Major harm
−1 — Harm
0 — Neutral
+1 — Benefit
+2 — Major benefit
```

Do not expose bare numeric values without explanation.

---

# 25. FORECAST MATCH SELF-ASSESSMENT

The Industry team selects:

```text
Yes
Partly
No
```

This is a participant judgment.

Future analytical forecast scoring must be stored/derived separately.

Never overwrite the participant answer with a calculated value.

---

# 26. SUPPLY CHAIN

Always preserve the five canonical stages from the specification.

For each stage support:

```text
Where / who — multi-select
Red dependency — one value
Planned actions — multi-select
Notes — required
```

`Where / who` should prefer canonical scenario actors/entities.

If named scenario countries/suppliers are available, provide them through existing scenario data rather than hardcoding duplicates.

`Other` requires description.

Carry previous-move state as read-only context beside current controls.

---

# 27. DECISION LINEAGE

Decision statuses:

```text
New
Continuing
Modified
Abandoned
```

For:

```text
Continuing
Modified
Abandoned
```

require selection of an eligible prior Industry Turn Sheet proposal/decision.

Store the actual ID:

```js
priorDecisionId
```

Eligible prior decisions must:

- belong to the same session;
- belong to Industry;
- belong to the same represented industry;
- precede the current logical proposal;
- not be deleted;
- not be the current record.

Do not infer decision lineage from matching titles or text.

---

# 28. COUNTERPARTY

Exactly one counterparty category per proposal.

Allow multiple named organizations/actors within that category.

Use canonical scenario entities when available.

Counterparty is analytical/decision data.

Do not automatically treat it as the platform message recipient.

Do not automatically create communications from the counterparty field.

Engagement records are linked separately.

---

# 29. CONFIDENTIAL — BLUE IS A SECURITY REQUIREMENT

Visibility values include:

```text
Public
Private
Confidential — Blue
```

For `Confidential — Blue`, the specification requires visibility only to:

```text
Industry
Blue
White Cell
```

and not to:

```text
Red
Green
unrelated participant roles
```

This must NOT be implemented as CSS hiding or client filtering alone.

Trace the latest server-side read/RLS model for actions/proposals.

If the current authorization model cannot enforce this exact visibility safely, add the smallest server-side policy/read-path change required.

Add tests proving:

```text
Industry can read
Blue can read
White Cell can read
Red cannot read
Green cannot read
```

for Confidential — Blue proposals.

Do not weaken global action read permissions accidentally.

If current development schema still contains permissive legacy policies, follow the latest live-demo security migrations rather than the bootstrap schema alone.

---

# 30. ASK / OFFER

Use the exact provided option sets from the specification.

Both are multi-select and required.

`Other` adds a required description.

Do not replace structured options with a single textarea.

Do not create additional categories unless the specification is changed.

---

# 31. EXPECTED EFFECTS

All four effects are required:

```text
Firm revenue
Operating cost
U.S. jobs
Capacity / supply security
```

Each effect independently captures:

```text
Direction
Magnitude
Timing
Pattern
```

Do not use one timing/pattern for the entire proposal.

Support explicit:

```text
Unknown
Not applicable
```

according to the specification.

Apply cross-field consistency rules, including `Not applicable` consistency.

---

# 32. ESCALATION

Escalation markers are multi-select.

`None` is mutually exclusive with other markers.

Escalation rationale is always required.

Use the label:

```text
Escalation rationale
```

not “basis.”

---

# 33. ENGAGEMENT LINKING

Do not duplicate communication content inside the Turn Sheet.

For outbound and inbound engagement:

- query eligible existing PLENUM records;
- allow one outbound link;
- allow one inbound link;
- allow explicit “No outbound engagement” / “No inbound engagement” states;
- derive source/destination/contact metadata from the linked record when available;
- require the Industry interpretation/outcome.

Validate that linked records belong to:

```text
same session
appropriate current move/context
correct direction relative to Industry
```

Do not allow arbitrary IDs to be typed.

Persist the authoritative linked record IDs.

---

# 34. PARTNER CHECK

Required question:

```text
Has the counterparty been consulted?
```

Options:

```text
Yes
No
```

A `No` answer is valid.

Do not block forwarding solely because Partner Check = No.

It must remain visible on the review screen and Facilitator handoff.

---

# 35. RISKS

Allow up to three risks.

Follow the exact taxonomy in the specification.

Each risk includes:

```text
Type
Likelihood
Impact
Mitigation
Movement status
```

For carried-forward risks preserve explicit lineage:

```js
priorRiskId
```

Movement statuses:

```text
Reduced
Unchanged
Increased
Materialized
New
```

Do not determine movement merely by comparing risk names.

---

# 36. STRATEGIC PLAN CONTEXT

Retrieve the Industry Strategic Plan for the session and expose read-only context:

```text
Strategic priorities
Baseline risks
Baseline stance
Red line
```

The proposal must link to at least one strategic priority.

Persist:

```js
strategicPlanId
linkedStrategicPriorityIds
```

Do not duplicate editable Strategic Plan fields inside the Turn Sheet.

Do not allow the Turn Sheet to modify the Strategic Plan.

The red line is context only.

---

# 37. STANCE AND HISTORY

Use the 1–5 stance semantics from the specification.

Show the immediately previous move value beside the current control.

Provide a `View history` surface for the full chronological sequence.

History must be read-only.

Do not flood the default form with all past values.

---

# 38. NEXT-MOVE FORECAST

Forecast separately for:

```text
Blue
Red — China
Green — Asia Pacific
Green — Europe
```

Each uses the same A–N action code taxonomy plus required explanation.

Do not combine Red and Green into one field.

Preserve the forecast exactly as entered so later observation/analytics can compare against it.

---

# 39. REVIEW PROPOSAL SCREEN

After Page 3, generate a concise structured review.

Do not make users re-enter information.

For first proposals, include summarized Environment and Supply Chain.

For later proposals, display baseline references instead of duplicating the full sections by default.

The Review screen must make clear:

```text
industry
move
proposal status
primary move
counterparty
visibility
Ask
Offer
strategic priority alignment
expected effects
escalation
engagement
partner check
risks
stance
next-move forecasts
position-change trigger
```

Use progressive disclosure for detailed tables.

---

# 40. FACILITATOR HANDOFF IS AUTO-GENERATED

Do not ask the Scribe to manually retype a handoff summary.

Generate it from the Turn Sheet data.

Include the fields defined in the specification.

The Facilitator may add a separate optional note.

---

# 41. FACILITATOR NOTE

The Facilitator note is not Industry-authored content.

Requirements:

- only Facilitator-authorized UI can edit it;
- Scribe sees it only if product permissions allow, but cannot edit it;
- White Cell sees it;
- revision history preserves it;
- it must not overwrite Industry rationale or implementation text;
- display it explicitly as `Facilitator note`.

Store it in the Turn Sheet/proposal structured contract or another existing proposal metadata location that survives revisions without creating a second artifact.

---

# 42. FACILITATOR PRESENTATION

Update `src/roles/scribe.js` only as necessary to render the Industry Turn Sheet correctly.

For new Industry Turn Sheets, do NOT use the generic current proposal presentation such as:

```text
Objective
Full proposal details
Expected Outcome(s) & Duration Assessment
```

when that hierarchy no longer matches the artifact.

Render a structured Industry Proposal presentation based on the shared display model.

Keep projection usable in a room:

- concise top-level decision summary;
- expandable/detail sections where appropriate;
- clear White Cell return notes;
- revision number where useful;
- Facilitator submission controls.

Do not expose internal IDs in the default presentation.

---

# 43. FACILITATOR SUBMISSION

Preserve the current authority boundary:

```text
Scribe authors/forwards
Facilitator reviews/edits/submits
```

The Facilitator should be able to edit the forwarded Turn Sheet before White Cell submission.

Submission must:

- preserve the same action/proposal ID;
- preserve nested Turn Sheet data;
- lock Scribe/Facilitator editing while under White Cell review;
- create the existing proposal submission/timeline evidence appropriate to the workflow;
- not create a second proposal.

---

# 44. WHITE CELL DISPLAY

New Industry Turn Sheets must remain in the White Cell proposal queue.

Use a specialized display path for:

```js
proposalViewModel.hasIndustryTurnSheet === true
```

White Cell must be able to inspect every substantive Turn Sheet section.

Do not reduce White Cell display to a title/summary only.

Use the shared structured display model so Facilitator and White Cell cannot drift.

---

# 45. WHITE CELL REVIEW CONTROLS

For NEW Industry Turn Sheets show:

```text
Return for Revision
Complete
```

Reviewer notes:

- required when returning;
- optional when completing unless current PLENUM review rules require more.

Do not show Blue/Red recipient approval controls for the new Industry Turn Sheet.

Do not run `operator_review_proposal` recipient-forward behavior for this artifact.

Use the generic team-neutral artifact review path if supported at current HEAD.

---

# 46. RETURN / REVISION / RESUBMISSION

Preserve the current logical proposal ID.

On return:

```text
workflow → returned_to_team
revision increments according to existing server contract
White Cell notes remain visible
```

The Scribe edits the returned revision.

The Scribe forwards it to the Facilitator.

The Facilitator may edit and resubmit.

Prior revisions remain immutable in review history.

Do not count returned revisions as additional industry/move proposals.

---

# 47. LEGACY INDUSTRY PROPOSALS

Do not break existing Industry proposal artifacts created before this feature.

Legacy Industry proposals should:

- parse;
- render;
- retain existing recipient behavior;
- retain existing revision history;
- not be silently converted into Turn Sheets;
- not be forced through new required-field validation unless the user explicitly migrates/recreates them.

New Turn Sheet behavior must be gated by the nested Turn Sheet contract, not simply `team === 'industry'`.

---

# 48. GREEN PROPOSALS ARE A REGRESSION BOUNDARY

Do not change Green proposal semantics.

Specifically preserve:

```text
Green originators
Blue/Red recipient teams
regional proposal RPC behavior
recipient approvals
proposal recipient thread behavior
regional delegation handling
shared Green facilitator behavior
GC05 tests
```

Any shared refactor must prove Green behavior remains unchanged.

---

# 49. DATABASE WRITE BOUNDARY

The new Turn Sheet should still resolve as:

```text
mechanism = Proposal
artifact_type = proposal
team = industry
```

The structured data should land naturally under the existing proposal payload, conceptually:

```js
artifact_payload: {
  proposal: {
    ...legacyProposalFields,
    industryTurnSheetVersion: 1,
    industryTurnSheet: { ... }
  }
}
```

Do not add dozens of first-class `actions` columns for Turn Sheet fields.

The nested structured artifact payload is the appropriate place for the evolving Turn Sheet schema.

Only add first-class database fields when they are required for indexing, authorization, referential integrity, or a demonstrated query/performance requirement.

---

# 50. PROPOSAL TITLE

`INDUSTRY_TURN_SHEET_SPEC.md` does not require the Scribe to invent a separate proposal title.

Do not retain a manual title field merely because the old Industry form had one unless the specification or a real workflow requires it.

Prefer generating a stable user-facing title from structured data, for example:

```text
{Industry} Proposal — {Primary Move}
```

with move/proposal ordinal shown separately where needed.

If the current workflow requires `goal` to be non-empty, derive it from the normalized Turn Sheet.

Do not duplicate title text inside the Turn Sheet.

---

# 51. LEGACY PROPOSAL COMPATIBILITY FIELDS

If existing action columns such as:

```text
goal
sector
expected_outcomes
```

need bounded compatibility values for cards/search/audit:

- derive them from the Turn Sheet;
- do not make users enter duplicate versions;
- document the mapping;
- ensure the nested Turn Sheet remains authoritative for the new Industry proposal.

Suggested intent:

```text
goal → generated Industry + primary move title
sector → selected represented industry
expected_outcomes → compact derived expected-effect summary
```

Do not fabricate a legacy `recipientTeam`.

---

# 52. SAVE DRAFT VS FORWARD VALIDATION

Separate these concepts.

## Save Draft

Allow incomplete content to persist safely.

Use structural normalization only.

The user should be able to stop mid-work and return.

## Forward to Facilitator

Run full validation defined by the spec.

Every applicable field must be complete.

Show:

- inline field errors;
- page-level error summary;
- page completion status;
- focus management to the first invalid field.

Do not use a toast as the only validation feedback.

---

# 53. ACCESSIBILITY

Follow `DESIGN_STANDARDS.md` and `WRITING_STANDARDS.md`.

At minimum:

- semantic buttons/inputs/selects/fieldsets;
- fieldset + legend for grouped options;
- visible focus;
- keyboard-operable multi-selects and stance controls;
- no color-only meaning;
- `aria-describedby` for help/errors;
- `aria-invalid` on invalid controls;
- page navigation announced appropriately;
- error summary focus on failed forward;
- read-only carry-forward state clearly exposed to assistive technology;
- review screen navigable by headings;
- 200% text zoom support;
- reduced-motion support for page transitions;
- no hidden required information only available on hover.

---

# 54. VISUAL SEMANTICS AND COLOR

Use the PLENUM token system and existing semantic component roles.

Do not introduce raw colors.

Keep distinct:

```text
team identity
workflow state
severity
selection state
```

Do not let:

```text
Green Team = success
Red Team = error
Blue Team = generic information
```

become the only visual distinction.

Use labels/non-color cues.

---

# 55. COPY AND REPETITION

This modal must comply with the interface-clarity objectives.

Do not repeat:

```text
Industry Proposal
Turn Sheet
Proposal Details
current state
workflow explanation
```

in multiple adjacent headings/helper texts/badges.

Helper text must explain a constraint, consequence, scale, or definition—not restate the field label.

Do not expose:

```text
artifact_type
workflow_state
proposal_recipient_team
row_version
internal IDs
raw enum values
RPC names
compatibility terminology
```

to normal users.

---

# 56. NOTIFICATIONS / TOASTS

Audit and update notification copy touched by this workflow.

Use canonical workflow verbs:

```text
Save
Forward
Submit
Return
Resubmit
Complete
```

Do not alternate among:

```text
handed off
sent
forwarded
submitted
released
```

for the same transition.

Potential canonical patterns:

```text
Proposal draft saved
Proposal forwarded to Facilitator
Proposal submitted to White Cell
Proposal returned for revision
Proposal resubmitted to White Cell
Proposal completed
```

These strings may be adjusted to match `WRITING_STANDARDS.md` and existing canonical vocabulary.

### Rules

- important states must remain visible after a toast disappears;
- White Cell return notes must be durable;
- no raw backend errors in user-facing toasts;
- use appropriate severity;
- a return for revision is not a generic “success” event merely because the RPC succeeded;
- avoid duplicate local + realtime toasts for the same semantic event;
- do not show a toast when the updated durable state already provides sufficient immediate feedback unless confirmation materially helps;
- use live regions appropriately but do not make every routine toast assertive.

---

# 57. ANALYTICS AND LINEAGE

Persist stable IDs/references required by the spec.

At minimum preserve explicit lineage for:

```text
proposal ordinal
first-proposal baseline
previous move proposal
prior decision
prior risk
Strategic Plan
Strategic Priority
outbound engagement
inbound engagement
```

Do not infer lineage from display labels or text matching.

The data must later support:

```text
forecast accuracy
stance movement
risk movement
supply-chain exposure change
decision continuity / modification / abandonment
strategic-priority alignment
expected vs adjudicated effect
counterparty patterns
Ask / Offer patterns
cross-industry coordination
engagement behavior
```

Do not calculate or overwrite these analytics in this feature unless required for display.

Capture the source data correctly first.

---

# 58. HISTORY SURFACE

Implement the hybrid pattern from the specification:

## Inline

Show the immediately previous relevant value beside current fields.

## On demand

Provide:

```text
View history
```

for the chronological record.

History is read-only.

Do not expose raw JSON or backend audit structures.

---

# 59. EXPECTED EFFECT VS WHITE CELL OUTCOME

Do not overwrite participant expectations after White Cell review.

Preserve:

```text
Industry expected effect
```

separately from:

```text
White Cell completion/adjudication state
future modeled scenario effect
```

This distinction is essential for later expected-vs-actual analysis.

---

# 60. FILES LIKELY TO CHANGE

After tracing current HEAD, expect a bounded set similar to:

## ADD

```text
src/features/actions/industryTurnSheet.js
src/features/actions/industryTurnSheet.test.js
```

Possibly:

```text
src/features/actions/industryTurnSheetForm.js
```

and a new dated SQL migration if required for Industry Turn Sheet proposal recipient/null and Confidential Blue authorization.

## EXTEND

```text
src/features/actions/proposalDetails.js
src/features/actions/proposalDetails.test.js
src/roles/facilitator.js
src/roles/facilitator.test.js
src/roles/scribe.js
src/roles/scribe.test.js
src/roles/whitecell.js
src/roles/whitecell.test.js
src/services/database.js
src/services/database.action-write.test.js
```

Possibly relevant shared display/notification/style files after inspection.

## DO NOT TOUCH WITHOUT A SPECIFIC NEED

```text
Strategic Orientation domain/workflow
Blue action wizard semantics
Red action semantics
Green proposal semantics
GC05 regional orientation semantics
unrelated plugin code
unrelated database tables
```

Do not modify historical migrations in place.

---

# 61. DATABASE MIGRATION DISCIPLINE

If SQL changes are necessary:

1. Add a new dated migration.
2. Do not rewrite old migration history.
3. Keep the scope specifically tied to the Industry Turn Sheet requirement.
4. Preserve Green/legacy proposal constraints.
5. Add SQL regression tests.
6. Update `updated_supabase_schema.sql` / canonical schema snapshots only if the repository's migration policy requires it.
7. Document why each database change is required.

Potential justified database changes include:

```text
allow null legacy proposal_recipient_team for valid Industry Turn Sheet proposals
server-enforced Confidential Blue read visibility
server-authoritative first-proposal/baseline enforcement if current write model cannot guarantee it
```

Do not add schema changes for fields that belong safely in `artifact_payload`.

---

# 62. TEST PLAN — DOMAIN

Add tests covering every enum and normalization rule.

At minimum:

- all three industry IDs;
- A–N action taxonomy;
- multiple action codes;
- M exclusivity;
- N requires description;
- impact -2..2;
- confidence;
- Yes/Partly/No;
- five supply-chain stages;
- multiple supply-chain actions;
- Other location behavior;
- decision statuses;
- prior decision requirement;
- one primary move;
- counterparty category + multiple names;
- Ask/Offer required;
- Other Ask/Offer descriptions;
- stakeholder net values;
- all expected-effect dimensions;
- independent timing/pattern per effect;
- Unknown/N/A consistency;
- escalation None exclusivity;
- escalation rationale;
- engagement explicit no-engagement states;
- max three risks;
- risk movement status;
- other-sector spillover;
- stance 1–5;
- four next-move forecasts;
- no mutation of input.

---

# 63. TEST PLAN — PROPOSAL SERIALIZATION

Update proposal serialization tests proving:

1. existing Green proposal roundtrip is unchanged;
2. legacy Industry proposal roundtrip is unchanged;
3. new Industry Turn Sheet roundtrips without loss;
4. incomplete saved draft safely roundtrips;
5. nested version is preserved;
6. `hasIndustryTurnSheet` is true only when the sub-contract exists;
7. legacy Industry proposals are not misclassified;
8. Scribe Handoff survives edits;
9. Facilitator note survives revisions;
10. structured payload contains the nested Turn Sheet.

---

# 64. TEST PLAN — FIRST PROPOSAL / BASELINE

Test:

```text
Agriculture Move 1 Proposal 1 → editable baseline
Agriculture Move 1 Proposal 2 → read-only baseline referencing Proposal 1
Biotechnology Move 1 Proposal 1 → editable independent baseline
Agriculture Move 2 Proposal 1 → new editable baseline with Move 1 context
returned Agriculture Proposal 1 revision → still ordinal 1, not Proposal 2
soft-deleted proposal → handled according to persisted logical-record rules
```

Test current and previous baseline IDs explicitly.

---

# 65. TEST PLAN — FACILITATOR AUTHORING UI

Update `src/roles/facilitator.test.js` or add bounded tests proving:

- `New US Industry Proposal` opens the new three-page Turn Sheet;
- Green still opens existing Green proposal form;
- old Industry proposal opens legacy-compatible view;
- Page 1/2/3 labels are correct;
- values persist when navigating backward;
- Save Draft accepts incomplete content;
- Forward blocks incomplete content;
- inline errors work;
- review screen is generated;
- subsequent proposal Page 1 is read-only;
- prior decision options are filtered correctly;
- Strategic Plan context is read-only;
- at least one strategic priority must be linked;
- Facilitator can edit forwarded draft;
- Scribe cannot edit Facilitator note.

---

# 66. TEST PLAN — DATABASE WRITE BOUNDARY

Prove new Turn Sheets persist as:

```text
team = industry
mechanism = Proposal
artifact_type = proposal
```

and contain:

```js
artifact_payload.proposal.industryTurnSheet
```

Prove:

- no fake Blue/Red proposal recipient is minted;
- Green proposal recipient behavior remains unchanged;
- null `proposal_recipient_team` is accepted only where intended;
- invalid non-Turn-Sheet proposal recipient states remain rejected.

---

# 67. TEST PLAN — CONFIDENTIAL BLUE

Add server/auth tests proving Confidential — Blue visibility.

Required matrix:

| Role/team | Can read? |
|---|---:|
| Industry | yes |
| Blue | yes |
| White Cell | yes |
| Red | no |
| Green | no |

Also test non-confidential visibility according to the existing platform rules.

Do not accept UI-only tests as proof of confidentiality.

---

# 68. TEST PLAN — FACILITATOR PRESENTATION

Test that the Facilitator presentation for a new Industry Turn Sheet shows:

```text
industry
move
primary move
counterparty
Ask / Offer
strategic priority alignment
expected effects
escalation
engagement
partner check
risks
stance
forecasts
return notes when applicable
facilitator note
```

and does NOT fall back to the legacy generic proposal headings where they are misleading.

Test edit and submit behavior.

---

# 69. TEST PLAN — WHITE CELL

Test:

- new Industry Turn Sheet appears in proposal queue;
- all substantive sections are visible;
- recipient-approval controls are NOT shown for new Industry Turn Sheets;
- `Return for Revision` uses generic artifact return path;
- `Complete` uses generic artifact completion path;
- review notes required on return;
- revision history retains prior Turn Sheet snapshot;
- completed artifact becomes immutable;
- legacy/Green proposals retain recipient-forward review behavior.

---

# 70. TEST PLAN — ENGAGEMENT LINKS

Test:

- eligible outbound current-context records appear;
- eligible inbound current-context records appear;
- one each maximum;
- wrong-session records cannot be linked;
- invalid direction cannot be linked;
- no-engagement explicit states work;
- linked message content is not duplicated in serialized Turn Sheet.

---

# 71. TEST PLAN — COPY / TOASTS / ACCESSIBILITY

Test or manually verify:

- canonical workflow verbs;
- no raw backend enums in new UI;
- no duplicate adjacent headings;
- no generic placeholder repetition;
- notification severity is appropriate;
- no double toast for one event;
- return state remains durable;
- field errors are inline, not toast-only;
- keyboard navigation across all three pages;
- visible focus;
- page changes announced appropriately;
- 200% zoom;
- reduced motion;
- semantic groups/legends;
- color is never the only channel.

---

# 72. E2E ACCEPTANCE FLOW

If the repository harness supports it, add an Industry Turn Sheet E2E test covering:

```text
Strategic Plan exists
    ↓
Industry Scribe creates Agriculture Proposal 1 in Move 1
    ↓
completes Environment + Supply Chain
    ↓
completes Decision + Effects
    ↓
completes Engagement/Risk + Position/Forecast
    ↓
saves/reopens draft
    ↓
reviews proposal
    ↓
forwards to Facilitator
    ↓
Facilitator edits + adds Facilitator note
    ↓
Facilitator submits to White Cell
    ↓
White Cell sees full Turn Sheet
    ↓
White Cell returns for revision
    ↓
Scribe sees return notes and same logical proposal/revision lineage
    ↓
Scribe corrects and forwards
    ↓
Facilitator resubmits
    ↓
White Cell completes
    ↓
completed proposal locks
    ↓
Agriculture Proposal 2 in same move opens Page 1 read-only referencing Proposal 1
```

Also cover at least one Confidential — Blue authorization path if feasible in E2E.

---

# 73. RUN TESTS

Use the repository's actual scripts.

Run targeted tests first.

At minimum include relevant tests such as:

```bash
npm test -- \
  src/features/actions/industryTurnSheet.test.js \
  src/features/actions/proposalDetails.test.js \
  src/roles/facilitator.test.js \
  src/roles/scribe.test.js \
  src/roles/whitecell.test.js \
  src/services/database.action-write.test.js \
  src/services/database.actions.test.js
```

Then run:

```bash
npm run build
npm run test:non-pli
npm test
```

Run relevant SQL tests for any migration.

Run E2E tests added for this feature and relevant existing role/proposal tests.

If environment/credentials prevent a test, report that explicitly.

Never claim a test passed unless it actually ran.

---

# 74. SCREENSHOT / UX VERIFICATION

Because this is a large modal/UI change, inspect actual rendered states.

Capture or inspect at least:

```text
Page 1 first proposal
Page 1 subsequent proposal read-only
Page 2
Page 3
Review Proposal
returned revision
Facilitator presentation
White Cell review
validation errors
Confidential — Blue indicator
```

Check supported viewports defined by the design brief.

Do not declare the interface complete based only on unit tests.

---

# 75. DO NOT DO THESE THINGS

Do NOT:

- create a separate Turn Sheet artifact;
- create a second proposal after Turn Sheet completion;
- change Green proposal semantics;
- convert Industry sub-industries into teams/delegations without an explicit platform requirement;
- use `recipientTeams` to fake counterparties;
- invent a Blue/Red recipient merely to satisfy the current database constraint;
- copy engagement message text into the Turn Sheet;
- overwrite forecasts with observations;
- overwrite participant expectations with White Cell outcomes;
- infer lineage from text;
- allow later proposals to edit the first proposal's move baseline;
- expose raw JSON/backend enums in UI;
- put all new domain logic directly in `facilitator.js`;
- introduce a new modal framework;
- modify old migrations in place;
- weaken RLS globally for Confidential — Blue;
- change Strategic Orientation behavior;
- opportunistically refactor unrelated code.

---

# 76. DEFINITION OF DONE

The implementation is complete only when all of the following are true:

- [ ] Industry opens the new three-page Turn Sheet proposal experience.
- [ ] The Turn Sheet is the Proposal artifact, not a second record.
- [ ] Agriculture, Biotechnology and Telecommunications are supported inside one Industry team.
- [ ] Multiple proposals per industry per move are supported.
- [ ] First-proposal detection uses persisted records.
- [ ] First proposal owns editable Environment + Supply Chain.
- [ ] Later same-industry/same-move proposals show those sections read-only.
- [ ] Previous-move context is shown according to the specification.
- [ ] All Turn Sheet taxonomies match the spec.
- [ ] Save Draft can preserve incomplete work.
- [ ] Forward requires all applicable fields.
- [ ] Review Proposal is generated from state.
- [ ] Facilitator handoff is auto-generated.
- [ ] Facilitator may edit the proposal and add a separate note.
- [ ] New Industry Turn Sheets still persist as `artifact_type = proposal`.
- [ ] Counterparty is not conflated with legacy recipient team.
- [ ] No fake proposal recipient is created.
- [ ] Green proposal recipient behavior is unchanged.
- [ ] White Cell new Industry review is Complete / Return for Revision.
- [ ] Returned revisions preserve the logical proposal ID and history.
- [ ] Completed proposals lock.
- [ ] Confidential — Blue is enforced server-side.
- [ ] Engagement records are linked, not duplicated.
- [ ] Strategic Plan context is read-only and linked by IDs.
- [ ] Stable lineage supports future analytics.
- [ ] Legacy Industry proposals remain readable.
- [ ] Green proposal regressions are absent.
- [ ] New UI follows design/writing/accessibility standards.
- [ ] Toasts and feedback use canonical copy and appropriate severity.
- [ ] Targeted tests pass.
- [ ] Full unit/build checks pass or blocked checks are explicitly reported.

---

# 77. CHANGE-SCOPE AUDIT BEFORE FINISHING

Before finishing:

1. Run `git diff --stat`.
2. List every changed file.
3. Explain why each changed file was necessary.
4. List every new migration.
5. Confirm no historical migration was edited.
6. Identify every shared proposal function changed.
7. Explain how Green proposal behavior was protected.
8. Search for all uses of:

```text
PROPOSAL_RECIPIENT_TEAMS
proposal_recipient_team
serializeProposalDetails
parseProposalDetails
getProposalViewModel
operator_review_proposal
operator_review_artifact
```

9. Confirm new Industry Turn Sheets do not enter the legacy recipient-forward review path.
10. Confirm legacy proposals still do.
11. Confirm no Turn Sheet content is duplicated into unrelated timeline/toast metadata unnecessarily.
12. Confirm Confidential — Blue is enforced server-side, not just visually.

---

# 78. FINAL RESPONSE FORMAT

When implementation is complete, report:

## 1. Architecture

Explain how the Industry Turn Sheet fits into the existing proposal artifact and workflow.

## 2. Current-flow changes

Show the final chain:

```text
Industry Scribe
→ Turn Sheet / Proposal draft
→ Facilitator
→ White Cell
→ Complete / Return
```

## 3. Files changed

For each file:

```text
path
purpose
```

## 4. Data contract

Show the final normalized `industryTurnSheet` shape.

## 5. Persistence

Show a sanitized example of:

```text
ally_contingencies
artifact_payload
artifact_type
proposal_recipient_team
```

and explain compatibility behavior.

## 6. First-proposal behavior

Explain how baseline ownership, ordinals and subsequent proposal read-only context work.

## 7. Authorization

Explain how Confidential — Blue is enforced.

## 8. White Cell behavior

Explain why new Industry Turn Sheets use Complete / Return while Green/legacy proposals retain their recipient-forward workflow.

## 9. Backward compatibility

Explain how legacy Industry and Green proposals remain readable and functional.

## 10. Tests

List every test command actually executed and its result.

## 11. UX verification

List modal/screens/states inspected and any remaining issues.

## 12. Risks / unresolved issues

Only genuine remaining issues.

Do not hide failures.

Do not claim completion if a core acceptance criterion remains unimplemented.
