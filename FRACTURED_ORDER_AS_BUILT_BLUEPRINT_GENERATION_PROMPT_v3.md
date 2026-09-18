# MASTER PROMPT — Build the Fractured Order As-Built Blueprint

**Version:** 3.0  
**Purpose:** Accurately and Precisely Reverse-engineer the current working Fractured Order repository into a version-pinned, implementation-neutral, machine-traceable and visually evidenced blueprint that can serve as the golden reference for Plenum Studio and Plenum Runtime development.

---

# 0. Non-Negotiable Blueprint Quality Prerequisites

Every statement, table, manifest entry, workflow, diagram, and parity requirement in the blueprint must satisfy **Clarity, Accuracy, and Precision**.

These are not editorial preferences. They are blueprint acceptance criteria.

## 0.1 Clarity

Ask:

> **Is the statement easy to understand and free from confusion?**

A blueprint statement is clear only if:

- it uses canonical terminology consistently;
- it avoids ambiguous pronouns such as "it", "they", or "this" when multiple objects are possible;
- it identifies the exact role, artifact, surface, route, component, table, or state being discussed;
- it distinguishes current behavior from future Plenum implications;
- it separates observed behavior from interpretation;
- it avoids unexplained abbreviations;
- it avoids vague phrases such as `handles`, `supports`, `manages`, `works with`, `as needed`, `where appropriate`, or `etc.` unless the actual behavior is immediately specified.

### Example — unclear

> The Facilitator handles Actions before White Cell.

### Example — clear

> When a Scribe forwards an Action, the Action becomes available in the assigned Facilitator's Team Action Review surface. The Facilitator can return the Action for revision or submit it to White Cell.

---

## 0.2 Accuracy

Ask:

> **Is the information true, correct, and free from errors?**

A blueprint statement is accurate only if:

- it is supported by executed behavior, source code, schema, configuration, test fixture, or current documentation;
- it cites the supporting source;
- it does not convert assumptions into facts;
- it does not silently reconcile conflicting sources;
- it uses the pinned repository commit as the implementation baseline;
- it does not describe intended behavior as current behavior unless verified;
- it distinguishes:
  - `OBSERVED`
  - `SOURCE-CONFIRMED`
  - `DOCUMENTED`
  - `INFERRED`
  - `UNVERIFIED`
  - `CONFLICTING`

If accuracy cannot be established, label the statement explicitly.

Do not write uncertain information as if it were settled.

---

## 0.3 Precision

Ask:

> **Are the details specific, exact, and detailed enough?**

A blueprint statement is precise only if it contains enough detail for a future architect or engineer to reproduce the relevant behavior without guessing.

Prefer exact:

- role names;
- route paths;
- component names;
- field labels;
- field types;
- state names;
- transition names;
- table names;
- column names;
- source file paths;
- database policies;
- seat limits;
- Move/Phase constraints;
- badge/count sources;
- access requirements;
- validation rules;
- timestamps;
- configuration values;
- plugin/model versions;
- asset filenames;
- commit SHA;
- evidence/event names.

### Example — imprecise

> Notetakers can save observations.

### Example — precise

> On the Notetaker Quick Capture surface, the user selects one of `Note`, `Key Moment`, or `Quote`, enters free-text content, and selects `Save Observation`. The saved capture is appended rather than replacing an earlier capture and is attributed to the Notetaker Seat.

---

# 0.4 Quality Rule for Every Blueprint Claim

Before accepting any important claim, verify:

```text
CLARITY
Can an unfamiliar engineer understand exactly what this means?

ACCURACY
Can the claim be traced to reliable evidence?

PRECISION
Could the behavior be reproduced without inventing missing details?
```

If any answer is **No**, the claim is not blueprint-ready.

---

# 0.5 Blueprint Statement Template

For important behavioral statements, use this structure where practical:

```text
Claim ID:
<stable CUR-* identifier>

Statement:
<clear, exact behavior>

Status:
OBSERVED | SOURCE-CONFIRMED | DOCUMENTED | INFERRED | UNVERIFIED | CONFLICTING

Classification:
METHODOLOGY-CORE | FO-CONFIGURATION | RUNTIME-DESIGN-SYSTEM | PARITY-UI | LEGACY/DEFECT

Evidence:
- <file/path:line or symbol>
- <database object>
- <executed route / role / fixture>
- <test / documentation>

Precision notes:
- Preconditions:
- Trigger:
- Actor:
- Result:
- Side effects:
- Evidence emitted:
- Exceptions:

Open issue:
<none or BASE-CONFLICT-###>
```

---

# 1. Role and Mission

You are acting as a:

- principal software architect (99% percentile with multiple years of experience working with compenies like Space-X and Anthropic);
- product archaeologist;
- simulation-systems analyst;
- QA engineer;
- data-model analyst;
- runtime interaction analyst;
- configuration-extraction specialist.

Your task is to reverse-engineer the current working **Fractured Order** application repository and produce a complete, version-pinned **Fractured Order As-Built Blueprint**.

The blueprint will serve as the golden reference for building **Plenum Studio**, a future system that must be able to reproduce Fractured Order through configuration rather than Fractured Order-specific Runtime code.

Do not redesign Fractured Order.

Do not improve Fractured Order.

Do not generalize prematurely.

Do not infer intended behavior when observable behavior, source code, configuration, fixtures, routes, database structures, or assets can answer the question.

Your first job is to establish:

> **What exactly does the current working Fractured Order application contain, how does it behave, how is it configured, and what must a generic Plenum Runtime be capable of reproducing?**

---

# 2. Golden-Reference Rule

Treat the current repository as a **read-only behavioral and implementation reference**.

Before analyzing anything:

1. Record:
   - repository name;
   - repository URL if available;
   - current branch;
   - exact Git commit SHA;
   - most recent tag if applicable;
   - package/application version if available;
   - capture timestamp;
   - runtime/build environment;
   - dependency-lockfile identity.

2. Create:

```text
/reference/fractured-order/
```

3. Do not modify application source code while producing the blueprint.

4. If changes are required merely to inspect/build/run it:
   - document them separately;
   - do not commit them into the golden baseline;
   - do not silently alter source behavior.

5. Never refer simply to "the current version."

Always identify the pinned commit.

---

# 3. Evidence Priority

When determining what Fractured Order actually does, use this evidence hierarchy:

```text
1. Executed behavior from the pinned application
2. Source code in the pinned repository
3. Database schema / policies / migrations / seed data
4. Automated tests / fixtures
5. Configuration files
6. Current playthrough / walkthrough documentation in the repo
7. Training documentation
8. Older design documentation
9. Comments / TODOs / historical intent
```

If two sources disagree:

- do not silently reconcile them;
- create a conflict record;
- identify both sources;
- describe the observable behavior;
- explain the architectural significance;
- mark the issue unresolved unless the repository itself establishes the answer.

Use IDs:

```text
BASE-CONFLICT-###
```

Every conflict record must itself satisfy Clarity, Accuracy, and Precision.

---

# 4. Core Principle

The blueprint must describe **observable product behavior and configuration**, not merely code structure.

This is insufficient:

> There is an Action component.

Instead determine:

```text
ACTION

Who can create it?
Which exact Role/Seat can create it?
Where is the creation control displayed?
What route/surface contains it?
What fields exist?
What labels are displayed?
Which fields differ by team?
Which fields are conditional?
What conditions reveal those fields?
What validation occurs?
Can it be saved as draft?
Which status is assigned after saving?
Who receives it?
Who reviews it?
Can it be returned?
How are revisions stored?
Who submits it to White Cell?
What does White Cell see?
Does PLI consume it?
What state changes can result?
Which events/evidence are generated?
Which badges/counters change?
What appears in revision history?
What happens on error or retry?
```

Perform this level of analysis for every major runtime object.

---

# 5. Required Classification

Every captured behavior or interface requirement must receive one of these classifications.

## 5.1 METHODOLOGY-CORE

Fundamental to the SSG simulation methodology and therefore a capability generic Plenum must support.

Potential examples:

- Strategic Orientation;
- Action;
- Proposal;
- RFI;
- Observation;
- Scribe → Facilitator → White Cell workflow.

Do not assume an item belongs here merely because it currently exists.

## 5.2 FO-CONFIGURATION

Specific to Fractured Order but reproducible through generic Plenum configuration.

Potential examples:

- Blue / Red / Green / Industry;
- specific Action fields;
- specific SME roles;
- specific Move structure;
- Fractured Order branding.

## 5.3 RUNTIME-DESIGN-SYSTEM

Reusable runtime interaction/layout behavior that appears to define how Plenum simulation interfaces should work.

Potential examples:

- role indicator;
- left navigation;
- Move/Phase/Timer chrome;
- status pills;
- modal behavior;
- runtime workspace layout;
- notification counters.

Only classify after inspecting repeated implementation patterns.

## 5.4 PARITY-UI

A visual/interaction behavior that should initially be reproduced for Fractured Order parity but need not become universal Plenum doctrine.

## 5.5 LEGACY/DEFECT

Current behavior that appears accidental, obsolete, inconsistent, broken, duplicated, or inappropriate for promotion into target architecture.

Do not delete it from the blueprint.

Document it explicitly.

---

# 6. Stable Current-Behavior IDs

Create stable identifiers for extracted behavior:

```text
CUR-ACCESS-###
CUR-BRAND-###
CUR-UI-###
CUR-SURFACE-###
CUR-ROLE-###
CUR-ART-###
CUR-MODAL-###
CUR-WF-###
CUR-INFO-###
CUR-STATE-###
CUR-MOVE-###
CUR-PLUGIN-###
CUR-EVID-###
CUR-DATA-###
CUR-AUTH-###
CUR-ASSET-###
```

These IDs must remain stable after initial publication.

---

# 7. Required Deliverables

Create the following structure:

```text
/reference/fractured-order/
│
├── FRACTURED_ORDER_AS_BUILT_BLUEPRINT.md
├── BASELINE_MANIFEST.yaml
├── CLASSIFICATION_REGISTER.yaml
├── CONFLICT_REGISTER.md
├── TRACEABILITY_MATRIX.md
├── RUNTIME_SURFACE_INVENTORY.md
├── RUNTIME_MODULE_INVENTORY.md
├── MODAL_INVENTORY.md
├── ROLE_CAPABILITY_MATRIX.md
├── NAVIGATION_MATRIX.md
├── INFORMATION_FLOW_MATRIX.md
├── WORKFLOW_REGISTRY.md
├── PARITY_REQUIREMENTS.md
├── CONFIGURATION_LOSS_RISK.md
├── BLUEPRINT_COVERAGE_REPORT.md
├── BLUEPRINT_QUALITY_REPORT.md
│
├── manifests/
│   ├── branding.yaml
│   ├── access.yaml
│   ├── navigation.yaml
│   ├── runtime-chrome.yaml
│   ├── moves-phases.yaml
│   ├── state.yaml
│   ├── plugins.yaml
│   ├── evidence.yaml
│   ├── data-model.yaml
│   └── assets.yaml
│
├── surfaces/
│   ├── public-entry.yaml
│   ├── scribe.yaml
│   ├── facilitator.yaml
│   ├── notetaker.yaml
│   ├── white-cell.yaml
│   └── sme.yaml
│
├── artifacts/
│   ├── strategic-orientation.yaml
│   ├── action.yaml
│   ├── proposal.yaml
│   ├── rfi.yaml
│   ├── response.yaml
│   ├── communication.yaml
│   └── observation.yaml
│
├── workflows/
│   ├── strategic-orientation.yaml
│   ├── action.yaml
│   ├── proposal.yaml
│   ├── rfi-response.yaml
│   ├── communication.yaml
│   ├── observation.yaml
│   ├── move-phase.yaml
│   └── adjudication.yaml
│
├── modals/
│   ├── strategic-orientation.yaml
│   ├── action.yaml
│   ├── proposal.yaml
│   ├── rfi.yaml
│   ├── response.yaml
│   ├── communication.yaml
│   └── other-current-modals.yaml
│
├── fixtures/
│   └── README.md
│
├── screenshots/
│   ├── SCREENSHOT_INDEX.md
│   ├── SCREENSHOT_CAPTURE_STANDARD.md
│   ├── public-entry/
│   ├── scribe/
│   │   ├── surfaces/
│   │   ├── modals/
│   │   ├── states/
│   │   └── errors-empty-loading/
│   ├── facilitator/
│   │   ├── surfaces/
│   │   ├── modals/
│   │   ├── states/
│   │   └── errors-empty-loading/
│   ├── notetaker/
│   │   ├── surfaces/
│   │   ├── modals/
│   │   ├── states/
│   │   └── errors-empty-loading/
│   ├── white-cell/
│   │   ├── surfaces/
│   │   ├── modals/
│   │   ├── states/
│   │   └── errors-empty-loading/
│   ├── sme/
│   │   ├── surfaces/
│   │   ├── modals/
│   │   ├── states/
│   │   └── errors-empty-loading/
│   └── metadata/
│       └── <screenshot-id>.yaml
│
└── parity-tests/
    ├── CONFIGURATION_PARITY.md
    ├── BEHAVIORAL_PARITY.md
    ├── VISUAL_PARITY.md
    └── END_TO_END_PARITY.md
```

Do not create empty ceremonial files.

The `screenshots/` tree is a **required blueprint evidence set**, not optional documentation.

Every material runtime surface, interface mode, modal, workflow state, and operator/SME surface must have one or more corresponding screenshots unless it is technically impossible to render. Any impossible capture must be recorded as `UNVERIFIED-VISUAL` with a reason.

If a requested file truly does not apply, state why in the main blueprint.

---

# 8. Phase A — Repository Archaeology

Before documenting behavior, map the repository.

Inspect:

```text
package.json / lockfiles
source directories
routes
components
pages
layouts
hooks
services
Supabase clients
database schema
migrations
RLS policies
edge functions
API handlers
environment configuration
assets
public files
plugins
PLI code
tests
fixtures
seed data
docs
README files
build scripts
deployment configuration
GitHub Actions
```

Produce a repository map.

For every major directory/module identify:

```text
Purpose
Runtime responsibility
Primary consumers
Key dependencies
Persistence touched
Current simulation-specific coupling
Potential Plenum abstraction
Evidence source
Verification status
```

Do not produce target architecture yet.

---

# 9. Phase B — Build and Run the Application

If possible, run the pinned application locally.

Document precisely:

```text
Prerequisites
Runtime version
Environment variables
Database requirements
Seed/setup
Commands
URLs
Accounts/codes required
Build output
Known setup issues
```

Walk through every accessible role.

Capture exact behavior.

If an area cannot be executed, mark it:

```text
UNVERIFIED-RUNTIME
```

and rely on source inspection while clearly distinguishing that evidence.

Do not imply runtime verification where none occurred.

---

# 10. Public Entry Surface

Reverse-engineer the complete landing/entry page.

## Branding

Capture:

- SSG logo;
- simulation logo/name;
- subtitle;
- hero/background asset;
- typography;
- colors;
- visual composition;
- `Delivered on Plenum` attribution;
- footer;
- responsive behavior.

For each asset include the exact source path.

## Participant entry

Capture exactly:

- Session Code field;
- Display Name field;
- Team choices;
- Role choices;
- helper text;
- seat capacity behavior;
- validation;
- error states;
- loading states;
- successful transition.

Record exact team labels and Role labels.

## Operator entry

Capture:

- expansion behavior;
- required credentials;
- Game Master access;
- WC Lead access;
- differences between those paths.

## SME entry

Capture:

- available SME roles;
- required credentials;
- access rules;
- destination surface.

Create:

```text
surfaces/public-entry.yaml
manifests/branding.yaml
manifests/access.yaml
```

---

# 11. Global Runtime Chrome

Determine which runtime UI elements are common across Roles.

Inspect:

- Role indicator;
- status dot;
- Move indicator;
- Phase indicator;
- timer;
- pause state;
- dark-mode control;
- notification/mute controls;
- Present;
- Refresh;
- Logout;
- Session identity;
- collapsible navigation;
- persistent footer/start-here elements.

Determine for each:

```text
Exact label
Exact location
Always visible?
Role-dependent?
Phase-dependent?
White-Cell controlled?
Participant controlled?
Purely visual?
Research relevant?
Source implementation
```

Create:

```text
manifests/runtime-chrome.yaml
```

---

# 12. Role Surface Inventory

Inspect every Role-specific runtime.

At minimum:

```text
Scribe
Facilitator
Notetaker
White Cell
Every current SME Role
```

For each capture precisely:

```text
Surface ID
Role
Route
Navigation
Default route
Available modules
Counters/badges
Counter data source
Allowed actions
Information visibility
Move/Phase-dependent visibility
Modals available
Notifications
Runtime controls
Empty states
Loading states
Error states
Session context
Source files
Verification status
```

Create:

```text
surfaces/<role>.yaml
ROLE_CAPABILITY_MATRIX.md
NAVIGATION_MATRIX.md
```

---

# 13. Scribe Surface

Inspect every Scribe module.

Current examples may include:

- Actions;
- RFIs;
- Responses;
- Received Proposals;
- Tribe Street Journal;
- Verba AI Population Sentiments;
- Timeline;
- Quick Capture;
- Strategic Orientation;
- Take Action.

Do not assume these names are current until verified.

For each navigation item determine:

```text
Exact label
Route/component
Purpose
Visibility rule
Badge source
Badge count behavior
List behavior
Detail behavior
Modal behavior
Underlying data
Role authorization
Evidence emitted
Move/Phase dependency
```

---

# 14. Facilitator Surface

Inspect precisely:

- Team Action Review;
- Deck;
- RFIs;
- Communications;
- Notifications;
- Present;
- Facilitator deck behavior;
- live team-decision integration;
- slide navigation;
- loading behavior;
- review controls;
- return controls;
- submission controls.

Classify each behavior using the required classification scheme.

---

# 15. Notetaker Surface

Inspect:

- Quick Capture;
- Team Dynamics;
- Alliance Tracking;
- View Actions;
- Inbox;
- Timeline.

For Quick Capture determine exactly:

```text
Types:
- Note
- Key Moment
- Quote

Field labels
Default selection
Content field
Save button label
Save behavior
Shared/team behavior
Append semantics
Seat attribution
Recent captures
Move association
Evidence storage
Empty-state wording
```

Do not reduce this to a generic Observation object without documenting current semantics first.

---

# 16. White Cell Surface

Perform a complete inventory.

Inspect all navigation modules, including if currently present:

- Simulation Settings;
- Strategic Orientation;
- Actions;
- Proposals;
- Red Actions;
- Returned / Revision History;
- PLI Adjudication;
- Diplomacy & Information;
- NI & Escalation;
- PLI Reports;
- PLI SME Efficacy;
- Tribe Street Journal;
- Verba AI Population Sentiments;
- RFI;
- Communications;
- Session Timeline.

Inspect Simulation Settings tabs precisely:

```text
Game Controls
Sessions
Participants
Scribe Decks
Plugins
Export Data
```

For Game Controls capture:

```text
Move-control labels
Current Move display
Phase-control labels
Current Phase display
Timer format
Start control
Pause control
Reset control
Time allocation fields
Previous / next behavior
Strategic Orientation gate
Move advance conditions
Reset behavior
Save behavior
Permissions
Evidence emitted
```

This is a major parity surface.

---

# 17. SME Surfaces

Identify every current SME Role.

Capture:

```text
Exact Role name
Entry method
Route
Navigation
Information access
Artifacts visible
Actions permitted
PLI/model access
Adjudication responsibilities
White Cell relationship
Underlying data
Source files
```

Do not merge SME and White Cell behavior unless the current app actually does so.

---

# 18. Artifact Semantic Contracts

For each artifact create a complete semantic contract.

Required artifacts:

```text
Strategic Orientation
Action
Proposal
RFI
Response
Communication
Observation
```

Also capture any additional current artifact-like object.

Each YAML file must contain:

```yaml
artifact_id:
display_name:
classification:
verification_status:

purpose:

timing:
  moves:
  phases:
  gates:

variants:

fields:
  - id:
    label:
    type:
    required:
    condition:
    options:
    default:
    validation:
    display_order:

permissions:
  create:
  edit:
  review:
  return:
  submit:
  adjudicate:
  view:

workflow:
routing:
visibility:
notifications:
runtime_surfaces:
modals:
state_implications:
plugin_implications:
evidence_emitted:
revision_history:
export_behavior:
source_locations:
parity_requirements:
open_conflicts:
```

Do not invent missing fields.

---

# 19. Action Deep Dive

Determine exactly:

- every Action variant;
- Blue-specific fields;
- Red-specific fields;
- Green-specific fields;
- Industry-specific fields;
- conditional fields;
- conditions controlling them;
- implementation/legislative fields;
- supply-chain controls;
- coordination controls;
- informed/engaged controls;
- submit behavior;
- revise behavior;
- resubmit behavior;
- current status values;
- Move association;
- White Cell handling;
- PLI integration;
- visible revision number;
- counters/badges.

Capture screenshots and source references where possible.

---

# 20. Strategic Orientation Deep Dive

Determine exactly:

- Role responsible for drafting;
- Facilitator review behavior;
- White Cell behavior;
- team-specific field differences;
- forecasting requirements;
- return/revision behavior;
- Move 1 gate;
- completion state;
- interface changes after completion;
- current counters/status;
- current routing.

---

# 21. Proposal Deep Dive

Determine exactly:

- author;
- Facilitator workflow;
- White Cell approval;
- recipient selection;
- recipient Facilitator behavior;
- Accept behavior;
- Not Interested behavior;
- Negotiate behavior;
- append-only negotiation history;
- finality/read-only rules;
- relation to Actions;
- whether an accepted Proposal mutates another artifact;
- notifications;
- badge counts;
- revision/history behavior.

---

# 22. RFI / Response Deep Dive

Capture exactly:

- initiating Roles;
- `Question`;
- `Priority`;
- `Categories`;
- `Context`;
- validation;
- pending state;
- White Cell queue;
- response workflow;
- answer delivery;
- counter/badge behavior;
- timeline/evidence;
- empty states.

If documentation and runtime disagree over whether Scribe or Facilitator owns RFI creation:

- create `BASE-CONFLICT-###`;
- identify both sources;
- do not choose silently.

---

# 23. Communications Deep Dive

Capture:

- sender Roles;
- recipient selectors;
- All Teams;
- Facilitators;
- Scribes;
- selected teams/Roles if supported;
- exact message fields;
- persistence;
- counters;
- delivery behavior;
- notification behavior;
- read state if supported;
- timeline/evidence.

This will become part of the baseline for future audio Communication Plugins.

---

# 24. Modal Inventory

Inspect every modal/dialog/drawer/popover that performs meaningful workflow.

For each create:

```yaml
modal_id:
artifact_or_module:
trigger:
eligible_roles:
title:
description:
fields:
validation:
buttons:
button_order:
draft_behavior:
submit_behavior:
return_behavior:
close_behavior:
error_behavior:
loading_behavior:
resulting_state_transition:
evidence_emitted:
source_files:
classification:
verification_status:
screenshots:
  default: []
  validation: []
  conditional_states: []
  role_variants: []
  returned_or_revision: []
```

At minimum inspect modals for:

```text
Strategic Orientation
Action
Proposal
RFI
Response
Communication
Observation
White Cell adjudication
Session controls
```

Also capture confirmation dialogs.

---

# 25. Workflow State Registry

Build state machines from actual code and observed behavior.

For every workflow record:

```text
State
Exact stored value if known
Transition
Triggering Role
Triggering control/button
Precondition
Validation
Side effect
Recipient
Notification
Evidence
Terminal?
Reversible?
Source
Verification status
```

Create diagrams in Markdown/Mermaid.

Do not infer transitions merely from UI labels if backend code contradicts them.

---

# 26. Information Flow Matrix

For every significant artifact/event capture:

```text
Source
Trigger
Destination
Visibility
Timing
Notification
Badge
Response path
Exposure implications
Evidence
Source implementation
```

Use actual behavior only.

---

# 27. Moves, Phases, and Timer

Reverse-engineer exactly:

```text
Strategic Orientation
Move 1
Move 2
Move 3 if present
Finalization
all current Phase values
```

Determine:

- exact Move numbering;
- exact Phase enumeration;
- exact UI labels;
- Move advancement;
- Phase advancement;
- timer source;
- timer format;
- pause;
- start;
- reset;
- time allocations;
- current gates;
- controlling Role;
- client update behavior;
- evidence persistence.

Separate current behavior from future Plenum authoritative-clock requirements.

---

# 28. State Model

Identify every current state-like variable used by:

- White Cell;
- PLI;
- SMEs;
- participant displays;
- decks;
- sentiment modules;
- adjudication.

Determine whether each is:

```text
persistent database state
derived value
plugin/model output
display-only state
hard-coded value
configuration value
```

Record exact source and type.

---

# 29. Plugin / Model Inventory

Identify every current model/module/plugin-like capability.

At minimum investigate:

```text
PLI
Verba AI
Tribe Street Journal
PLI SME Efficacy
PLI Reports
Diplomacy & Information
NI & Escalation
```

For each determine:

```text
Exact current name
Route/surface
Source files
Data consumed
Data produced
Is it truly a Plugin?
Hard-coded runtime feature?
Dataset?
External integration?
Static content?
Model?
Analysis surface?
SME surface?
```

Do not force current architecture into future Plugin terminology.

Document what it actually is first.

---

# 30. Data Architecture

Map current persistence.

Inspect all:

```text
tables
views
functions
triggers
RLS policies
storage buckets
realtime subscriptions
local storage
session storage
URL state
client state
edge functions
API routes
```

For each domain object identify:

```text
table/object
exact schema name
primary key
foreign keys
session ownership
team/role ownership
mutable fields
immutable fields
revision behavior
timestamps
RLS
writers
readers
realtime subscribers
deletion behavior
```

Create:

```text
manifests/data-model.yaml
```

---

# 31. Authentication and Authorization

Reverse-engineer all access control.

Capture exactly:

```text
participant entry
Session Codes
display-name handling
team selection
role selection
seat limits
operator access
Game Master
WC Lead
SME access
access codes
Supabase Auth if used
RLS
frontend guards
backend/database enforcement
```

Distinguish:

```text
UI restriction
actual authorization
database enforcement
server-side enforcement
```

Do not assume hiding a button equals authorization.

---

# 32. Branding and Assets

Create a complete asset inventory.

At minimum:

```text
SSG logo
Fractured Order logo / title treatment
hero image
icons
deck assets
media
fonts referenced
team assets
simulation documents
inject media
```

Record:

```text
file
path
purpose
format
dimensions
where used
runtime/studio
hash/checksum
classification
```

Do not redistribute licensed font files merely as part of documentation.

Record references/metadata instead.

---

# 32A. Mandatory Screenshot Evidence Set

The blueprint folder must include **actual screenshots of the pinned Fractured Order interface**.

Screenshots are required for:

- interface modes;
- role surfaces;
- navigation states;
- list views;
- detail views;
- modal/dialog/drawer states;
- draft/review/returned/submitted/adjudicated states;
- Move/Phase states;
- empty states;
- loading states;
- error states;
- disabled/locked states;
- counters/badges where behavior matters;
- White Cell control states;
- SME surfaces;
- landing/entry modes;
- operator access;
- SME access;
- major Plugin/model views;
- responsive layouts where materially different.

Screenshots are evidence of the current implementation and must not be mockups.

---

## 32A.1 Screenshot IDs

Assign stable IDs:

```text
SHOT-ENTRY-###
SHOT-SCRIBE-###
SHOT-FAC-###
SHOT-NOTE-###
SHOT-WC-###
SHOT-SME-###
SHOT-MODAL-###
SHOT-STATE-###
SHOT-ERROR-###
```

Each screenshot filename must begin with its stable ID.

Example:

```text
SHOT-SCRIBE-012_actions_move2_finalization.png
SHOT-MODAL-007_blue_action_create_supply-chain-expanded.png
SHOT-WC-021_game-controls_move2_paused.png
```

---

## 32A.2 Screenshot Metadata Sidecar

Every screenshot must have a matching YAML metadata file under:

```text
screenshots/metadata/
```

Example:

```yaml
screenshot_id: SHOT-SCRIBE-012
file: scribe/surfaces/SHOT-SCRIBE-012_actions_move2_finalization.png

baseline:
  commit_sha: <sha>
  captured_at: <timestamp>
  environment: <local/staging/current-live>

runtime:
  url_or_route: <route>
  viewport:
    width: 1440
    height: 1000

identity:
  role: Scribe
  team: Blue
  seat: <if known>

session:
  fixture: GOLDEN-FIXTURE-001
  session_code: <redacted-or-fixture>
  move: 2
  phase: Finalization

surface:
  module: Actions
  mode: list
  state: active

visible_contracts:
  - left_navigation
  - move_tabs
  - action_cards
  - take_action_button
  - counters

related_requirements:
  - CUR-SURFACE-###
  - CUR-UI-###
  - CUR-ART-###

source_refs:
  - <source path/component>

verification_status: OBSERVED
notes: <optional>
```

Do not store real secrets, access codes, personal information, or production participant data in screenshot metadata.

---

## 32A.3 Screenshot Capture Reproducibility

A screenshot must be reproducible.

Every capture must identify:

- exact Git commit;
- runtime/build environment;
- viewport;
- route;
- Role;
- team;
- fixture/data state;
- Move;
- Phase;
- modal/state being shown.

Where practical, use the deterministic Golden Fixture.

Do not rely on uncontrolled live-production data for the canonical screenshot baseline.

---

## 32A.4 Screenshot Index

Create:

```text
screenshots/SCREENSHOT_INDEX.md
```

The index must contain:

| Screenshot ID | Surface | Role | Mode/State | Move/Phase | Related contract | File |
|---|---|---|---|---|---|---|

The index must make it possible to find the visual evidence for every critical surface or modal without browsing folders manually.

---

## 32A.5 Screenshot Coverage Matrix

The screenshot index must include a coverage section with:

```text
CAPTURED
PARTIAL
UNVERIFIED-VISUAL
NOT-APPLICABLE
```

At minimum evaluate visual coverage for:

### Public Entry
- default landing page;
- participant join mode;
- team selection;
- Role selection;
- operator access collapsed;
- operator access expanded;
- SME access collapsed;
- SME access expanded;
- validation/error state;
- mobile/responsive state if materially different.

### Scribe
- default/overview;
- Strategic Orientation;
- Actions list;
- Action detail;
- Action create modal;
- Action conditional-field expansion;
- RFIs;
- RFI create modal;
- Responses;
- Received Proposals;
- Proposal detail/response if available;
- Timeline;
- Move/Phase variations;
- returned/revision state;
- empty/loading/error state.

### Facilitator
- default/overview;
- Team Action Review;
- Action review modal;
- returned Action;
- revised Action;
- Deck;
- Present mode if visually distinct;
- RFIs;
- Communications;
- Notifications;
- empty/loading/error state.

### Notetaker
- default/overview;
- Quick Capture;
- Note mode;
- Key Moment mode;
- Quote mode;
- recent captures;
- Team Dynamics;
- Alliance Tracking;
- View Actions;
- Inbox;
- Timeline;
- empty/loading/error state.

### White Cell
- default shell;
- Simulation Settings;
- Game Controls;
- each Move state;
- each Phase state;
- timer running;
- timer paused;
- timer/reset/extension controls if present;
- Strategic Orientation queue;
- Actions;
- Proposals;
- returned/revision history;
- PLI Adjudication;
- PLI reports;
- RFI;
- Communications;
- Session Timeline;
- Participants;
- Sessions;
- Scribe Decks;
- Plugins;
- Export Data;
- critical confirmation modals;
- empty/loading/error state.

### SME
- each distinct SME Role landing surface;
- each meaningful analysis/adjudication surface;
- read-only vs action-enabled states;
- empty/loading/error state.

### Modals
Every modal listed in `MODAL_INVENTORY.md` must have:
- default/open state;
- validation state;
- conditional-field state where applicable;
- populated state;
- role-specific variant where behavior differs;
- confirmation state where applicable.

---

## 32A.6 Interface Modes

For each surface, identify visual **modes**, not just pages.

Examples:

```text
CREATE
EDIT
VIEW
REVIEW
RETURNED
REVISION
SUBMITTED
PENDING
ANSWERED
NEGOTIATION
ADJUDICATION
READ_ONLY
LOCKED
PAUSED
LOADING
EMPTY
ERROR
```

If two modes are visually or behaviorally distinct, capture them separately.

The blueprint must not treat a single screenshot of a page as complete evidence for a multi-state workflow.

---

## 32A.7 Modal Screenshot Contract

Every modal in `MODAL_INVENTORY.md` must reference screenshot IDs.

The modal YAML must include:

```yaml
screenshots:
  default:
    - SHOT-MODAL-###
  validation:
    - SHOT-MODAL-###
  conditional_states:
    - SHOT-MODAL-###
  role_variants:
    - SHOT-MODAL-###
  returned_or_revision:
    - SHOT-MODAL-###
```

If a state does not exist, explicitly state `NOT-APPLICABLE`.

---

## 32A.8 Surface Screenshot Contract

Every Role surface YAML must include:

```yaml
screenshots:
  default:
    - SHOT-...
  modes:
    - mode: <name>
      screenshot_ids:
        - SHOT-...
  modals:
    - modal_id: <id>
      screenshot_ids:
        - SHOT-...
  empty_states:
    - SHOT-...
  loading_states:
    - SHOT-...
  error_states:
    - SHOT-...
```

---

## 32A.9 Screenshot Quality

Screenshots must be:

- readable;
- uncropped where cropping would remove context;
- captured at a documented viewport;
- free of unrelated desktop/window chrome where practical;
- free of real passwords/access codes;
- free of unnecessary personal participant information;
- representative of the pinned application;
- linked to source requirements.

Do not manipulate screenshots to make the current UI appear cleaner than it is.

The blueprint documents the current system, including awkward or inconsistent states.

---

## 32A.10 Visual Evidence Rule

A screenshot proves:

> **what was visibly rendered under a specified state.**

A screenshot does **not**, by itself, prove:

- authorization;
- persistence;
- workflow transition semantics;
- database state;
- routing;
- evidence emission.

Those claims must still be supported by source/runtime/database evidence.

---

# 33. Visual Runtime Baseline

Create screenshots for representative states if execution is possible.

This section summarizes the screenshot evidence set defined in §32A. The full screenshot corpus is mandatory; the list below is the minimum critical baseline, not the complete capture requirement.

At minimum:

```text
Landing Page
Scribe / Actions
Scribe / RFI
Scribe / Proposal
Facilitator / Deck
Facilitator / Action Review
Notetaker / Quick Capture
White Cell / Settings
White Cell / Actions
White Cell / PLI
White Cell / RFI
White Cell / Communications
SME representative view
```

Capture with each screenshot:

```text
viewport width
viewport height
Role
Team
Session fixture
Move
Phase
route
data fixture
commit SHA
timestamp
```

Screenshots are parity evidence, not the primary specification.

---

# 34. Deterministic Golden Fixture

Construct or identify a deterministic fixture representing a meaningful Session state.

Prefer a fixture that includes:

```text
Move 2
Finalization or equivalent phase

Blue Scribe:
2 Actions
2 RFIs
17 Responses
1 Received Proposal

Facilitator:
Action awaiting review
Deck available

Notetaker:
one or more observations

White Cell:
pending Action
pending RFI
Proposal
PLI output
current State
```

Do not fabricate application states the current schema cannot support.

Document exactly how the fixture is seeded.

---

# 35. Parity Test Specification

Create four distinct parity categories.

## 35.1 Configuration parity

Verify that generic Plenum configuration can represent:

- Tenant/runtime branding;
- landing page;
- teams;
- Roles;
- seat capacities;
- access paths;
- navigation;
- artifacts;
- fields;
- variants;
- routes;
- Moves;
- Phases;
- Plugins;
- State;
- surveys.

Use:

```text
TEST-CONFIG-###
```

## 35.2 Behavioral parity

For every critical workflow write Given/When/Then tests.

Use:

```text
TEST-BEHAVIOR-###
```

Every test must be:

- clear;
- source-supported;
- specific enough to automate.

## 35.3 Visual parity

Use:

```text
TEST-VISUAL-###
```

Verify:

- layout family;
- navigation;
- major controls;
- Role identity;
- cards/forms/modals;
- global runtime chrome;
- landing-page composition.

Do not require permanent pixel-perfect identity unless explicitly stated.

## 35.4 End-to-end parity

Use:

```text
TEST-E2E-###
```

At minimum:

```text
enter simulation
select team
select role
submit Strategic Orientation
complete gate
advance Move
create Action
Facilitator reviews
submit RFI
White Cell answers
create Proposal
recipient responds
create Observation
run PLI
adjudicate
change state
advance phase/move
export/session evidence
```

---

# 36. Runtime Surface Inventory

Create an exhaustive table:

| Surface | Role | Route | Modules | Major actions | Runtime-specific? | Verification |
|---|---|---|---|---|---|---|

This must be exhaustive.

---

# 37. Runtime Module Inventory

Create a module catalog independent of Roles.

Potential modules include:

```text
Actions
Strategic Orientation
Proposal
RFI
Response
Communication
Observation
Timeline
Deck
Session Controls
Move Control
Phase Control
Timer
Participants
Plugins
Export
PLI Adjudication
```

For each determine:

```text
Module ID
Exact label
Roles using it
Surface(s)
Route
Data
Commands
Modals
Navigation
Permissions
Evidence
Phase dependencies
Source files
Verification status
```

---

# 38. Configuration Extraction

After documenting current behavior, determine which runtime behaviors can be represented as configuration.

Create:

```text
CURRENT_IMPLEMENTATION
→ CONFIGURABLE_RUNTIME_CONTRACT
```

Every extracted configuration concept must identify:

- source behavior;
- exact current value;
- future configuration concept;
- parity test.

Do not propose implementation architecture yet.

Only identify the configuration boundary.

---

# 39. Configuration-Loss Risk Register

Create:

```text
CONFIGURATION_LOSS_RISK.md
```

For each risk:

```text
Risk ID
Current behavior
Why it is easy to overlook
Source
Verification status
Impact
Required target capability
Parity test
Severity
```

Pay special attention to:

- conditional Action fields;
- team-specific variants;
- Strategic Orientation gate;
- Proposal negotiation history;
- RFI priority/category;
- badge counts;
- revision history;
- Role-specific navigation;
- Move/Phase visibility;
- White Cell timers;
- deck behavior;
- operator/SME access;
- landing-page branding;
- empty/loading/error states;
- modal variants;
- disabled/locked states;
- role-specific visual modes;
- White Cell control states;
- responsive states where materially different.

---

# 40. Main Blueprint Structure

`FRACTURED_ORDER_AS_BUILT_BLUEPRINT.md` must contain:

```text
1. Executive Summary
2. Blueprint Quality Standard
3. Baseline Identity
4. Repository Map
5. Runtime Architecture
6. Public Entry Experience
7. Global Runtime Shell
8. Role Model
9. Role Surface Inventory
10. Navigation Architecture
11. Strategic Orientation
12. Actions
13. Proposals
14. RFIs / Responses
15. Communications
16. Observations
17. Facilitator Deck
18. White Cell
19. SME Surfaces
20. Moves / Phases / Timing
21. State
22. PLI / Models / Current Extensions
23. Information Flows
24. Evidence Capture
25. Data Model
26. Authentication / Authorization
27. Branding / Assets
28. Modal Inventory
29. Workflow Registry
30. Runtime Module Inventory
31. Current Implementation Dependencies
32. Classification Register
33. Known Conflicts
34. Known Defects / Legacy Behavior
35. Configuration Extraction
36. Parity Requirements
37. Golden Fixtures
38. Visual Baseline
39. Screenshot Coverage Matrix
40. Configuration-Loss Risks
41. Implications for Plenum
42. Open Questions
43. Blueprint Quality Assessment
```

Section 40, `Implications for Plenum`, must remain descriptive.

Do not redesign target Plenum architecture in this document.

---

# 41. Source Citation Standard

Every important blueprint assertion must identify its evidence.

Use:

```text
Source:
- src/components/...
- src/pages/...
- supabase/migrations/...
- README...
- Executed behavior: <Role / route / fixture>
```

Where possible, cite:

```text
file path
symbol/function/component
table/policy name
route
line range
```

For YAML manifests include:

```yaml
source_refs:
  - src/...
  - supabase/...
```

No important behavioral claim should exist only because an agent inferred it.

---

# 42. Completeness Audit

Before declaring the blueprint complete, run a full repository audit.

Ask:

- Has every meaningful route been mapped?
- Has every simulation-specific component been classified?
- Has every simulation-related table/function/policy been mapped?
- Has every Role been captured?
- Has every navigation item been captured?
- Has every workflow modal/dialog been captured?
- Does every material interface surface have screenshot evidence?
- Does every distinct workflow/UI mode have screenshot evidence where visually meaningful?
- Does every modal have screenshot references?
- Are screenshot metadata sidecars complete?
- Does the Screenshot Index cover every critical surface?
- Has every runtime asset been inventoried?
- Has every research-relevant action been identified?
- Has every current model/integration been classified?
- Has every hard-coded simulation assumption been identified?
- Does every critical current behavior have a parity requirement/test?

Produce:

```text
BLUEPRINT_COVERAGE_REPORT.md
```

with:

```text
COMPLETE
PARTIAL
UNVERIFIED
CONFLICTING
MISSING
```

---

# 43. Blueprint Quality Audit

Create:

```text
BLUEPRINT_QUALITY_REPORT.md
```

Evaluate every major section against:

## Clarity

```text
0 = confusing or ambiguous
1 = understandable with interpretation
2 = clear and unambiguous
```

## Accuracy

```text
0 = unsupported / contradicted
1 = partially supported / inferred
2 = directly supported and correctly cited
```

## Precision

```text
0 = too vague to implement/reproduce
1 = partially specified
2 = sufficiently exact for reproduction
```

Each major section receives a score out of 6.

Minimum approval for every critical section:

```text
Clarity: 2
Accuracy: 2
Precision: 2
```

A critical section scoring below full marks cannot be considered complete.

---

# 44. Critical Blueprint Sections

The following require full Clarity/Accuracy/Precision scores:

- Public Entry;
- Scribe;
- Facilitator;
- Notetaker;
- White Cell;
- SME access;
- Strategic Orientation;
- Action;
- Proposal;
- RFI/Response;
- Communications;
- Observations;
- Modals;
- Workflows;
- Information Flow;
- Moves/Phases/Timer;
- Data Model;
- Authorization;
- PLI/model behavior;
- Branding/assets;
- Runtime module inventory;
- configuration extraction;
- parity requirements.

---

# 45. Quality Gates

The blueprint is complete only if all of the following are true:

- [ ] exact Git commit is pinned;
- [ ] application can be built/run or inability is documented;
- [ ] all routes are inventoried;
- [ ] all Roles are inventoried;
- [ ] all runtime surfaces are inventoried;
- [ ] all navigation items are inventoried;
- [ ] all major modules are inventoried;
- [ ] all workflow modals are inventoried;
- [ ] all protected artifacts have semantic contracts;
- [ ] team-specific variants are documented;
- [ ] all workflow states are mapped;
- [ ] all information routes are mapped;
- [ ] Move/Phase/timer behavior is mapped;
- [ ] White Cell is fully mapped;
- [ ] SME access/surfaces are mapped;
- [ ] PLI/model behavior is mapped;
- [ ] data model is mapped;
- [ ] authorization is distinguished from UI hiding;
- [ ] branding/assets are mapped;
- [ ] mandatory screenshot directory structure exists;
- [ ] Screenshot Index exists;
- [ ] Screenshot Capture Standard exists;
- [ ] every critical Role surface has screenshot evidence;
- [ ] every critical White Cell surface has screenshot evidence;
- [ ] every current SME surface has screenshot evidence;
- [ ] every material modal has screenshot evidence;
- [ ] visually distinct workflow modes are captured;
- [ ] empty/loading/error states are captured where present;
- [ ] each canonical screenshot has metadata linking it to commit/route/Role/fixture/Move/Phase;
- [ ] screenshot files contain no exposed secrets or unnecessary personal data;
- [ ] current conflicts are explicit;
- [ ] legacy/defect behavior is explicit;
- [ ] all significant behavior is classified;
- [ ] golden fixture exists;
- [ ] configuration parity tests exist;
- [ ] behavioral parity tests exist;
- [ ] visual parity tests exist;
- [ ] end-to-end parity test exists;
- [ ] configuration-loss risks are documented;
- [ ] coverage audit finds no unexplained runtime behavior;
- [ ] critical sections pass Clarity review;
- [ ] critical sections pass Accuracy review;
- [ ] critical sections pass Precision review;
- [ ] no important claim lacks evidence;
- [ ] no important behavior is described vaguely enough to require implementation guesswork.

Do not mark the blueprint `COMPLETE` while any critical area is `MISSING`, `UNVERIFIED`, or `CONFLICTING` unless the limitation is explicitly approved and documented.

---

# 46. Final Questions the Blueprint Must Answer

At completion, an architect who has never worked on Fractured Order must be able to answer clearly, accurately, and precisely:

> **What exact configurable capabilities must Plenum Studio and Plenum Runtime possess to reproduce this working Fractured Order application without Fractured Order-specific Runtime code?**

And an engineer must be able to answer:

> **How can I prove that a future Studio-generated Fractured Order Release has not lost any material behavior, configuration, Role semantics, workflow, information flow, data rule, or runtime interaction present in the pinned golden implementation?**

If either answer requires reopening the repository merely to discover major product behavior, the blueprint is incomplete.

---

# 47. Do Not Do These Things

Do NOT:

- refactor the current application;
- rewrite source files;
- replace working behavior with preferred architecture;
- summarize a complex workflow as a generic CRUD object;
- treat screenshots as sufficient evidence;
- assume hard-coded behavior is methodology;
- assume UI restrictions equal security;
- infer field semantics from labels alone;
- silently reconcile contradictory documentation;
- turn every current detail into universal Plenum behavior;
- omit loading states;
- omit empty states;
- omit return states;
- omit revision states;
- omit error states;
- omit configuration because it appears only in constants;
- omit visual structure because "the new system can redesign it";
- call the blueprint complete because the README is comprehensive;
- use vague language where exact behavior can be determined;
- present inferred behavior as observed behavior;
- collapse multiple distinct states into one generic description;
- omit exact Role, route, field, table, or transition names where available.

The repository itself is the subject of analysis.

Read it exhaustively.

---

# 48. Execution Strategy

Work in passes.

## PASS 1 — Baseline and repository inventory

- pin commit;
- inspect repository;
- map build/deployment;
- identify application layers.

## PASS 2 — Runtime routes, shells, Roles, navigation

- entry;
- global runtime chrome;
- all Role surfaces;
- navigation matrices.

## PASS 3 — Artifacts, modals, workflows

- Strategic Orientation;
- Action;
- Proposal;
- RFI/Response;
- Communication;
- Observation.

## PASS 4 — White Cell, SME, PLI, State, timing

- controls;
- models;
- SMEs;
- Move/Phase/timer;
- State.

## PASS 5 — Database, authorization, events, information flow

- persistence;
- RLS;
- auth;
- realtime;
- routing;
- evidence.

## PASS 6 — Branding, assets, and complete screenshot evidence

- landing page;
- logos;
- hero imagery;
- runtime shell;
- every Role surface;
- White Cell surfaces;
- SME surfaces;
- every material modal;
- workflow modes;
- empty/loading/error states;
- screenshot metadata sidecars;
- Screenshot Index;
- screenshot coverage audit.

## PASS 7 — Machine-readable manifests

- surfaces;
- artifacts;
- workflows;
- access;
- State;
- assets.

## PASS 8 — Golden fixtures and parity tests

- deterministic fixture;
- configuration parity;
- behavioral parity;
- visual parity;
- end-to-end parity.

## PASS 9 — Configuration extraction and loss-risk analysis

- hard-coded assumptions;
- future runtime configuration boundaries;
- configuration-loss risks.

## PASS 10 — Clarity / Accuracy / Precision audit

For every critical section:

1. remove ambiguity;
2. verify factual support;
3. add missing exact details;
4. mark unresolved claims;
5. update citations;
6. verify screenshot coverage and traceability where the section describes UI;
7. score the section.

## PASS 11 — Cross-check all outputs against source repository

Do not finalize from memory or one superficial scan.

---

# 49. Final Output

At the end return:

```text
BLUEPRINT STATUS
COMPLETE | PARTIAL | BLOCKED

Pinned commit:
<sha>

Files analyzed:
<number>

Runtime routes:
<number>

Roles:
<number>

Runtime surfaces:
<number>

Screenshots captured:
<number>

Screenshot coverage:
<percentage>

Unverified visual states:
<list>

Interface modules:
<number>

Modals:
<number>

Workflows:
<number>

Database objects:
<number>

Current-behavior requirements:
<number>

Conflicts:
<number>

Legacy/defect items:
<number>

Parity tests:
<number>

Unverified areas:
<list>

Critical configuration-loss risks:
<list>

Blueprint quality:
Clarity: <score / percentage>
Accuracy: <score / percentage>
Precision: <score / percentage>

Critical quality failures:
<list>

Highest-priority implications for Plenum:
<list>
```

Do not claim `COMPLETE` unless:

- all Quality Gates pass;
- all critical sections meet the Clarity/Accuracy/Precision standard;
- no major runtime behavior remains undocumented or ambiguous.

---

# 50. Final Standard

The blueprint is successful only if it becomes a trustworthy engineering reference.

It must be:

> **Clear enough that an unfamiliar reader understands it.**

> **Accurate enough that every important claim can be defended from evidence.**

> **Precise enough that a future Plenum implementation can reproduce the current Fractured Order behavior without guessing.**

> **Visually evidenced enough that every important runtime surface, mode, and modal can be compared against the pinned working implementation.**
