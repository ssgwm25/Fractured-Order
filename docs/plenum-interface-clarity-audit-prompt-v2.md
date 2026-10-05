# PLENUM INTERFACE CLARITY, COPY, LABELING, AND VISUAL-SEMANTICS AUDIT

## Role

Act as a senior product designer, UX architect, information architect, and frontend engineer reviewing the current PLENUM platform.

This task is primarily an **interface audit and correction specification**, not a redesign exercise.

The objective is to make PLENUM:

- clear;
- intuitive;
- concise;
- semantically consistent;
- correctly labeled;
- visually coherent;
- role-appropriate;
- free of backend/internal implementation copy;
- free of unnecessary repeated instructions and labels.

The interface should feel like a deliberately designed simulation platform, not like an engineering interface exposed directly to users.

---

# 1. AUTHORITATIVE STANDARDS

Before reviewing any PLENUM screen or modifying any code, read:

```text
DESIGN_STANDARDS.md
WRITING_STANDARDS.md
```

Treat them as the governing standards for this review.

In particular, apply the following principles rigorously:

## From `DESIGN_STANDARDS.md`

- Intuitiveness outranks visual novelty.
- Users should immediately understand:
  - what a screen is for;
  - what they can do;
  - what changed.
- Recognition is preferable to recall.
- Information should be:
  - always visible;
  - one action away;
  - or available on demand.
- Do not expose information merely because the system has it.
- One concept should have:
  - one term;
  - one symbol;
  - one visual treatment;
  - one component pattern.
- Color must have semantic meaning.
- The same state must use the same visual language everywhere.
- Controls must look and behave consistently.
- Disabled states must explain why they are unavailable.
- Dense information is acceptable; clutter and redundant containers are not.
- Reuse existing components before creating new variants.
- Avoid decorative UI that does not communicate hierarchy, state, or action.

## From `WRITING_STANDARDS.md`

- Clarity beats voice.
- A control label must predict what the control does.
- Use one verb for one action throughout the platform.
- Use one term for one concept.
- Do not vary terminology stylistically.
- Utility controls should use plain language.
- Labels should not repeat information already established by the surrounding context.
- Error, disabled, loading, empty, and confirmation text must explain what happened and what the user can do.
- Avoid generic system language when user-facing language can describe the real task.

---

# 2. PRIMARY PROBLEM TO SOLVE

The current PLENUM interface contains several related classes of UX debt.

Your job is to identify them comprehensively.

## A. Backend/internal copy is visible to users

Some text appears to describe:

- database concepts;
- workflow implementation;
- artifact classification;
- internal role logic;
- technical state names;
- system identifiers;
- data-model terminology;
- debug or developer information;
- internal routing;
- compatibility terminology;
- implementation-specific distinctions.

These may be useful to developers, logs, audit records, or administrators.

They should NOT automatically appear in participant-facing or facilitator-facing UI.

Examples of the TYPE of thing to investigate include:

```text
artifact_type
workflow_state
strategic_orientation_forecast
strategic_orientation_selection
row_version
delegation_id
client_id
canonical state
compatibility type
artifact payload
handoff revision
internal IDs
database field names
raw enum values
RPC terminology
debug descriptions
```

Do not assume these exact examples are necessarily visible.

Inspect the actual platform and identify every real instance.

### Principle

Internal state may remain in the backend.

The UI should expose its **meaning**, not its implementation.

For example:

```text
backend:
workflow_state = forwarded_to_facilitator
```

may become:

```text
user:
Ready for facilitator review
```

if that is the actual meaning.

Do not rename backend fields unless technically necessary.

Prefer presentation adapters and user-facing labels.

---

# 3. REPETITION IS A PRIMARY AUDIT TARGET

PLENUM currently risks repeating information in several places within the same screen, card, dialog, or workflow.

Audit for repetition at all levels.

## Look for:

### Repeated headings

Example pattern:

```text
Strategic Orientation

Strategic Orientation Details

Strategic Orientation Selection

Strategic Orientation
```

within one user context.

One clear heading may be sufficient.

### Repeated labels

Example:

```text
Status
Status: Submitted
Submission status: Submitted
Submitted to White Cell
```

appearing together.

Determine the minimum information needed.

### Repeated instructions

Example:

```text
Select an option below.

Choose one option.

Select one orientation.

Please select your orientation.
```

Do not preserve all four simply because they exist.

Choose the clearest necessary instruction.

### Label + value duplication

Example:

```text
Forecast Blue's orientation

Blue Forecast

Forecast: Blue will choose Pressure
```

on the same card.

Determine whether one label and one value communicate the concept adequately.

### Heading + helper-text duplication

Example:

```text
Strategic priorities

Select your strategic priorities for the game.

Choose the priorities your team will pursue during the game.
```

If the heading already makes the task clear, helper text may be unnecessary.

### Repeated lifecycle explanation

Do not explain the entire:

```text
Scribe → Facilitator → White Cell
```

workflow on every artifact card.

Show the user's **current state and next action**.

Provide the full lifecycle only when it materially helps.

---

# 4. DO NOT SOLVE REPETITION BY REMOVING NECESSARY CONTEXT

Minimal does not mean cryptic.

For each piece of text, ask:

> What decision or action does this text help the user perform?

Keep it if it materially answers one of these:

```text
What is this?
What is its current state?
What am I expected to do?
What happens next?
Why can I not do something?
What changed?
```

Remove, shorten, merge, or move it if it does not.

Use progressive disclosure for secondary information.

---

# 5. ESTABLISH A USER-FACING INFORMATION HIERARCHY

For every major screen, modal, panel, card, and queue, classify information into:

## Level 1 — Always visible

Information required to understand or act immediately.

Examples might include:

```text
artifact title
current state
primary decision
primary action
critical deadline/timer
important return note
```

## Level 2 — One action away

Useful supporting information.

Examples:

```text
rationale
secondary metadata
forecast detail
counterparty details
revision information
```

## Level 3 — On demand

Audit, technical, provenance, or rarely needed information.

Examples:

```text
internal ID
revision history
database-style metadata
raw timestamps
system attribution
technical diagnostic data
```

Do not place Level 3 information in the default visual hierarchy merely because it exists.

---

# 6. BUILD A TERMINOLOGY INVENTORY

Search PLENUM for every user-facing term related to:

```text
Action
Proposal
Strategic Orientation
Strategic Plan
RFI
Request for Information
Submit
Forward
Send
Return
Review
Complete
Approve
Accept
Adjudicate
Edit
Revise
Resubmit
Facilitator
Scribe
Notetaker
White Cell
Team
Cell
Move
Phase
Turn
Session
Status
State
Response
Communication
Message
Notification
```

Do not assume these are all wrong.

Map actual usage.

Produce a terminology table:

| Concept | Current labels found | Recommended canonical term | Reason |
|---|---|---|---|

---

# 7. ONE VERB PER WORKFLOW ACTION

Pay particular attention to workflow verbs.

PLENUM should not use:

```text
Send
Forward
Submit
Transmit
Release
Hand off
```

interchangeably if they represent different workflow transitions.

Determine the actual semantics from the code.

Then define the canonical vocabulary.

For example, if the architecture supports it:

```text
Forward
= team author → facilitator

Submit
= facilitator → White Cell

Return
= White Cell → originating team for revision

Resubmit
= corrected artifact → White Cell

Complete
= White Cell accepts the artifact as complete
```

This is only an example.

Verify the actual workflow before defining the terms.

Once defined:

> The same transition must use the same verb everywhere.

Do not vary labels for stylistic reasons.

---

# 8. LABEL CORRECTNESS AUDIT

For every control, heading, status, and field:

Ask:

### Does the label describe the actual thing?

Bad:

```text
Actions
```

when the section contains proposals.

Bad:

```text
Submit
```

when the operation only saves a draft.

Bad:

```text
Approve
```

when the action actually marks something complete.

Bad:

```text
Response
```

when the object is a White Cell communication.

### Does the control predict the result?

A user seeing:

```text
Submit to White Cell
```

should know exactly where the artifact will go.

Prefer this over:

```text
Continue
Proceed
Confirm
Done
OK
```

where the effect is consequential.

### Is the same concept labeled differently elsewhere?

If yes:

choose the canonical term and update all user-facing instances.

---

# 9. COPY LEAKAGE AUDIT

Search all user-visible text for implementation language.

Inspect:

```text
HTML
JavaScript string literals
template literals
modal builders
toast messages
notification banners
durable notifications
live-region announcements
error messages
empty states
helper text
tooltips
badges
status labels
presentation views
White Cell review
facilitator surfaces
scribe surfaces
notetaker surfaces
participant screens
observer screens
onboarding copy
```

Classify each suspicious string:

```text
USER COPY
OPERATOR COPY
DEVELOPER COPY
AUDIT COPY
DEBUG COPY
```

Then verify it only appears in the appropriate context.

---

# 10. ROLE-SPECIFIC VISIBILITY

PLENUM has different users with different information needs.

Audit separately for:

```text
Participant / team member
Scribe
Facilitator
Notetaker
White Cell
Observer
Game Master / administrator
```

Do not assume all roles should see the same metadata.

Create a visibility matrix:

| Information | Participant | Scribe | Facilitator | Notetaker | White Cell | Admin |
|---|---:|---:|---:|---:|---:|---:|

Pay special attention to:

```text
internal IDs
revision metadata
workflow mechanics
technical state
system provenance
debug information
review metadata
role-routing data
```

These may belong in White Cell/admin surfaces but not participant surfaces.

---

# 11. SEMANTIC COLOR AUDIT

Do not treat color as decoration.

Inventory every color used for meaning.

Determine which semantic roles PLENUM actually needs.

At minimum inspect:

```text
primary action
secondary action
selected
hover
focus
disabled
information
success
warning
critical/error
neutral
draft
forwarded
submitted
returned
completed
active
inactive
team/faction identity
```

Then verify:

> One meaning = one color role.

and:

> One color role = one meaning.

Examples of problems to flag:

```text
green meaning "success" in one place but "Green Team" in another without another differentiator

yellow meaning "pending" in one component and "returned" elsewhere

red meaning "destructive action", "Red Team", and "system error" with no secondary channel
```

Faction identity and system status must not become visually ambiguous.

Every color-coded meaning must also have a non-color channel such as:

```text
label
icon
shape
border treatment
pattern
position
```

Do not rely on color alone.

---

# 12. BADGE AUDIT

Badges are especially prone to UI noise.

For every badge ask:

1. Does it communicate a real state?
2. Is that state already visible elsewhere?
3. Is it necessary at this hierarchy level?
4. Does the same badge mean the same thing everywhere?
5. Is the label user-facing language or backend language?

Flag badge clusters such as:

```text
INDUSTRY
STRATEGIC ORIENTATION
ORIENTATION & FORECAST
DRAFT
FORWARDED
PRE-MOVE 1
```

if several are merely restating the same context.

Determine the minimum meaningful set.

---

# 13. CARD AUDIT

For every card type inspect:

```text
eyebrow
title
subtitle
summary
badges
metadata
body
detail grid
status
buttons
helper text
```

Ask whether each layer communicates genuinely different information.

Do not allow:

```text
eyebrow → title → subtitle → summary
```

to restate the same fact four times.

A card should normally make these immediately apparent:

```text
What is this?
What state is it in?
What matters about it?
What can I do?
```

Everything else should justify its space.

---

# 14. MODAL AUDIT

For every modal inspect:

```text
modal title
section heading
field label
helper text
placeholder
button text
error text
footer instructions
```

Identify repeated language.

Example problem:

```text
Modal: Strategic Orientation
Heading: Strategic Orientation
Description: Record your Strategic Orientation
Section: Strategic Orientation Selection
Field: Choose your Strategic Orientation
Button: Record Strategic Orientation
```

This is technically explicit but cognitively noisy.

Prefer something structurally closer to:

```text
Modal:
Strategic Orientation

Section:
Your position

Field:
Choose an orientation

Button:
Save orientation
```

ONLY if those words correctly represent the actual workflow.

Do not blindly use this example.

Determine appropriate terminology from the real product.

---

# 15. HELP TEXT AUDIT

Helper text should explain something the label cannot.

Remove help text that merely repeats the label.

Keep help text when it communicates:

```text
scope
consequence
constraint
definition
required format
decision implication
```

Example:

Bad:

```text
Strategic stance
Select your strategic stance.
```

Useful:

```text
Strategic stance
1 prioritizes business interests; 5 prioritizes national interests.
```

---

# 16. PLACEHOLDER AUDIT

Do not use placeholders as duplicate labels.

Bad:

```text
Label: Red line
Placeholder: Enter your red line
```

Prefer a useful example or no placeholder.

A placeholder should add information, not repeat the field name.

Do not use placeholder text as the only field instruction.

---

# 17. STATUS LANGUAGE

Backend states must be translated into consistent human-readable states.

Inventory actual workflow states such as:

```text
draft
forwarded_to_facilitator
submitted_to_white_cell
returned_to_team
resubmitted
adjudicated
completed
changes_requested
```

Do not expose enum formatting directly.

Create a presentation mapping, for example:

```js
{
  draft: {
    label: 'Draft',
    ...
  }
}
```

Keep backend values stable unless there is a compelling architecture reason to change them.

UI copy should be a presentation concern.

---

# 18. TECHNICAL METADATA

Identify metadata currently visible to users.

Examples might include:

```text
Revision 3
Artifact ID
Created at
Updated at
Submitted at
Workflow state
Artifact type
Team ID
Delegation ID
Source ID
```

For each piece determine:

```text
Always visible
Secondary
On demand
Operator only
Developer only
```

Do not simply delete useful auditability.

Move it to the correct hierarchy.

---

# 19. ERROR AND EMPTY-STATE AUDIT

Check every:

```text
error
warning
empty state
disabled state
loading state
saving state
```

Avoid implementation language such as:

```text
Failed to fetch artifact
RPC failed
PGRST...
Invalid artifact payload
```

unless shown inside a developer diagnostic surface.

User-facing message should state:

```text
what happened
why, if known
what the user can do
```

Preserve technical errors in logging.

Do not discard diagnostic data.

---


# 20. NOTIFICATION, TOAST, ALERT, AND FEEDBACK AUDIT

Treat every transient or persistent notification surface as part of the interface system, not as incidental implementation detail.

Audit all of the following:

```text
toast notifications
success toasts
warning toasts
error toasts
information toasts
inline alerts
banners
notification badges
notification drawers/panels
durable notifications
live-region announcements
system notices
submission confirmations
save confirmations
arrival notifications
workflow-change notifications
connection/realtime notices
```

Search the codebase for every mechanism that produces these surfaces, including shared helpers and direct string construction.

## A. Determine whether each notification is necessary

For every toast, banner, or alert ask:

1. Does it communicate something the user would otherwise miss?
2. Is the same information already visible immediately in the updated screen state?
3. Does the message require action?
4. Is the message temporary or should it remain visible?
5. Is the severity correct?
6. Is the notification role-appropriate?
7. Is it written in user language rather than system language?

Do not display a toast merely because an operation succeeded if the resulting state change is already obvious and immediate.

Example:

```text
User clicks "Save draft"
The modal closes
The card now visibly shows "Draft saved"
```

A second toast saying:

```text
Draft saved successfully
```

may be redundant.

Determine whether the toast adds useful confirmation or merely repeats the interface.

## B. Distinguish transient feedback from durable state

A toast is temporary.

Do not use a toast as the only representation of information the user may need later.

The following generally require durable UI representation:

```text
artifact returned for revision
White Cell review notes
submission state
failed submission requiring retry
new proposal requiring response
RFI answer
role or permission change
session state change
connection loss affecting work
deadline or timer condition requiring action
```

A toast may announce the change, but the underlying state must remain discoverable after the toast disappears.

## C. Notification copy must be canonical

Inventory all notification strings and detect inconsistent wording such as:

```text
Sent successfully
Submitted
Successfully submitted
Forwarded to White Cell
Sent to White Cell
Submission complete
```

when they refer to the same workflow transition.

Use the canonical workflow verb established in the terminology audit.

For every workflow event, define one notification pattern.

Conceptually:

```text
draft saved
artifact forwarded to facilitator
artifact submitted to White Cell
artifact returned for revision
artifact resubmitted to White Cell
artifact marked complete
RFI sent
RFI answered
proposal received
proposal response sent
```

These exact strings are not pre-approved.

Verify the actual semantics first.

## D. Remove backend copy from notifications

Flag notification strings containing or exposing:

```text
RPC names
HTTP status codes
database constraint names
Supabase/PostgREST codes
artifact_type
workflow_state
row_version
raw exception text
internal IDs
enum values
JavaScript error objects
stack traces
```

Technical details should remain in logs or diagnostic surfaces.

The user-facing notification should communicate:

```text
what happened
what remains true
what the user should do next
```

## E. Severity semantics

Audit the mapping between message type and visual severity.

A message classified as:

```text
success
information
warning
critical/error
```

must mean the same thing throughout PLENUM.

Do not use `warning` for routine neutral information.

Do not use `error` for expected workflow restrictions such as a locked record unless the user actually attempted an invalid action.

Do not use `success` for every completed click.

Define the distinction explicitly.

## F. Toast color coding

Toast colors must use the same semantic color roles as the rest of the platform.

Do not create a separate notification color vocabulary.

In particular, ensure team identity colors do not collide with notification severity.

Examples:

```text
Green Team identity ≠ success
Red Team identity ≠ error
Blue Team identity ≠ generic information
```

Use text labels and/or symbols in addition to color.

## G. Toast duration and persistence

Review how long notifications remain visible.

Classify each notification type as:

```text
brief transient
extended transient
persistent until dismissed
durable elsewhere, toast optional
```

Do not auto-dismiss a message before a reasonable user can read it.

Do not keep routine success messages permanently.

Critical actionable failures should not disappear without another durable representation.

If the codebase uses one duration for every toast, flag it if different message classes clearly need different treatment.

## H. Stacking and notification storms

Test what happens when several events arrive close together.

Look for:

```text
multiple stacked toasts obscuring controls
duplicate realtime + local notifications
the same event announced twice
repeated notifications after reconciliation/refresh
notifications reappearing after navigation
multiple success toasts from one user action
```

Identify deduplication requirements.

A single semantic event should normally produce one user-facing notification.

## I. Notification actions

If a notification has an associated next action, assess whether it should provide a direct action such as:

```text
Review
Open proposal
View RFI response
Edit returned artifact
Retry
```

Do not add actions to every toast.

Use them only where they reduce navigation and the destination is unambiguous.

Action labels must follow the same canonical vocabulary as the rest of the interface.

## J. Accessibility of notifications

Verify:

- important transient notifications use an appropriate live region;
- routine updates do not interrupt the user unnecessarily;
- critical alerts are announced appropriately;
- a screen reader receives a complete sentence that makes sense without visual context;
- focus is not unexpectedly stolen by routine toasts;
- keyboard users can dismiss persistent notifications;
- dismiss controls have accessible names;
- notification meaning is not color-only;
- notifications remain readable at 200% zoom;
- reduced-motion settings are respected for notification transitions.

Do not use `role="alert"` for every message.

Reserve assertive announcement behavior for messages that genuinely require immediate attention.

## K. Toast placement and obstruction

Inspect notification placement on every supported viewport.

Verify that toasts do not cover:

```text
primary buttons
modal actions
timer controls
navigation
form validation
White Cell review controls
Facilitator presentation controls
```

Pay special attention to small screens and stacked messages.

## L. Inline validation versus toast validation

Field-level validation errors should normally appear with the field and in an error summary where applicable.

Do not rely on a toast such as:

```text
Please complete all required fields
```

as the only validation feedback.

A toast may supplement validation but should not replace contextual errors.

## M. Notification audit deliverable

Add a dedicated notification inventory to `PLENUM_INTERFACE_AUDIT.md`:

| Location / trigger | Role | Current message | Surface | Severity | Duplicate of visible state? | Problem | Recommended message / treatment | Persistence | Action |
|---|---|---|---|---|---:|---|---|---|---|

Also add a notification event map:

| Semantic event | Canonical user message pattern | Surface | Severity | Duration/persistence | Direct action | Durable representation |
|---|---|---|---|---|---|---|

The audit must identify:

- duplicate notifications;
- notification storms;
- incorrect severity;
- backend copy leakage;
- inconsistent verbs;
- inappropriate colors;
- missing durable state;
- missing live-region behavior;
- unnecessary success toasts;
- actionable messages without a path to the relevant screen.

---

# 22. INFORMATION DENSITY

Do not solve clutter by turning everything into giant cards or hiding everything behind modals.

PLENUM is a professional simulation platform and legitimately contains dense information.

Prefer:

```text
clear hierarchy
alignment
tables
lists
compact metadata
progressive disclosure
consistent spacing
```

over:

```text
nested cards
card grids
large decorative headers
repeated descriptions
multiple badges
large empty spaces
```

---

# 22. COMPONENT CONSISTENCY

Inventory recurring components.

Examples:

```text
buttons
artifact cards
status badges
tabs
modals
detail grids
forms
timeline entries
review cards
alerts
empty states
role badges
team indicators
```

Identify near-duplicates.

Produce a component consolidation table:

| Current components/patterns | Same function? | Recommended canonical component | Changes |
|---|---:|---|---|

Do not refactor components purely because their implementation differs.

Consolidate when their user-facing function is the same.

---

# 23. SCREEN-BY-SCREEN FIVE-SECOND TEST

For every major screen answer:

```text
1. What is this screen for?
2. What can the user do here?
3. What requires attention?
4. What changed?
```

If any answer is not obvious from a five-second inspection, flag the screen.

Do not rely on onboarding instructions to compensate for bad hierarchy.

---

# 24. INTERACTION-PATH AUDIT

For common tasks, count user interactions.

Examples:

```text
create action
edit draft
forward artifact
submit to White Cell
review artifact
return for revision
resubmit
send RFI
respond to proposal
inspect revision history
change move/phase
```

Identify:

- unnecessary intermediate dialogs;
- duplicate confirmations;
- screens where users must reread repeated instructions;
- ambiguous buttons;
- hidden next actions.

Do not change workflows during this audit unless the interface itself is creating unnecessary steps.

---

# 25. FIRST PASS MUST BE AN AUDIT, NOT A MASS REWRITE

Before changing code, produce:

```text
PLENUM_INTERFACE_AUDIT.md
```

The report must contain the following sections.

## A. Executive summary

Identify the major UX problems discovered.

Group them into:

```text
backend/internal copy leakage
copy repetition
incorrect labels
terminology inconsistency
workflow verb inconsistency
color-semantic inconsistency
role-inappropriate information
weak hierarchy
component inconsistency
notification/toast inconsistency
accessibility issues
```

## B. Severity system

Classify findings:

### P0 — Misleading

The UI communicates something factually incorrect about system behavior.

Examples:

```text
button label does not match action
status label is wrong
wrong team/faction color
incorrect workflow description
```

### P1 — Confusing

Likely to cause user error or misunderstanding.

### P2 — Noisy

Redundant copy, unnecessary labels, excessive badges, repeated instructions.

### P3 — Polish

Minor wording, alignment, spacing, or consistency improvements.

## C. Screen inventory

Create:

| Screen / modal | Role | Purpose | Primary action | Problems |
|---|---|---|---|---|

## D. Copy inventory

Create:

| Location | Current copy | Problem | Recommended copy | Reason | Severity |
|---|---|---|---|---|---|

Do not summarize.

List concrete strings.

## E. Backend-copy leakage inventory

Create:

| Location | Visible internal term | Backend meaning | User-facing meaning | Action |
|---|---|---|---|---|

Action must be one of:

```text
hide
translate
move to details
operator-only
keep
```

## F. Repetition inventory

Create:

| Screen | Repeated concepts | Current occurrences | Recommended single presentation |
|---|---|---|---|

## G. Terminology map

Create:

| Concept | Variants currently used | Canonical user term | Canonical action verb |
|---|---|---|---|

## H. Color-semantic map

Create:

| Meaning | Current treatment | Conflict? | Recommended semantic role | Secondary non-color cue |
|---|---|---|---|---|

## I. Notification and feedback map

Create:

| Trigger / event | Current surface | Current copy | Severity | Necessary? | Durable elsewhere? | Recommended treatment |
|---|---|---|---|---:|---:|---|

Also identify all duplicate, conflicting, overly technical, inaccessible, or unnecessarily persistent notifications.

## J. Role visibility map

Create:

| Information | Participant | Scribe | Facilitator | Notetaker | White Cell | Admin |
|---|---|---|---|---|---|---|

Values:

```text
primary
secondary
on demand
hidden
```

## K. Component consolidation map

Identify duplicated or near-duplicated interface components.

## L. Priority remediation plan

Organize fixes into:

```text
Phase 1 — correctness
Phase 2 — clarity
Phase 3 — consistency
Phase 4 — polish
```

---

# 26. AFTER THE AUDIT

Do NOT immediately perform an uncontrolled platform-wide rewrite.

Convert findings into bounded implementation groups.

For example:

```text
Batch 1
Canonical workflow terminology

Batch 2
Backend copy removal

Batch 3
Artifact cards

Batch 4
Modal copy and hierarchy

Batch 5
Status and semantic colors

Batch 6
Role-specific visibility

Batch 7
Notifications, toasts, alerts, and live-region feedback

Batch 8
Error/empty/loading states
```

Each batch should be independently testable.

---

# 27. WHEN IMPLEMENTING FIXES

Prefer presentation-layer corrections.

For example:

```text
DO:
backend enum → presentation mapper → user label
```

rather than:

```text
DON'T:
rename database enum because the UI wording is poor
```

Likewise:

```text
DO:
central canonical vocabulary
```

rather than:

```text
DON'T:
manually replace twenty labels with slightly different strings
```

---

# 28. CREATE A CENTRAL PRESENTATION VOCABULARY

If the current architecture lacks one, recommend an appropriate bounded mechanism for canonical labels.

Conceptually:

```js
PLENUM_LABELS = {
    action: 'Action',
    proposal: 'Proposal',
    strategicOrientation: 'Strategic Orientation',
    rfi: 'Request for Information',

    workflow: {
        draft: 'Draft',
        forwarded_to_facilitator: 'Ready for facilitator review',
        submitted_to_white_cell: 'Submitted to White Cell',
        returned_to_team: 'Returned for revision',
        resubmitted: 'Resubmitted',
        adjudicated: 'Complete'
    }
}
```

These exact labels are NOT pre-approved.

Verify semantics first.

The important architectural rule is:

> UI labels should have a canonical presentation source rather than being recreated independently across screens.

---

# 29. PROTECT BACKEND STABILITY

This task is not permission to rename technical contracts.

Avoid unnecessary changes to:

```text
database columns
RPCs
artifact types
workflow enum values
audit event types
IDs
persistence contracts
RLS
migration history
```

A UX cleanup should not destabilize PLENUM's backend.

Use adapters, labels, selectors, mappings, and display models instead.

---

# 30. DO NOT OVER-MINIMALIZE

Do not remove:

- information necessary for a decision;
- provenance that materially affects trust;
- return notes;
- workflow state;
- decision consequences;
- deadlines;
- action ownership;
- meaningful distinctions between artifact types.

The target is:

> less noise, not less meaning.

---

# 31. DO NOT SUBSTITUTE ICONS FOR CLEAR WORDS

Icons may support recognition.

Do not replace essential labels with ambiguous icon-only controls merely to reduce copy.

A short correct label is better than an unexplained symbol.

---

# 32. CORRECT COLOR CODING

Pay particular attention to PLENUM's actor colors.

If Blue, Red, Green, Industry, White Cell, workflow state, warnings, errors, and success all use overlapping colors, identify and resolve those collisions.

Team identity and system status are different semantic dimensions.

For example:

```text
Red Team
```

must remain distinguishable from:

```text
Error / destructive / critical
```

using more than just hue.

Likewise:

```text
Green Team
```

must remain distinguishable from:

```text
Success / completed
```

Use labels, symbols, border/pattern treatments, or other semantic channels.

---

# 33. EXPECTED OUTCOME

After corrections, a user should be able to open any PLENUM screen and quickly understand:

```text
Where am I?

What am I looking at?

What state is it in?

What matters right now?

What can I do?

What happens if I do it?
```

without needing to understand:

```text
database architecture
artifact implementation
internal workflow enums
developer terminology
compatibility mechanisms
technical IDs
```

---

# 34. FINAL DELIVERABLES

Your first response after completing the review should contain:

## 1. Overall assessment

How coherent is the current PLENUM interface?

## 2. Ten highest-priority problems

Concrete, with screen/file references.

## 3. Incorrect or ambiguous labels

Current → recommended.

## 4. Backend/internal copy exposed to users

Location and proposed treatment.

## 5. Repeated copy

Specific examples and what should remain.

## 6. Terminology inconsistencies

Including workflow verbs.

## 7. Color-semantic problems

Including team/status collisions.

## 8. Role visibility problems

Things users see that should be operator/admin-only.

## 9. Notification/toast inconsistencies

Include duplicate notifications, backend copy, severity errors, color conflicts, persistence problems, accessibility issues, and recommended canonical message patterns.

## 10. Component inconsistencies

Duplicate UI patterns that should converge.

## 11. Recommended remediation sequence

Prioritized to minimize regression risk.

## 12. Files likely to change

Classify each as:

```text
CHANGE
EXTEND
DO NOT TOUCH
```

## 13. Risk assessment

Identify which suggested changes are:

```text
presentation-only
component-level
workflow-sensitive
backend-sensitive
```

## 14. `PLENUM_INTERFACE_AUDIT.md`

Create this file in the repository containing the full findings.

---

# 35. IMPORTANT OPERATING RULE

Do not judge the interface by whether the code is technically correct.

Judge it by whether the **user-facing representation of the system is correct**.

A technically accurate backend label can still be poor interface copy.

A complete database representation can still contain information a user should never see.

A sentence can be individually clear and still be harmful because the same point is repeated five times around it.

A visually attractive color can still be wrong because it conflicts with an established semantic role.

The objective is not cosmetic simplification.

The objective is:

> a coherent interface in which every visible word, label, color, component, and state helps the user understand the simulation and take the correct next action.
