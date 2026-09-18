# Green Cell Regional Split: Implementation and Session Prompt Book

| Document field | Value |
| --- | --- |
| Project | Fractured Order on Plenum |
| Document version | 1.0 |
| Created | 2026-09-18 |
| Last updated | 2026-09-18 |
| Status | Proposed architecture and implementation queue; implementation not verified |
| Requested outcome | Two Green Facilitators and two Green Scribes: one pair for Asia-Pacific and one pair for Europe |
| Coverage | Platform implementation, session operation, verification, and historical compatibility |
| Evidence basis | Repository source review; no tests, migrations, or deployments run for this document |

## Contents

- [How to use and maintain this book](#how-to-use-and-maintain-this-book)
- [Implementation status](#implementation-status)
- [Decisions and prerequisites](#decisions-and-prerequisites)
- [Repository findings](#repository-findings)
- [Target architecture](#target-architecture)
- [Shared implementation instructions](#shared-implementation-instructions)
- [Implementation prompts](#implementation-prompts)
- [Session-operation prompt cards](#session-operation-prompt-cards)
- [Shared session procedures](#shared-session-procedures)
- [Human-run verification](#human-run-verification)
- [Change log](#change-log)

## How to use and maintain this book

This is the working reference for the requested Green subdivision. It records a
proposed design, not a claim that the functionality already exists. The original
source review found a vanilla JavaScript/Vite application backed by Supabase,
with a Python PLI subsystem. AfCFTA-specific paths in supplied instructions do
not describe this workspace; applicable execution and change-hygiene rules still
apply.

1. Start an implementation task by referencing its stable prompt ID, such as
   **GC-03**, and include the [shared instructions](#shared-implementation-instructions).
2. Read the prompt's cited files and the current decision register before editing.
   Recheck the current repository: the findings below are a dated source-review
   baseline, not a substitute for reading later changes.
3. Work in dependency order. GC-07 through GC-10 can be developed independently
   after their shared identity, storage, and workflow contracts are stable. This
   sequencing does not itself authorize parallel agents.
4. Deliver code, narrow regression tests, and relevant documentation together for
   every behavior change. Keep ordinary implementation results in the status
   table and linked evidence, rather than rewriting requirements to match a
   partial implementation.
5. Record proposed architecture changes in the decision register. Preserve prompt
   IDs and add a dated change-log entry when scope or acceptance criteria change.
6. The human runs verification and marks a prompt **Verified** only after its
   acceptance criteria and applicable gates have fresh evidence. Missing evidence
   remains explicit. Do not substitute a previous run or a mock result for a real
   database authorization check.
7. Store run artifacts in the approved evidence location under the
   [repository artifact policy](repository-artifact-policy.md). Link only evidence
   that actually exists; do not commit participant data or generated release output.

Suggested statuses: **Not started**, **In progress**, **Awaiting verification**,
**Blocked**, and **Verified**. A blocker must identify the affected scope; the
roster decision does not prevent unrelated foundational work.

Implementation return format:

```text
Prompt ID:
Behavior changed:
Files changed:
Tests added or updated:
Verification commands and expected results:
Commands actually run, if expressly authorized:
Evidence links:
Open decisions or blockers:
Suggested status (human confirms gate completion):
```

## Implementation status

All entries begin as not started. Creating this prompt book does not complete
GC-01 or any implementation gate.

| ID | Task | Dependencies | Status | Evidence / implementation notes |
| --- | --- | --- | --- | --- |
| [GC-01](#gc-01-establish-the-regional-green-contract) | Regional contract and impact inventory | None | Not started | Roster decision pending |
| [GC-02](#gc-02-add-session-topology-and-regional-data-ownership) | Session topology and storage | GC-01 | Not started | No migration applied |
| [GC-03](#gc-03-implement-secure-regional-seat-claims-and-permissions) | Seats and server authorization | GC-02 | Not started | Real Supabase evidence required |
| [GC-04](#gc-04-implement-join-routing-and-persistent-regional-context) | Join, routes, and session context | GC-03 | Not started | Four regional entry paths |
| [GC-05](#gc-05-implement-separate-orientations-and-the-five-submission-gate) | Orientations and move gate | GC-04 | Not started | Preserve unified-session gate |
| [GC-06](#gc-06-implement-regional-proposals-and-handoffs) | Proposals and regional handoffs | GC-05; approved roster | Not started | Preserve revisions and recipient threads |
| [GC-07](#gc-07-scope-rfis-communications-and-notifications) | RFIs and communications | GC-06 contracts | Not started | Audience precedence required |
| [GC-08](#gc-08-update-white-cell-realtime-and-session-administration) | White Cell and recovery | GC-06 contracts; integrate GC-07 | Not started | No private payload leakage |
| [GC-09](#gc-09-update-decks-onboarding-and-session-support) | Decks, onboarding, and support | GC-06 contracts; approved roster | Not started | Narrated media changes may need separate work |
| [GC-10](#gc-10-preserve-pli-behavior-and-regional-attribution) | PLI attribution | GC-06 contracts | Not started | Scoring methodology unchanged |
| [GC-11](#gc-11-extend-research-exports-and-historical-compatibility) | Research and historical exports | GC-07 through GC-10 | Not started | Export reconciliation required |
| [GC-12](#gc-12-build-the-rehearsal-and-release-evidence-package) | Rehearsal and release evidence | GC-01 through GC-11 | Not started | Human-run gates pending |

## Decisions and prerequisites

The requested four-role split and coverage of both implementation and session
operation are established user requirements. The detailed architecture below is
the recommended implementation baseline; it is not evidence of deployed behavior.

| ID | Topic | Current position | Resolution / effect |
| --- | --- | --- | --- |
| D-01 | Green topology | Proposed: one parent Green team, two regional delegations | Formalize in GC-01 |
| D-02 | Country/entity roster | Unresolved: proposal form and briefing disagree | Resolve before roster-dependent validation and final materials |
| D-03 | Existing Green Notetakers | Proposed: preserve two seats, assign one per region | Formalize scoped storage and claims; add no seats |
| D-04 | Cross-region privacy | Proposed: private drafts and messages; explicit shared audience | Formalize in permission matrix and RLS |
| D-05 | Session compatibility | Proposed: existing sessions remain unified; new regional sessions carry explicit topology | No implicit live conversion |
| D-06 | Canonical regional roles | Proposed: new role suffixes match semantic roles; preserve legacy inversion | Explicit registry and compatibility adapter required |
| D-07 | PLI methodology | Preserve current Green routing and Blue-orientation dependency | Regional attribution must not change scoring |

### Roster discrepancy

| Source | Asia-Pacific | Europe |
| --- | --- | --- |
| Current proposal form | ROK, ASEAN, Japan | EU, France, UK |
| Green facilitator briefing | Australia, Japan, Republic of Korea | European Union, Germany, United Kingdom |

Sources:
[proposalDetails.js](../src/features/actions/proposalDetails.js) and the
[Green facilitator briefing](../decks/green/fractured-order-green-facilitator-deck.html).

Do not combine these lists automatically. EU and ASEAN are represented entities,
rather than individual countries. The approved exercise roster determines which
entities each delegation represents. Do not derive Green membership from the
global target-country list or current real-world geography. Record the chosen
roster and version here when resolved; no roster choice is assumed in version 1.0.

## Repository findings

| Finding at source review | Architectural consequence |
| --- | --- |
| Green is one of four actor teams. | Preserve `team = green`; introduce regional ownership beneath it. |
| Displayed Scribe and Facilitator roles use inverted legacy identifiers and routes. | New regional identities need explicit semantic mappings. |
| Red forecasts `green_asian_pacific` and `green_europe`. | Preserve these forecast relationships and their historical meaning. |
| The database permits one orientation per session/team. | Regional orientations need scoped uniqueness and a revised completion gate. |
| Proposal recipients are Blue and Red with separately approved negotiation threads. | Preserve recipient isolation while adding originating delegation. |
| Green proposals have special PLI routing; their NI orientation lookup uses Blue's orientation. | Preserve scoring behavior and add regional attribution separately. |
| Role and operational rehearsals have explicit executable inventories. | Update evidence manifests and actual procedures with the topology. |

Primary references:

- [Project README](../README.md)
- [Team and role context](../src/core/teamContext.js)
- [Strategic Orientation contract](../src/features/actions/strategicOrientationDetails.js)
- [Artifact integrity migration](../data/2026-07-14_action_artifact_workflow_integrity.sql)
- [PLI runner](../pli/run_pli.py)
- [Role capability matrix](role-capability-test-matrix.md)
- [Operational rehearsal](operational-rehearsal.md)

## Target architecture

| Delegation | Facilitator | Scribe |
| --- | --- | --- |
| Green - Asia-Pacific | One dedicated seat | One dedicated seat |
| Green - Europe | One dedicated seat | One dedicated seat |

Each delegation owns its orientation, proposals, RFIs, negotiations, and records.
White Cell retains oversight of both.

The following fields and contracts are proposals, not claims about existing schema:

| Concern | Proposed contract |
| --- | --- |
| Parent identity | `team = green` |
| Regional identity | `delegation_id = asian_pacific` or `europe` |
| Session topology | Persisted, versioned choice between existing unified Green and regional Green |
| Country/entity membership | Approved roster version captured for the session |
| Seat capacity | Exactly one Facilitator and one Scribe per delegation |
| Artifact ownership | Session + parent team + delegation |
| Permissions | Derived from the authenticated, active session seat |
| Historical records | Retain original unified Green identity |
| Reporting | Separate regional views plus a deduplicated Green aggregate |
| Game controls | One shared exercise clock, move, and phase |
| PLI | Existing Green scoring rules with regional attribution retained |

### Role and route compatibility

Proposed canonical regional role identifiers:

```text
green_asian_pacific_facilitator
green_asian_pacific_scribe
green_europe_facilitator
green_europe_scribe
```

For these new identifiers, the suffix matches the human role. Preserve the old
mappings for existing sessions:

```text
green_facilitator -> displayed Scribe
green_scribe      -> displayed Facilitator
```

An explicit role registry must distinguish semantic role, legacy workspace,
team, and delegation. Do not infer permissions by splitting strings or applying
the legacy inversion to every new role.

Existing Green pages can be reused with delegation-aware context. A route
parameter may select a requested view; the server-confirmed seat establishes
the authorized delegation.

### Operating boundaries

- Scribes draft and hand off their delegation's records.
- Facilitators review, submit, manage RFIs, and conduct approved negotiation threads.
- White Cell reviews both delegations through the existing workflow.
- Regional drafts and private communications remain isolated.
- An explicit **Both Green delegations** audience supports shared information.
- Cross-region consultation does not grant access to another delegation's drafts.
- Existing Green Notetaker capacity remains two, with one existing seat assigned
  to each delegation in regional sessions. Do not add Notetaker seats.
- Historical sessions retain existing behavior. Do not convert an active unified
  session implicitly.

With existing Notetaker and operator assumptions preserved, the documented
18-actor operational rehearsal becomes **20 actors**, and the 23-actor role
rehearsal becomes **25 actors**. These are target rehearsal counts, not verified
current capabilities.

## Shared implementation instructions

Prepend these instructions to every implementation prompt:

> Work in the Fractured Order repository. Read applicable repository instructions
> and every cited file before editing.
>
> Implement only the numbered prompt's scope and necessary dependencies. Identify
> any required scope expansion.
>
> Preserve the vanilla JavaScript/Vite/Supabase architecture. Preserve legacy role
> compatibility, artifact revisions, White Cell review, recipient-isolated
> proposal threads, and historical evidence.
>
> Treat regional ownership as an authorization boundary. Browser filtering alone
> is insufficient. Derive authority from the authenticated active session seat
> and validate scope on the server.
>
> Do not expand the represented roster, change PLI scoring, invent participant
> decisions, or relabel historical unified Green records.
>
> Deliver code, narrow regression tests, and relevant documentation together. Use
> additive migrations; inspect later replacements of database functions and
> policies before changing them.
>
> Do not execute tests, npm commands, migrations, or deployment actions unless
> explicitly authorized. Provide exact human-run commands and expected pass
> conditions.
>
> Finish with files changed, tests added, verification commands, unresolved
> dependencies, and evidence still required. Do not declare a gate passed without
> fresh evidence.

## Implementation prompts

### GC-01: Establish the regional Green contract

Implementation reference: [GC-01 regional Green identity and permission contract](architecture/green-regional-contract.md)
(proposed contract; verification and roster approval pending).

**Objective:** Produce the implementation contract for two Green delegations,
each with one Facilitator and one Scribe.

**Read first:**

- `README.md`
- `src/core/teamContext.js`
- `src/core/enums.js`
- `src/features/actions/strategicOrientationDetails.js`
- `src/features/actions/proposalDetails.js`
- `docs/role-capability-test-matrix.md`
- `docs/operational-rehearsal.md`
- `decks/green/fractured-order-green-facilitator-deck.html`

**Implementation prompt:**

> Document current behavior separately from proposed behavior. Define session
> topology version, delegation IDs, semantic roles, route mappings, roster
> version, permission matrix, and compatibility rules.
>
> Record conflicting country/entity rosters and require an explicit roster choice
> before implementing membership validation. Do not treat the global
> target-country list as the Green membership list.
>
> Define the existing two Green Notetakers' regional assignments without
> increasing total capacity.
>
> Inventory every place where `team = green` controls ownership, access,
> aggregation, or workflow completion.
>
> Create a new architecture document outside any protected prompt-handbook
> directory. Link its actual path from this book once created.

**Acceptance:** One unambiguous identity and permission matrix covers all four
requested seats, legacy sessions, Notetakers, White Cell, and SMEs. Later prompts
can reference it without inventing their own regional model.

### GC-02: Add session topology and regional data ownership

**Objective:** Implement additive storage support for regional Green.

**Read first:**

- `data/COMPLETE_SCHEMA.sql`
- `data/2026-07-14_action_artifact_workflow_integrity.sql`
- `data/2026-08-05_team_neutral_artifact_review.sql`
- `data/2026-08-06_proposal_recipient_threads.sql`
- `data/2026-08-26_session_role_name_snapshots.sql`
- `src/services/database.js`
- `src/features/notetaker/storage.js`
- `docs/supabase-setup.md`
- `docs/supabase-rollback.md`

**Implementation prompt:**

> Add persisted session topology and approved roster version. Freeze topology
> before participants begin operating; reject mid-session changes once seats or
> artifacts exist.
>
> Add authoritative delegation ownership to session seats, Green actions,
> orientations, proposals, and RFIs. Define sender and recipient delegation scope
> for communications separately from artifact ownership.
>
> Preserve scope in review snapshots, thread metadata, timeline records, and
> exported evidence. Referenced records must belong to the same session and valid
> ownership scope.
>
> Regional Green writes must carry a valid delegation. Non-Green records must
> reject Green delegation values. Historical unified records retain original
> identity.
>
> Replace orientation uniqueness with rules permitting one orientation for each
> regional Green delegation while retaining unified and non-Green uniqueness
> guarantees. Handle SQL null semantics explicitly.
>
> Inspect shared JSON storage, especially Notetaker records: row-level security
> cannot hide one region's fields inside a row containing both regions. Use
> appropriately scoped storage or an authorized projection where required.

**Tests:** Invalid scope combinations, immutable ownership, duplicate
orientations, legacy reads, roster-version persistence, and shared-JSON
disclosure prevention.

**Acceptance:** Both regional orientations can exist; duplicate regional
orientations and ambiguous regional writes fail.

### GC-03: Implement secure regional seat claims and permissions

**Objective:** Extend server-side seat and authorization contracts.

**Read first:**

- `data/2026-04-08_live_demo_role_seat_contract.sql`
- `data/2026-04-08_live_demo_rls_hardening.sql`
- `data/2026-06-25_participant_role_resolver_normalization.sql`
- `data/2026-07-21_scribe_proposal_submit_policy.sql`
- `data/2026-08-06_facilitator_rfi_communications.sql`
- Later migrations replacing these functions or policies
- `src/services/database.seats.test.js`
- `src/services/database.policy.test.js`
- `src/services/supabaseMock.js`

**Implementation prompt:**

> Introduce explicit regional role resolution and semantic capability checks.
> Preserve existing role normalization and legacy behavior.
>
> Claim each regional seat atomically. Concurrent claims for the same seat must
> yield one winner; different regional seats remain independently claimable.
>
> Preserve heartbeat, stale-seat release, rejoin, operator removal, and
> archived-session restrictions. A revoked or replaced seat must not regain
> authority through a stale browser.
>
> Reject regional claims in unified sessions and ambiguous unified Green
> authoring claims in regional sessions.
>
> Enforce delegation scope across reads, writes, deletes, review RPCs, proposal
> threads, RFIs, communications, timelines, and derived records. Audit permissive
> policies that could bypass new restrictions.
>
> Never trust browser-supplied delegation or sender role. Keep server and mock
> contracts aligned.

**Tests:** Seat contention, spoofed scope, cross-session access, cross-region
reads/writes, unauthorized submission, removed-seat recovery, and legacy role
permissions.

**Acceptance:** Neither regional pair can access or mutate the other's private
records through direct API calls.

### GC-04: Implement join, routing, and persistent regional context

**Objective:** Add the four regional role choices to the participant experience.

**Read first:**

- `index.html`
- `src/roles/landing.js`
- `src/core/teamContext.js`
- `src/core/navigation.js`
- `src/stores/session.js`
- `src/main.js`
- `teams/green/facilitator.html`
- `teams/green/scribe.html`
- `vite.config.js`

**Implementation prompt:**

> In regional sessions, make Green participants choose Asia-Pacific or Europe,
> then Scribe or Facilitator. Display the complete delegation and semantic role
> before claiming a seat.
>
> Retain existing shared controllers and page structure where practical. Map
> semantic roles to the correct legacy workspace explicitly.
>
> Restore delegation identity from the confirmed session seat. Validate it on
> startup and rejoin. Reject route/session mismatches without silently falling
> back to Blue or unified Green.
>
> Include delegation scope in relevant draft, deck, notification, and local-state
> keys. Clear inaccessible state after logout, seat change, or operator removal.
>
> Provide accessible loading, full-seat, invalid-session, permission-error,
> retry, and degraded-sync states.

**Tests:** All four joins, workspace mapping, reload, deep links, base-path
routing, tampered query parameters, stale storage, and keyboard operation.

**Acceptance:** Every regional participant sees the correct role and region
throughout the session; changing a URL cannot change authority.

### GC-05: Implement separate orientations and the five-submission gate

**Objective:** Extend Strategic Orientation for the regional topology.

**Read first:**

- `src/features/actions/strategicOrientationDetails.js`
- `src/roles/facilitator.js`
- `src/roles/scribe.js`
- `src/roles/whitecell.js`
- `src/stores/gameState.js`
- `src/features/gameControls/PhaseControl.js`
- `src/features/gameControls/MoveControl.js`
- `data/2026-08-13_strategic_orientation_team_canonicalization.sql`

**Implementation prompt:**

> Each Green delegation independently records the existing Green workflow:
> forecast Blue, select its own orientation, and describe its strategy.
>
> Preserve catalogue IDs, labels, tags, required narratives, compatibility
> artifact types, and historical envelopes. Do not replace the platform catalogue
> with the briefing deck's align/hedge/defect vocabulary.
>
> For regional sessions, require qualifying submissions from Blue, Red,
> Industry, Green Asia-Pacific, and Green Europe. Unified sessions retain the
> existing four-team gate.
>
> Preserve current qualifying submission semantics; do not silently change
> submitted to White Cell into a new approval requirement.
>
> Compute completion by session topology and delegation ownership. An Asia-Pacific
> artifact must never satisfy Europe's requirement.
>
> Apply the same gate to every move/phase mutation path capable of bypassing
> orientation. Return-to-team and resubmission must update completion consistently.
>
> Preserve Red's existing separate regional forecasts.

**Tests:** One Green submission missing, duplicate attempts, returned
orientations, resubmission, direct mutation bypass, and unchanged legacy completion.

**Acceptance:** The gate identifies the exact missing delegation and cannot be
bypassed through a non-UI write path.

### GC-06: Implement regional proposals and handoffs

**Objective:** Scope Green proposal authoring and review to the originating delegation.

**Read first:**

- `src/roles/facilitator.js`
- `src/roles/scribe.js`
- `src/features/actions/proposalDetails.js`
- `src/features/actions/artifactLifecycle.js`
- `src/features/actions/ActionCard.js`
- `src/services/database.js`
- `data/2026-08-15_proposal_forwarding_integrity.sql`

**Implementation prompt:**

> Filter new proposal originators using the approved session roster and
> delegation. Enforce the same rule server-side.
>
> Preserve existing required proposal fields, including intended partners,
> sectors, supply-chain decision, conditional areas, timing, conditions, and
> expected outcomes.
>
> Each Scribe creates and forwards its delegation's proposal; the matching
> Facilitator reviews and submits it. Retain existing supported Facilitator
> editing behavior for editable records.
>
> Keep ownership immutable through White Cell return, correction, revision
> increment, and resubmission. Show region and revision on every review surface.
>
> Preserve separate Blue and Red approvals and append-only negotiation rounds.
> Responses must return to the originating regional Facilitator.
>
> Scope idempotency and draft discovery so concurrent regional proposals do not
> overwrite or suppress each other.
>
> Do not introduce joint ownership in this change. A coordinated initiative may
> use two separately owned proposals with explicit references; it must not imply
> authorization from the other delegation.

**Tests:** Parallel drafting, invalid originators, wrong-region handoff, stale
revisions, double submission, two-recipient threads, and return routing.

**Acceptance:** Both regional pairs complete independent proposal lifecycles
without overwriting records or leaking recipient-specific negotiations.

### GC-07: Scope RFIs, communications, and notifications

**Objective:** Implement delegation-aware messaging through the existing White Cell boundary.

**Read first:**

- `src/features/communications/targeting.js`
- `src/features/communications/SendCommunication.js`
- `src/features/requests/RfiForm.js`
- `src/features/requests/RfiList.js`
- `src/features/notifications/workflowNotifications.js`
- `src/features/actions/blueActionDetails.js`
- `src/features/actions/ActionReview.js`
- `data/2026-08-06_facilitator_rfi_communications.sql`
- `data/2026-08-13_action_notification_delivery.sql`

**Implementation prompt:**

> Preserve Facilitator ownership of RFI creation and direct communications;
> Scribes retain their existing read-only RFI role.
>
> Support explicit audiences: Asia-Pacific, Europe, both Green delegations, and an
> individual regional role where appropriate.
>
> Define recipient-scope precedence. A role- or delegation-addressed message must
> not become parent-team-visible merely because metadata also contains
> `team = green`.
>
> Keep existing Blue/Red action-notification requests compatible: a request to
> inform Green means both regional delegations in a regional session. Preserve
> White Cell approval and persist the resolved delivery audience.
>
> Route returned RFIs, answers, proposal replies, deck assignments, journal
> updates, and durable notices correctly.
>
> Preserve deduplication, unread state, silent startup history, and recovery
> after missed events.

**Tests:** Each audience, private replies, invalid scope metadata, notification
approval, duplicate delivery, reload, and reconnect.

**Acceptance:** Private messages remain private at the database boundary, and
shared Green announcements reach both delegations exactly as intended.

### GC-08: Update White Cell, realtime, and session administration

**Objective:** Make regional ownership visible and operationally reliable.

**Read first:**

- `src/roles/whitecell.js`
- `src/roles/gamemaster.js`
- `src/components/ui/Badge.js`
- `src/features/participants/ParticipantList.js`
- `src/stores/actions.js`
- `src/stores/requests.js`
- `src/stores/communications.js`
- `src/services/realtime.js`
- `src/services/sync.js`

**Implementation prompt:**

> Add regional labels and filters to Green queues, roster views, orientation
> status, proposal reviews, RFIs, and communications.
>
> Preserve one global move, phase, and timer. Regional workspaces must not create
> independent clocks.
>
> Update initial fetches, store reconciliation, realtime handlers, and teardown
> to use complete session/role/delegation context.
>
> Ensure reconnect cannot reintroduce previously inaccessible records. Do not
> place private draft content into broadly readable timeline or notification
> payloads.
>
> Preserve session-role display-name snapshots and regional attribution through
> participant removal and archival.
>
> Add bounded diagnostics for invalid regional scope, seat contention, rejected
> cross-region operations, and missed reconciliation. Keep sensitive proposal
> content out of logs and describe operator recovery in the runbook.

**Tests:** Concurrent regional submissions, stale operator reviews, missed-event
recovery, seat revocation, archive closure, and timeline visibility.

**Acceptance:** White Cell can distinguish and manage both streams, while
participant recovery never broadens access.

### GC-09: Update decks, onboarding, and session support

**Objective:** Adapt participant guidance and facilitator support for the four regional seats.

**Read first:**

- `src/features/scribe/deckConfig.js`
- `src/features/scribe/deckStorage.js`
- `decks/green/fractured-order-facilitator-deck.html`
- `decks/green/fractured-order-green-facilitator-deck.html`
- `src/features/onboarding/followAlong.js`
- `src/features/onboarding/platformOverview.js`
- `src/features/plugins/intercom.js`
- `docs/start-here-onboarding.md`
- `tests/unit/facilitator-decks.test.js`
- `tests/unit/start-here-role-coverage.test.js`

**Implementation prompt:**

> Provide clear regional role instructions and region-specific facilitator deck
> selection or configuration. Reuse shared exercise material.
>
> Audit which deck file the runtime actually loads; do not assume the separately
> named Green briefing is the active default.
>
> Make White Cell deck assignments and uploaded-deck state delegation-specific.
>
> Explain Scribe-to-Facilitator handoff, Facilitator-owned RFIs, regional
> negotiation ownership, and shared Green announcements.
>
> Preserve the existing two Notetaker seats, with explicit regional assignment
> and scoped notes.
>
> Ensure Intercom reaches both regional Scribes under its existing session-wide
> announcement behavior.
>
> Update visible text and transcripts. If narrated onboarding becomes stale,
> report the media gap or provide the supported text fallback; do not claim new
> audio has been generated or approved.

**Acceptance:** All four seats have accurate onboarding, independent deck state,
accessible guidance, and correct announcement delivery.

### GC-10: Preserve PLI behavior and regional attribution

**Objective:** Carry regional provenance through PLI without changing methodology.

**Read first:**

- `pli/tracks/router.py`
- `pli/run_pli.py`
- `pli/adjudicate_router.py`
- `pli/plenum/INTEGRATION.md`
- `src/features/pli/DiplomacyInfoReview.js`
- `src/features/pli/PliReportPanel.js`
- `src/features/pli/SmePliPacketQueue.js`
- `src/features/plenary/plenaryData.js`
- `supabase/functions/trigger-pli-adjudication/index.ts`

**Implementation prompt:**

> Keep both delegations' proposals recognizable as Green proposals. Preserve
> existing Macro-skipping and Diplomacy/Information routing behavior.
>
> Preserve the current Blue Strategic Orientation dependency for Green proposal
> NI processing. Do not substitute either regional Green orientation.
>
> Carry delegation identity from the authoritative action into adjudication
> records, SME views, finalized packets, reports, and applicable plenary labels.
>
> Preserve existing SME authorization and finalization gates. Regional staff do
> not acquire SME powers.
>
> Support regional filtering and parent-Green aggregation without counting an
> action twice.
>
> Avoid unapproved changes to model prompts, scoring inputs, codebooks, or thresholds.

**Tests:** Equivalent regional proposals retain existing routing; Blue orientation
lookup remains unchanged; attribution survives all output stages; aggregate
counts reconcile.

**Acceptance:** The split changes ownership and attribution, with no unintended
scoring change.

### GC-11: Extend research exports and historical compatibility

**Objective:** Extend canonical evidence exports to represent regional Green accurately.

**Read first:**

- `src/features/export/researchExport.js`
- `src/features/export/exportCsv.js`
- `src/features/export/exportJson.js`
- `src/services/database.research-export.test.js`
- `src/services/database.participants-history.test.js`
- `src/features/export/researchExport.test.js`
- `docs/repository-artifact-policy.md`

**Implementation prompt:**

> Include session topology, roster version, parent team, delegation, original
> persisted role, and semantic role wherever relevant.
>
> Preserve delegation through orientations, proposals, review histories, RFIs,
> communication audiences, immutable thread rounds, participant snapshots, and
> PLI references.
>
> Update JSON, CSV, JSONL, HTML, and LaTeX projections consistently. Advance the
> export schema/version according to the actual contract change.
>
> Label historical records Green - unified/legacy where clarification is
> necessary. Do not infer a historical delegation from country names or proposal
> content.
>
> Reconcile regional counts with parent Green totals using distinct artifact IDs.
> Preserve the distinction between captured audit events and reconstructed
> chronology.
>
> Ensure cross-session exports can include unified and regional sessions without
> conflating their topology.

**Acceptance:** A researcher can reconstruct who submitted each record, for which
delegation, under which roster, without changing historical evidence.

### GC-12: Build the rehearsal and release evidence package

**Objective:** Extend contract and browser rehearsals for regional Green.

**Read first:**

- `tests/contracts/roleCapabilityMatrix.js`
- `tests/contracts/operationalFeatureManifest.js`
- `tests/e2e/live-demo-topology.e2e.js`
- `tests/e2e/live-demo-playthrough.e2e.js`
- `tests/e2e/live-demo-role-matrix.e2e.js`
- `tests/e2e/live-demo-realtime.e2e.js`
- `tests/e2e/support/mockBackend.js`
- `docs/operational-rehearsal.md`
- `docs/live-demo-runbook.md`
- `docs/supabase-setup.md`
- `docs/supabase-rollback.md`

**Implementation prompt:**

> Add independently evidenced procedures for all four regional seats. Preserve
> legacy-session coverage.
>
> Rehearse simultaneous drafting, seat contention, separate orientations, White
> Cell returns, isolated Blue/Red negotiations, private RFIs, shared announcements,
> reconnect, participant removal, and reconciled exports.
>
> Update documented actor counts to match the actual executable roster.
>
> Provide a real Supabase authorization verification procedure using distinct
> participant identities. Mock success and SQL text assertions are insufficient
> evidence of deployed RLS.
>
> Document additive migration order, existing-session compatibility, activation
> for new regional sessions, and recovery.
>
> After regional writes exist, rollback must preserve regional records and a
> compatible reader. Do not roll back by dropping scope columns or merging records
> into unified Green.
>
> Keep non-PLI operational evidence separate from PLI-specific evidence.

**Acceptance:** Implementation has reproducible verification instructions and
explicit outstanding evidence. Only the human records gate completion after
executing verification.

## Session-operation prompt cards

These prompts support the human roles or a supporting assistant. They do not
authorize an assistant to invent positions, submit records, or adjudicate outcomes.
Use the approved roster in the placeholders. They describe the target regional
workflow and are not evidence that the current platform supports it.

### OP-01: Asia-Pacific Facilitator

> You facilitate Green - Asia-Pacific for `[approved represented entities]`.
>
> Help participants articulate their own decisions. Do not assume that alliance
> membership implies agreement, or that all represented entities share one position.
>
> At the start of each move, identify the current scene, relevant Blue and Red
> actions, outstanding conditions, and the White Cell deadline.
>
> Ask:
>
> 1. How is each represented entity positioned?
> 2. What does the named Blue action change?
> 3. What does the named Red action change?
> 4. What condition would change the current position?
> 5. Which entities authorize the proposed response, and which disagree?
>
> Have the Scribe record the agreed proposal and unresolved differences. Review
> originators, intended partners, timing, conditions, expected outcomes, and any
> unsupported assumptions.
>
> Submit only through the Asia-Pacific Facilitator seat. Own this delegation's
> RFIs and negotiation replies. Consult Europe through the agreed channel without
> claiming authority for European entities.
>
> End with submitted items, returned items, unanswered RFIs, unresolved conditions,
> and the next responsible person.

### OP-02: Asia-Pacific Scribe

> You are the Scribe for Green - Asia-Pacific.
>
> Record participant decisions faithfully using current platform fields.
> Separate adopted positions from suggestions, uncertainty, and disagreement.
>
> For Strategic Orientation, record the delegation's Blue forecast, selected
> orientation, and strategy narrative.
>
> For each proposal, capture title, authorized originators, objective, intended
> Blue/Red partners, sectors, supply-chain decision and applicable areas, timing
> and conditions, and expected outcomes.
>
> Flag missing information rather than inventing it. Do not select originators
> outside the approved Asia-Pacific roster.
>
> Forward the completed draft to the Asia-Pacific Facilitator. Record its artifact
> ID and revision. If White Cell returns it, correct the same artifact and preserve
> the review history.
>
> Do not submit directly to White Cell, create Facilitator-owned RFIs, or alter
> European records.

### OP-03: European Facilitator

> You facilitate Green - Europe for `[approved represented entities]`.
>
> Elicit each represented entity's position separately before describing any
> collective European position. Distinguish national authorization from EU-level
> authorization where the exercise represents both.
>
> Use the three standing questions: current position, effect of Blue's action,
> and effect of Red's action. Then identify acceptable costs, required assurances,
> conditions, and unresolved disagreements.
>
> Ask participants to identify who can make each proposed commitment. Do not treat
> one participant's statement as authorization for every European originator.
>
> Review the Scribe's orientation and proposals for fidelity and completeness.
> Own European RFIs, submission to White Cell, and approved negotiation replies.
>
> Consult Asia-Pacific when useful, but preserve separate decisions and records.
>
> End with a concise ledger of submissions, revisions, pending answers,
> commitments, and unresolved conditions.

### OP-04: European Scribe

> You are the Scribe for Green - Europe.
>
> Record the delegation's decisions without converting disagreement into
> consensus. Distinguish EU, national, and other represented-entity commitments.
>
> Capture European Strategic Orientation independently from Asia-Pacific.
>
> Draft proposals using current required fields and only approved European
> originators. Identify intended partner, responsible originators, conditions,
> timing, and expected outcomes clearly.
>
> Forward drafts to the European Facilitator with their artifact IDs and
> revisions. Correct returned items under the same IDs.
>
> Keep a concise handoff ledger: draft, forwarded, submitted, returned,
> resubmitted, or completed.
>
> Do not create commitments on behalf of Asia-Pacific, bypass Facilitator
> submission, or edit another delegation's records.

## Shared session procedures

| Stage | Facilitator responsibility | Scribe responsibility | Required result |
| --- | --- | --- | --- |
| Before play | Confirm delegation, roster, role, and access | Confirm correct workspace and empty/current records | Four correctly occupied seats |
| Strategic Orientation | Elicit and review delegation position | Record forecast, orientation, and strategy | Two distinct Green orientations |
| Move opening | Explain scene and standing questions | Record relevant decisions and references | Shared understanding within each delegation |
| Deliberation | Surface conditions and disagreement | Distinguish decisions from discussion | Faithful draft |
| Handoff | Review completeness and authorization | Forward identified revision | Correct regional Facilitator receives it |
| White Cell review | Submit and track responses | Correct returned records | Preserved revision history |
| Negotiation | Own replies and commitments | Maintain decision record | Separate regional and recipient threads |
| Move close | Confirm pending obligations | Reconcile handoff ledger | No orphaned or duplicate submissions |
| Hot wash | Explain why positions changed | Link conclusions to recorded evidence | Region-specific and joint findings |

### OP-05: Cross-region coordination

> Each delegation states its current position, desired coordination, conditions,
> and authorized disclosure. Identify agreement and disagreement explicitly.
> Choose what may be shared with Blue, Red, or White Cell. Each Facilitator remains
> responsible for its own delegation's submission. Consultation does not create a
> joint commitment automatically.

### OP-06: White Cell readiness

> Confirm the session uses regional Green, the approved roster is recorded, and
> all four regional seats are occupied correctly. Confirm both Green orientations
> satisfy the existing submission requirement. Check regional attribution on
> proposal and RFI queues. Confirm private replies reach the correct region and
> shared Green announcements reach both. Do not advance while a required regional
> submission is missing.

### OP-07: Recovery

> Identify the affected delegation, seat, artifact ID, revision, and last
> confirmed operation. Preserve unsent text locally through the supported recovery
> path. Rejoin or retry through the existing session flow. Check whether the
> original operation committed before submitting again. Escalate ambiguous
> ownership or permission errors to White Cell; never switch to the other
> delegation's seat as a workaround.

## Human-run verification

These commands correspond to repository scripts or test files observed during
the source review. They are instructions for the completed implementation, not
results. Recheck script names if implementation changes them. Extend existing
suites with the regional regression cases specified above before using them as
evidence of the split.

### Identity and authorization

```powershell
npm test -- src/core/teamContext.test.js src/roles/landing.join.test.js src/services/database.seats.test.js src/services/database.policy.test.js
```

**Pass:** All four roles resolve correctly, seat claims behave atomically in the
tested backend, and unauthorized operations are rejected. Mock-backed results
do not establish deployed Supabase policy correctness.

### Orientations, proposals, and handoffs

```powershell
npm test -- src/features/actions/strategicOrientationDetails.test.js src/features/actions/proposalDetails.test.js src/features/actions/proposalRecipientState.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/whitecell.test.js
```

**Pass:** Separate orientations, correct handoffs, regional returns, and
recipient-isolated negotiations work while legacy behavior remains covered.

### Communications, recovery, and exports

```powershell
npm test -- src/features/communications/targeting.test.js src/services/realtime.test.js src/stores/workflowReconciliation.test.js src/features/export/researchExport.test.js
```

**Pass:** Scope survives delivery, reconnect, reconciliation, and export.

### PLI regression

```powershell
python -m pytest pli/test_run_pli_seats.py pli/test_tracks.py
```

**Pass:** Both regional proposal cases preserve Green routing and the existing
orientation dependency. Add regression cases to these suites where appropriate.

### Complete rehearsal and artifact checks

```powershell
npm run test:operational
npm run test:roles
npm run verify:repo-artifacts
```

**Pass:** Updated 20-actor operational and 25-actor role procedures complete,
evidence manifests reconcile, and repository artifact rules remain satisfied.
The non-PLI operational gate is not evidence that PLI adjudication passed.

### Evidence required before deployment readiness

- Current revision and environment identified by actual verification output.
- Additive migration application and compatibility verification.
- Real Supabase reads and writes using separate regional participant identities.
- Same-seat claim contention and cross-region read/write rejection.
- Unified-session regression evidence.
- Regional workflow, recovery, and export reconciliation results.
- Separate PLI regression evidence.
- Recorded roster decision and matching session materials.
- Recovery procedure preserving already-written regional evidence.

Deployment remains unverified until the human supplies current migration and
real Supabase authorization evidence. Resolve the roster before completing
regional membership validation and final session materials.

## Change log

| Date | Version | Change | Verification status |
| --- | --- | --- | --- |
| 2026-09-18 | 1.0 | Converted the reviewed prompt book into a maintained Markdown reference; added stable prompt IDs, navigation, dependencies, status tracking, and decision register. | Documentation only; implementation and runtime gates not run |
