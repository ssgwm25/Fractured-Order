# TASK: Replace the Industry Strategic Orientation form with the Move 1 Industry Strategic Plan — without destabilizing Fractured Order

Repository: `ssgwm25/Fractured-Order`

## Objective

Update **only** the Industry team's current Strategic Orientation experience so that the modal captures the decision points in the new **Move 1 — Strategic Plan**.

The architectural goal is:

> Represent the Industry Strategic Plan inside the **existing Strategic Orientation artifact and workflow**, preserving the existing `actions` table, submission lifecycle, White Cell review lifecycle, Move 1 completion gate, legacy compatibility, audit history, and Blue/Red/Green behavior.

Do **not** introduce a new database-backed artifact type, second workflow, new table, new RPC, new RLS policy, new workflow state, or multiple Industry orientation artifacts.

The source document contains two distinct instruments:

1. **Move 1 — Strategic Plan**
2. **Turn Sheet**

Only the Strategic Plan belongs in this task. Everything beginning with **Turn Sheet** is explicitly out of scope.

---

# MANDATORY SOURCE DOCUMENT — READ BEFORE CODING

A field-level specification is supplied with this task:

```text
industry-strategic-plan-modal-spec.md
```

You MUST read that document in full before changing code. Treat it as the **authoritative source of truth for what the Industry Strategic Plan modal captures**.

It defines the required:

- modal title and context copy;
- section order;
- field keys;
- input types;
- stored values;
- display labels and helper text;
- option lists;
- repeatable-row shapes;
- conditional fields;
- validation rules;
- normalized modal data shape;
- blank reference object;
- source-derived versus platform-derived controls;
- explicit Turn Sheet exclusions; and
- modal acceptance checklist.

## Source precedence

Use these rules throughout the task:

1. **`industry-strategic-plan-modal-spec.md` is authoritative for field-level modal requirements.**
2. **The current repository is authoritative for architecture, workflow, persistence, lifecycle, authorization, and compatibility constraints.**
3. **This coding prompt is authoritative for change scope and integration strategy.**
4. If this prompt paraphrases a field, option, key, label, or validation rule differently from `industry-strategic-plan-modal-spec.md`, follow the modal specification.
5. Do not silently invent, rename, broaden, reconcile, or “improve” source-defined fields.
6. If the modal specification is ambiguous on a field, inspect the repository for an existing canonical representation. If ambiguity still remains, STOP and report it rather than guessing.

## Required pre-coding step

Before editing code, map every modal-spec section to the code responsible for:

```text
rendering
state
validation
serialization
view model
facilitator display
White Cell display
tests
```

Do not begin implementation until that mapping is complete.

Do not re-derive the modal from the original Word document in this task. The normalized implementation specification is `industry-strategic-plan-modal-spec.md`.

---

# 1. Verify the current chain before editing

Read current `main` and confirm this exact flow before changing code.

## Entry point

`teams/industry/facilitator.html`

The existing button is:

```html
<button class="btn btn-primary" id="strategicOrientationBtn" data-write-control="true">
  Strategic Orientation
</button>
```

Do not change the DOM ID.

## Event and modal chain

In `src/roles/facilitator.js`, verify:

```text
strategicOrientationBtn click
    ↓
showStrategicOrientationModal()
    ↓
createStrategicOrientationContent()
    ↓
bindStrategicOrientationModal()
    ↓
validateStrategicOrientationData()
    ↓
buildStrategicOrientationPayload()
    ↓
submitStrategicOrientation()
```

Also inspect and preserve:

```text
getStrategicOrientationActionForTeam()
updateStrategicOrientationControlAvailability()
isStrategicOrientationGateActive()
getStrategicOrientationGateMessage()
```

These implement duplicate prevention and Move 1 gating. Do not bypass them.

---

# 2. Current Industry contract

Read `src/features/actions/strategicOrientationDetails.js`.

The existing Industry profile currently behaves approximately as:

```js
industry: {
    teamId: 'industry',
    title: 'Strategic Orientation',
    submitCopy: 'Record Strategic Orientation',
    forecastTargets: ['blue'],
    requiredFields: [
        'forecastTargets.blue',
        'ownOrientation',
        'strategyDescription'
    ]
}
```

The current Industry experience is therefore:

```text
Forecast Blue
→ choose Industry orientation
→ describe Industry strategy
```

Replace that Industry-specific experience with the Move 1 Strategic Plan.

**Do not change Blue, Red, or Green Strategic Orientation behavior.**

---

# 3. Preserve the current persistence model

Strategic Orientations intentionally use the existing `actions` table.

Relevant files:

```text
src/services/database.js
data/2026-07-14_action_artifact_workflow_integrity.sql
data/2026-08-13_strategic_orientation_team_canonicalization.sql
data/2026-09-25_gc05_regional_orientations.sql
```

Current write path:

```text
buildStrategicOrientationPayload()
        ↓
database.createAction() / database.updateDraftAction()
        ↓
resolveStructuredArtifactFields()
        ↓
public.actions
```

Strategic Orientation currently persists both:

```text
ally_contingencies
```

with a compatibility envelope beginning:

```text
Strategic Orientation Details
```

and structured storage:

```js
artifact_payload: {
    strategic_orientation: parsedStrategicOrientation
}
```

plus:

```js
forecast_targets
```

Industry must remain:

```text
artifact_type = strategic_orientation_forecast
team = industry
```

This is intentional compatibility behavior.

### Do not create new artifact types such as

```text
industry_strategic_plan
strategic_plan
industry_orientation
```

### Do not create

- a new table;
- a second Industry orientation row;
- a new workflow state;
- a new submission RPC;
- a new White Cell review RPC;
- a new uniqueness rule;
- a new RLS policy.

No SQL migration should be required. If one appears unavoidable, stop and explain why before implementing it.

---

# 4. Backward compatibility rule

The current generic envelope uses:

```js
STRATEGIC_ORIENTATION_CONTRACT_VERSION = 2
```

Do **not** simply bump this to 3. Existing parser logic treats prior versions differently and a blind bump could make current v2 artifacts look legacy.

Instead add an Industry-specific nested sub-contract, e.g.:

```js
export const INDUSTRY_STRATEGIC_PLAN_VERSION = 1;
```

Keep:

```text
Contract Version: 2
```

valid.

Add optional Industry-specific envelope lines such as:

```text
Industry Strategic Plan Version: 1
Industry Strategic Plan: {...single-line JSON...}
```

Requirements:

- v1 Strategic Orientation artifacts remain readable;
- existing v2 Blue/Red/Green artifacts remain readable;
- older v2 Industry artifacts remain readable;
- new Industry Strategic Plan artifacts are additive, not destructive.

---

# 5. Add a bounded Industry domain module

Prefer adding:

```text
src/features/actions/industryStrategicPlan.js
src/features/actions/industryStrategicPlan.test.js
```

Keep this module domain-only. It should not depend on DOM, modal components, Supabase, database services, or role controllers.

Suggested responsibilities:

```js
INDUSTRY_STRATEGIC_PLAN_VERSION
INDUSTRY_SECTORS
INDUSTRY_RISK_TYPES
INDUSTRY_RISK_LEVELS
INDUSTRY_EXPOSURE_CELLS
normalizeIndustryStrategicPlan()
validateIndustryStrategicPlan()
getIndustryStrategicPlanDisplayFields()
```

Names may vary if repository conventions suggest better ones.

---

# 6. Field-level modal contract — use the supplied specification

Do not reproduce or reinterpret the field contract from memory.

Read and implement **Sections 1–18 of `industry-strategic-plan-modal-spec.md`**. That document is the sole field-level source of truth for the Industry modal.

It governs:

- `sector`;
- `businessOverview`;
- exactly three `risks` rows and their allowed values;
- the canonical Blue Strategic Orientation forecast;
- `redPriorities`;
- the three-row partner map and normalization of blank rows;
- `firstAmbassadorTarget`;
- exactly three `strategicPriorities`;
- numeric `strategicStance`;
- `redLine`;
- field labels and helper text;
- section order;
- form-level validation behavior;
- normalized object shape;
- blank-state shape;
- source-derived vs platform-derived controls; and
- explicit Turn Sheet exclusions.

### Hard requirements

The implementation must match the modal specification's exact field keys, stored values, option values, and validation semantics unless that document explicitly tells you to reuse an existing repository representation.

Do not:

- create alternate field names;
- change stored sector values;
- change the risk taxonomy;
- duplicate the Blue forecast as a second independently editable field;
- change `strategicStance` from numeric `1–5`;
- persist blank partner objects;
- relax the exact-three-risk or exact-three-priority rules;
- infer participant-authored answers; or
- add any Turn Sheet fields.

### Blue forecast compatibility

The modal specification deliberately keeps the Blue forecast in the existing canonical Strategic Orientation forecast contract. Preserve the existing `forecastTargets` representation and Pressure / Stabilization / Reframe catalogue. Do not create a second source of truth inside `industryStrategicPlan`.

### Implementation verification

After implementation, compare the rendered modal, normalized state, and validation behavior against the **Acceptance Checklist for the Modal** in `industry-strategic-plan-modal-spec.md`. Every unchecked item means the task is incomplete.

# 8. Serialization design

Modify `src/features/actions/strategicOrientationDetails.js` additively.

New Industry envelope should conceptually remain:

```text
Strategic Orientation Details
Contract Version: 2
Period: pre_move_1
Artifact Type: orientation_and_forecast
Team: industry
Own Orientation: None selected
Orientation: <compatibility value if required>
Orientation Label: <compatibility value if required>
Orientation Tag: <compatibility value if required>
Forecast Targets: [...]
Industry Strategic Plan Version: 1
Industry Strategic Plan: {"sector":"telecom",...}
Scribe Handoff: Forwarded
```

Use single-line JSON inside the line-oriented envelope.

`parseStrategicOrientationDetails()` must:

1. continue reading v1 artifacts;
2. continue reading existing v2 artifacts;
3. continue reading old Industry v2 artifacts with `ownOrientation`, Blue forecast, and `strategyDescription`;
4. parse optional Industry Strategic Plan version;
5. parse optional nested plan;
6. tolerate absence of the plan;
7. fail safely on malformed optional nested JSON;
8. never make an otherwise valid historical Strategic Orientation unreadable because the new sub-contract is absent.

Expose view-model capabilities such as:

```js
industryStrategicPlan
industryStrategicPlanVersion
hasIndustryStrategicPlan
```

---

# 9. Preserve artifact classification

In `src/services/database.js`, preserve `resolveStructuredArtifactFields()` semantics.

Industry must still resolve to:

```js
artifact_type: 'strategic_orientation_forecast'
```

Structured payload should become approximately:

```js
artifact_payload: {
    strategic_orientation: {
        contractVersion: 2,
        team: 'industry',
        forecastTargets: [...],
        industryStrategicPlanVersion: 1,
        industryStrategicPlan: {...}
    }
}
```

`forecast_targets` must still contain the canonical Blue forecast.

Do not add database columns for plan fields. Keep them inside the structured artifact payload.

---

# 10. Industry payload builder

The current `buildStrategicOrientationPayload()` assumes every team has `ownOrientation` and looks up `STRATEGIC_ORIENTATION_OPTIONS[data.ownOrientation]`.

That assumption is no longer valid for new Industry plans.

Do not force Industry to choose a fake own orientation.

Add an Industry-specific payload path/helper that produces approximately:

```js
{
    goal: `Industry Strategic Plan — ${sectorLabel}`,
    mechanism: 'Strategic Orientation',
    sector: sectorLabelOrCanonicalValue,
    exposure_type: 'pre_move_1',
    priority: 'HIGH',
    targets: [],
    expected_outcomes: forecastSummary,
    ally_contingencies: serializeStrategicOrientationDetails(...)
}
```

Follow existing `sector` conventions rather than inventing a parallel representation.

Blue/Red/Green continue using their current own-orientation behavior.

---

# 11. Industry-specific modal specialization

Do not make the generic renderer support every possible control type if that makes Blue/Red/Green fragile.

Preferred pattern:

```js
createStrategicOrientationContent(action) {
    if (this.teamId === 'industry') {
        return this.createIndustryStrategicPlanContent(action);
    }
    // existing logic unchanged
}
```

Likewise delegate:

```text
bindIndustryStrategicPlan(...)
validateIndustryStrategicPlan(...)
buildIndustryStrategicPlanPayload(...)
```

Keep the outer Strategic Orientation lifecycle intact.

Title:

```text
Industry Strategic Plan
```

Suggested modal structure:

```text
Move 1 — Strategic Plan
A. Business Overview
B. Top Three Risk Factors
C. Opening Read of the Environment
D. Partner Map
E. Strategic Priorities for the Game
Strategic Stance
Red Line
```

Use the existing `showModal()` infrastructure. Do not modify `src/components/ui/Modal.js` just for this feature.

A progressive sectioned layout, accordion, or stepper is acceptable if it remains one artifact and users can review the complete plan before submission.

---

# 12. Accessibility

Preserve or improve the current Strategic Orientation accessibility standard:

- semantic `fieldset`/`legend`;
- unique labels and IDs;
- keyboard-operable risk and stance controls;
- `aria-describedby` hints/errors;
- top-level error summary;
- inline errors;
- `aria-invalid`;
- focus error summary after failed validation;
- no visual-only selection state;
- no click-only pseudo controls.

Do not regress current catalogue keyboard behavior.

---

# 13. Edit / return / resubmission

The Industry form must support:

```text
new artifact
draft edit
White Cell returned artifact edit
resubmission
```

Hydrate from the nested parsed/view-model plan when present.

Do not reconstruct the new plan from `action.goal`, `sector`, or `expected_outcomes` when structured plan data exists.

For older Industry artifacts, preserve existing data and only map fields with defensible equivalents. Do not fabricate Business Overview, strategic priorities, red line, etc. from the old `strategyDescription`.

---

# 14. Facilitator presentation and finalization

Read `src/roles/scribe.js`. Despite the filename, this currently drives the Facilitator review/presentation/final submission surface.

Preserve this chain:

```text
renderStrategicOrientationSlide()
    ↓
renderScribeStrategicOrientationSubmissionControls()
    ↓
submitScribeStrategicOrientation()
    ↓
database.submitAction()
    ↓
White Cell
```

Do not create a new submission path.

When `hasIndustryStrategicPlan === true`, show:

```text
Industry Strategic Plan
Sector
A. Business Overview
B. Top Three Risks
   Risk | Likelihood | Impact | Cell
C. Opening Read
   Blue expected orientation
   Red priorities
D. Partner Map
   Partner | Why they matter | Likely want
   First ambassador target
E. Strategic Priorities
   Priority | Success looks like
Strategic Stance
Red Line
```

Do not use generic heading `Orientation and forecasts` for the plan view.

Preserve submission authority and existing buttons/workflow.

---

# 15. White Cell display

Read `src/roles/whitecell.js`.

Preserve the current route:

```text
submitted action
→ isStrategicOrientationAction()
→ strategicOrientationArtifacts
→ renderStrategicOrientationReview()
→ renderActionCard()
→ showStrategicOrientationReviewModal()
→ database.reviewArtifact('strategic_orientation', ...)
```

For new Industry plans:

- prefer review title `Review Industry Strategic Plan`;
- show all plan decision fields;
- use shared display helpers rather than reparsing the envelope independently;
- returned revision history must show the saved plan snapshot.

Do not modify `operator_review_artifact` or review semantics.

White Cell retains existing `Complete` and `Send Back for Improvement` behavior.

---

# 16. Centralize display data

`getStrategicOrientationDisplayFields()` is reused across team/facilitator cards, Facilitator presentation, White Cell cards, White Cell review, and revision history.

Preserve that reuse.

If a flat list is too weak for tables, add a shared structured helper, e.g.:

```js
getIndustryStrategicPlanDisplayModel()
```

returning:

```js
{
    overviewFields,
    risks,
    environment,
    partners,
    priorities,
    stance,
    redLine
}
```

Do not parse `ally_contingencies` independently in each UI surface.

---

# 17. Timeline / audit events

Do not rename existing audit event types:

```text
ACTION_CREATED
STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE
STRATEGIC_ORIENTATION_SUBMITTED
```

Preserve existing metadata keys where applicable, especially `forecast_targets`.

Optional bounded metadata may include:

```js
industry_strategic_plan_version
sector
strategic_stance
```

Do not duplicate full plan narratives, partner map, risks, or red line into timeline metadata. The action/revision snapshot is the durable detailed record.

---

# 18. Move 1 completion gate — do not change

`getStrategicOrientationCompletion()` must continue using one submitted/adjudicated Strategic Orientation artifact per required team.

Industry plan still satisfies:

```text
industry
```

Do not change the gate to sector-specific keys and do not require multiple Industry artifacts.

Persisted row ownership remains authoritative, not participant-authored envelope content.

---

# 19. Duplicate prevention — do not change

Keep:

```text
idx_actions_one_orientation_per_session_team
```

and current client-side duplicate prevention.

The Strategic Plan is an evolution of the existing Industry artifact, not a second artifact.

---

# 20. Exact implementation map

## CHANGE

### `src/features/actions/strategicOrientationDetails.js`

Change only what is required to:

- support the optional Industry Strategic Plan sub-contract;
- preserve contract v2;
- preserve v1/v2 compatibility;
- expose `hasIndustryStrategicPlan` and normalized plan data;
- provide Industry-specific titles/display;
- stop requiring Industry own-orientation for new plan records;
- retain canonical Blue forecast support.

Do not change Blue/Red/Green behavior.

### `src/roles/facilitator.js`

Specialize/delegate Industry behavior from:

```text
createStrategicOrientationContent
bindStrategicOrientationModal
validateStrategicOrientationData
buildStrategicOrientationPayload
```

Make the smallest possible change to `submitStrategicOrientation()` to remove assumptions that `ownOrientation` always exists.

Guard code such as:

```js
const option = STRATEGIC_ORIENTATION_OPTIONS[payloadViewModel.orientation];
```

against new Industry semantics.

Do not alter lifecycle behavior.

### `src/roles/scribe.js`

Change Industry-only Strategic Orientation presentation layout/copy. Reuse the shared plan display model. Preserve existing submission controls and `submitScribeStrategicOrientation()`.

### `src/roles/whitecell.js`

Change only presentation/review behavior required to render the Industry Strategic Plan. Do not alter review RPCs/state transitions.

## ADD / EXTEND

Prefer:

```text
src/features/actions/industryStrategicPlan.js
src/features/actions/industryStrategicPlan.test.js
```

Optionally extend `styles/components/modals.css` only as necessary for risk, partner, priority, and stance layouts. Use the existing design system.

Add/update architecture documentation, e.g.:

```text
docs/architecture/industry-strategic-plan.md
```

## TEST FILES

Update as needed:

```text
src/features/actions/strategicOrientationDetails.test.js
src/roles/facilitator.test.js
src/roles/scribe.test.js
src/roles/whitecell.test.js
src/services/database.action-write.test.js
src/services/database.actions.test.js
```

Optional bounded E2E:

```text
tests/e2e/industry-strategic-plan.e2e.js
```

Do not repurpose Green-specific GC05 tests for Industry.

---

# 21. Do not touch

Unless a concrete regression proves otherwise, do not modify:

```text
src/components/ui/Modal.js
data/2026-07-14_action_artifact_workflow_integrity.sql
data/2026-08-13_strategic_orientation_team_canonicalization.sql
data/2026-09-25_gc05_regional_orientations.sql
```

Also do not:

- change actions-table artifact type constraints;
- change RLS;
- change the one-orientation-per-team unique rule;
- change `operator_review_artifact`;
- create a new White Cell RPC;
- change Blue Strategic Orientation;
- change Red Strategic Orientation;
- change Green Strategic Orientation;
- change proposal workflows;
- change normal action workflows;
- change Move 1 gate semantics;
- rename persisted audit event types;
- change the `strategicOrientationBtn` DOM ID.

---

# 22. Turn Sheet is explicitly out of scope

Do not add:

```text
Move-by-move environment read
ACTION CODES
Supply-chain stage actions
Weakest link / better-same-worse
Business position status
Primary move
Counterparty
Capital commitment
Visibility
ASK
OFFER
Stakeholder tradeoff table
Intended effect
Implementation
Revenue direction
Operating cost direction
US jobs effect
Capacity/supply security effect
Effect timing
Escalation markers
Ambassador outcome
Inbound ambassador log
Risk and spillover generated by a move
Move stance check
Next-move forecast
Facilitator hand-off summary
```

Those belong to the later Turn Sheet/move workflow.

---

# 23. Validation rules

Do not independently redefine validation in this prompt. Implement the exact validation contract in `industry-strategic-plan-modal-spec.md`, including:

- per-field required rules;
- exact row counts;
- conditional `otherText`;
- duplicate-risk handling;
- partial-row rejection;
- blank-row normalization;
- numeric stance constraints;
- form-level error summary;
- inline errors;
- `aria-invalid`;
- focus behavior; and
- preservation of entered values after validation failure.

Add only the integration validation necessary to preserve repository invariants. Do not make the field contract stricter or looser without a concrete repository requirement.

# 24. Test requirements

Build every new Industry fixture from the exact normalized object, stored values, and option lists in `industry-strategic-plan-modal-spec.md`. Do not invent alternate test taxonomies or field names.


## Domain tests

Cover:

- valid plan normalization;
- invalid sector;
- exactly three risks;
- invalid likelihood/impact/cell;
- `other` risk explanation;
- duplicate risk rejection;
- blank partner rows normalized away;
- partial partner rejection;
- at least one partner;
- exactly three strategic priorities;
- partial priority rejection;
- stance below 1 / above 5;
- required red line;
- required business overview;
- required Red priorities;
- normalization does not mutate input.

## Serializer/view-model tests

Prove:

1. existing Blue v2 roundtrip still works;
2. existing Red v2 roundtrip still works;
3. existing Green v2 roundtrip still works;
4. legacy v1 selection still works;
5. legacy v1 forecast still works;
6. old-style Industry v2 still parses;
7. new Industry plan roundtrips losslessly;
8. nested plan version persists;
9. Blue forecast remains in `forecastTargets`;
10. new Industry plan does not require fake `ownOrientation`;
11. view model exposes `hasIndustryStrategicPlan === true`;
12. one submitted Industry artifact still satisfies completion.

## Facilitator/controller tests

Prove new Industry UI contains:

```text
Industry Strategic Plan
Business Overview
Top Three Risk Factors
Opening Read of the Environment
Partner Map
Strategic Priorities
Strategic Stance
Red Line
```

Prove it still includes a Blue Pressure/Stabilization/Reframe forecast.

Prove it no longer requires:

```text
Choose Industry's orientation
Describe your strategy given this forecast
```

Test new draft, draft edit, duplicate prevention, and returned revision edit.

## Database write tests

Prove:

```js
artifact_type === 'strategic_orientation_forecast'
```

and:

```js
artifact_payload.strategic_orientation.industryStrategicPlan
```

contains the normalized plan, while `forecast_targets` still contains Blue.

## Facilitator presentation tests

Prove the full plan is visible and submission still uses the existing Strategic Orientation submission path.

## White Cell tests

Prove:

- Industry plan enters Strategic Orientation queue;
- review title/display are correct;
- complete/send-back use existing artifact review workflow;
- returned revision history preserves plan snapshot;
- Industry still satisfies the completion gate after submission.

---

# 25. E2E acceptance path

If practical, implement an E2E path:

```text
Industry author
→ opens Strategic Orientation
→ sees Industry Strategic Plan
→ completes plan
→ records/forwards draft
→ Facilitator sees exact saved plan
→ projects/reviews
→ submits to White Cell
→ White Cell sees exact saved plan
→ White Cell sends back
→ Industry edits returned revision
→ Facilitator resubmits
→ White Cell completes
→ Move 1 gate recognizes Industry as complete
```

Assert persisted values, not just visible headings.

---

# 26. Run tests

At minimum:

```bash
npm test -- \
  src/features/actions/industryStrategicPlan.test.js \
  src/features/actions/strategicOrientationDetails.test.js \
  src/roles/facilitator.test.js \
  src/roles/scribe.test.js \
  src/roles/whitecell.test.js \
  src/services/database.action-write.test.js \
  src/services/database.actions.test.js
```

Then:

```bash
npm run build
npm run test:non-pli
npm test
```

If E2E is added:

```bash
npm run test:e2e -- tests/e2e/industry-strategic-plan.e2e.js
```

If environment/infrastructure blocks a test, report it explicitly. Do not claim tests passed unless executed.

---

# 27. Definition of done

The complete **Acceptance Checklist for the Modal** in `industry-strategic-plan-modal-spec.md` is incorporated into this definition of done. Every item in that checklist must pass.


- [ ] Industry opens a Move 1 Strategic Plan instead of the old generic Industry orientation form.
- [ ] Blue, Red, and Green behavior is unchanged.
- [ ] Industry still records exactly one Strategic Orientation artifact.
- [ ] No new database table exists.
- [ ] No new artifact type exists.
- [ ] No new workflow state exists.
- [ ] No new review RPC exists.
- [ ] Existing uniqueness remains intact.
- [ ] Existing Move 1 completion gate remains intact.
- [ ] Blue forecast still populates `forecast_targets`.
- [ ] Complete plan is available in `artifact_payload`.
- [ ] `ally_contingencies` remains parseable.
- [ ] v1 Strategic Orientations still parse.
- [ ] existing v2 Strategic Orientations still parse.
- [ ] old-style Industry v2 records still parse.
- [ ] Facilitator projection displays full Industry plan.
- [ ] White Cell review displays full Industry plan.
- [ ] Returned revision history retains the plan.
- [ ] Return/edit/resubmit lifecycle still works.
- [ ] No Turn Sheet fields were added.
- [ ] Existing Blue/Red/Green tests pass.
- [ ] New Industry tests pass.
- [ ] Build passes.

---

# 28. Change-scope audit before completion

Before final response:

1. Run `git diff --stat`.
2. List every changed file and why it changed.
3. Identify any SQL changes — there should be none.
4. Identify any Blue/Red/Green behavioral changes — there should be none.
5. Search all occurrences of:

```text
STRATEGIC_ORIENTATION_CONTRACT_VERSION
strategic_orientation_selection
strategic_orientation_forecast
idx_actions_one_orientation_per_session_team
```

and confirm they remain stable.

6. Confirm lifecycle remains:

```text
draft
→ forwarded_to_facilitator
→ submitted_to_white_cell
→ complete OR returned_to_team
→ resubmitted if returned
```

7. Confirm full Industry plan content is not duplicated across unrelated columns/events.

---

# 29. Final response format

Include a short **Modal Specification Compliance** section confirming that `industry-strategic-plan-modal-spec.md` was read and that its field keys, option values, validation rules, and acceptance checklist were implemented without undocumented substitutions.


When finished, report:

## 1. Architecture
How the new Industry plan fits inside the existing Strategic Orientation artifact.

## 2. Files changed
For each file:

```text
path
purpose
```

## 3. Data contract
Show the final normalized Industry Strategic Plan shape.

## 4. Persistence
Show one non-sensitive example of:

```text
ally_contingencies
artifact_payload
forecast_targets
artifact_type
```

## 5. Workflow
Confirm:

```text
Industry → Facilitator → White Cell → return/complete
```

still uses the existing lifecycle.

## 6. Backward compatibility
Explain how v1, v2, and old Industry records remain readable.

## 7. Tests
List every command actually executed and its result.

## 8. Risks / unresolved issues
Only genuine remaining issues.

Do not hide failing tests. Do not opportunistically refactor unrelated areas. Do not commit or push unrelated modifications.
