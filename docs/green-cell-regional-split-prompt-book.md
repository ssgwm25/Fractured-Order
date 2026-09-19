# Green Cell Regional Split: Implementation and Session Prompt Book

| Document field | Value |
| --- | --- |
| Project | Fractured Order on Plenum |
| Document version | 1.5 |
| Created | 2026-09-18 |
| Last updated | 2026-09-18 |
| Status | Proposed architecture and implementation queue; implementation not verified |
| Requested outcome | One shared Green Facilitator for deck, RFIs and White Cell submission; one proposal Scribe each for Asia-Pacific and Europe |
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
3. Work in dependency order: GC-04A foundation, GC-05 orientations, GC-06 proposals,
   GC-07 messaging, GC-08 administration, then GC-09 guidance. GC-10 attribution
   depends on GC-06 and the unchanged GC-05 orientation contract. GC-11 integrates
   GC-07 through GC-10; GC-12 verifies the complete sequence. This sequencing
   does not itself authorize parallel agents.
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
| [GC-01](#gc-01-establish-the-regional-green-contract) | Regional contract and impact inventory | None | Not started | Reconcile shared-Facilitator model before further implementation; roster decision pending |
| [GC-02](#gc-02-add-session-topology-and-regional-data-ownership) | Session topology and storage | GC-01 | Not started | No migration applied |
| [GC-03](#gc-03-implement-secure-regional-seat-claims-and-permissions) | Seats and server authorization | GC-02 | Not started | Real Supabase evidence required |
| [GC-04](#gc-04-implement-join-routing-and-persistent-regional-context) | Join, routes, and session context | GC-03 | Not started | Original four-seat/unified compatibility baseline; GC-04A owns the shared-seat amendment |
| [GC-04A](#gc-04a-reconcile-the-shared-green-facilitator-foundation) | Shared Facilitator identity, authority and join reconciliation | GC-01–04; GC-03 repairs | Not started | Fresh three-seat evidence required; retain old four-seat evidence |
| [GC-05](#gc-05-implement-separate-orientations-and-the-five-submission-gate) | Orientations and move gate | Verified GC-04A foundation | Not started | Enable orientation-only shared submission; preserve four/five-submission gates |
| [GC-06](#gc-06-implement-regional-proposals-and-handoffs) | Proposals and regional handoffs | GC-05; approved roster | Not started | Preserve revisions and recipient threads |
| [GC-07](#gc-07-scope-rfis-communications-and-notifications) | RFIs and communications | GC-04A; GC-05/06 permission contracts | Not started | Enable scoped RFIs/direct messages; preserve proposal-thread authorization |
| [GC-08](#gc-08-update-white-cell-realtime-and-session-administration) | Regional session setup, White Cell and recovery | GC-04A setup contract; GC-05–07; approved roster for regional activation | Not started | Atomic creation around the frozen staffing model; no private payload leakage |
| [GC-09](#gc-09-update-decks-onboarding-and-session-support) | Decks, onboarding, and support | GC-04A context/storage; GC-05–08 workflows; approved roster | Not started | Replace temporary guidance only for implemented workflows; media gaps remain explicit |
| [GC-10](#gc-10-preserve-pli-behavior-and-regional-attribution) | PLI attribution | GC-04A identity; GC-05 orientation contract; GC-06 proposals | Not started | Scoring methodology unchanged |
| [GC-11](#gc-11-extend-research-exports-and-historical-compatibility) | Research and historical exports | GC-04A model/identity; GC-07 through GC-10 | Not started | Export staffing model separately from topology and artifact ownership |
| [GC-12](#gc-12-build-the-rehearsal-and-release-evidence-package) | Rehearsal and release evidence | GC-01 through GC-11, including GC-04A | Not started | Fresh stage-specific permissions and three-model compatibility evidence required |

## Decisions and prerequisites

The user clarified the target as three Green workflow seats: two regional
Scribes and one shared Facilitator. Each Scribe drafts its region's proposals
and forwards them to the shared Facilitator, who manages the deck and RFIs and
submits to White Cell. Both delegations retain separate artifact ownership.

This supersedes the earlier two-Facilitator/four-seat target for new sessions.
The original GC-01 contract and GC-02 through GC-04 evidence describe that
earlier model. GC-04A supplies the reconciled contract and foundation; fresh
verification remains required before GC-05. GC-05–07 extend permissions in the
order below; do not defer their authorization changes to a GC-08 UI selector
or treat earlier evidence as proof of shared-Facilitator support. This prompt
update alone changes no runtime seat, permission or historical session. GC-08
exposes the revised model through Game Master setup. The human-owned status
fields are not gate claims.

| ID | Topic | Current position | Resolution / effect |
| --- | --- | --- | --- |
| D-01 | Green topology | Confirmed target: two regional Scribes and one shared Green Facilitator | Reconcile GC-01 through GC-04; GC-08 provides creation UI |
| D-02 | Country/entity roster | Unresolved: proposal form and briefing disagree | Resolve before roster-dependent validation and final materials |
| D-03 | Existing Green Notetakers | Proposed: preserve two seats, assign one per region | Formalize scoped storage and claims; add no seats |
| D-04 | Cross-region privacy | Scribes remain isolated; shared Facilitator has explicit server-authorized workflow access to both delegations | Define artifact-state, RFI and recipient boundaries in GC-01 and enforce in GC-03 |
| D-05 | Session compatibility | Preserve unified sessions and existing four-seat regional sessions; new shared-Facilitator sessions carry explicit versioned configuration | No implicit conversion or reinterpretation of version 2 |
| D-06 | Canonical regional roles | Proposed: new role suffixes match semantic roles; preserve legacy inversion | Explicit registry and compatibility adapter required |
| D-07 | PLI methodology | Preserve current Green routing and Blue-orientation dependency | Regional attribution must not change scoring |
| D-08 | Capability sequence | GC-04A read-only foundation; GC-05 orientations; GC-06 proposals/approved threads; GC-07 RFIs/direct messages | Each prompt delivers server checks, required reads, UI and minimum White Cell flow together; GC-08 integrates administration and GC-09 completes guidance |

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
| Green - Asia-Pacific | Shared Green Facilitator | One dedicated seat |
| Green - Europe | The same shared Green Facilitator | One dedicated seat |

There are exactly three workflow seats in this target, not two Facilitator
accounts occupied by the same person. Existing Notetaker capacity is separate.

Each delegation owns its orientation, proposals, RFIs, negotiations, and records.
White Cell retains oversight of both.

The following fields and contracts are proposals, not claims about existing schema:

| Concern | Proposed contract |
| --- | --- |
| Parent identity | `team = green` |
| Regional identity | `delegation_id = asian_pacific` or `europe` |
| Session topology | Distinguish unified, existing four-seat regional, and new shared-Facilitator configuration; GC-01 defines the additive version contract |
| Country/entity membership | Approved roster version captured for the session |
| Seat capacity | One shared Green Facilitator per session; one Scribe per delegation |
| Artifact ownership | Session + parent team + delegation |
| Permissions | Derived from the authenticated, active session seat |
| Historical records | Retain original unified Green identity |
| Reporting | Separate regional views plus a deduplicated Green aggregate |
| Game controls | One shared exercise clock, move, and phase |
| PLI | Existing Green scoring rules with regional attribution retained |

### Role and route compatibility

Existing four-seat regional identifiers, retained for compatible sessions:

```text
green_asian_pacific_facilitator
green_asian_pacific_scribe
green_europe_facilitator
green_europe_scribe
```

Their suffixes match the human role. GC-01 must define a distinct semantic role
and server-resolved scope contract for the shared Facilitator; do not repurpose
either regional Facilitator identity or overload a legacy unified role to grant
both-region access. The two regional Scribe identities may be reused only under
the explicit new session model. Preserve the old mappings for existing sessions:

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
- The one shared Facilitator reviews forwarded work from either Scribe, submits
  each region's artifact to White Cell, manages the deck, and creates RFIs and
  approved negotiation replies with explicit originating-region attribution.
- White Cell reviews both delegations through the existing workflow.
- Scribes cannot read or mutate the other region's drafts or private messages.
  Shared-Facilitator access is an explicit server capability, bounded by artifact
  state, originating delegation and recipient-specific threads; it is not a
  parent-team bypass or a reason to publish private content to both Scribes.
- An explicit **Both Green delegations** audience supports shared information.
- Cross-region consultation does not grant access to another delegation's drafts.
- Existing Green Notetaker capacity remains two, with one existing seat assigned
  to each delegation in regional sessions. Do not add Notetaker seats.
- Historical sessions retain existing behavior. Do not convert an active unified
  session implicitly.

With existing Notetaker and operator assumptions preserved, the documented
18-actor operational rehearsal becomes **19 actors**, and the 23-actor role
rehearsal becomes **24 actors** for the shared-Facilitator model. The earlier
four-seat regional targets remain 20 and 25 for their compatible sessions.
These are target counts to reconcile against executable rosters, not fresh
verification or permission to rewrite historical rehearsal evidence.

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
(earlier four-seat contract; revision required for the shared-Facilitator target).

**Objective:** Produce the implementation contract for two regional Green
Scribes and one shared Facilitator, preserving both existing session models.

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
> Define the shared Facilitator's semantic identity, one-seat capacity, explicit
> both-region workflow scope, deck/RFI ownership and permitted artifact states.
> Keep each artifact's single delegation owner and each Scribe's isolated scope.
> Version the new session model additively; do not reinterpret existing v2 seats
> or automatically grant broader authority on reload. Update the declarative
> contract and its tests while preserving fixtures for the earlier model.
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

**Acceptance:** One unambiguous identity and permission matrix covers all three
target seats, unified and four-seat regional compatibility, Notetakers, White Cell, and SMEs. Later prompts
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
> Persist the revised GC-01 session model and shared-Facilitator scope without
> changing the meaning of existing version-2 sessions or artifact ownership.
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
> In the new model, enforce exactly one shared Facilitator across both regions
> and one Scribe per region. Derive the shared Facilitator's allowed operations
> from its authenticated active seat and explicit session model. Do not bypass
> RLS with a browser-selected region or manufacture two Facilitator seats. Test
> both allowed regional handoffs and denied cross-Scribe/private-thread access.
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

**Acceptance:** Each Scribe is isolated from the other region through direct API
calls. The shared Facilitator can perform only the explicitly authorized
both-region workflow operations; existing session permissions remain unchanged.

### GC-04: Implement join, routing, and persistent regional context

**Objective:** Preserve the original four regional entry paths and unified
compatibility, with persistent server-confirmed context.

**Baseline/amendment boundary:** GC-04's implementation and historical results
cover paired regional and unified sessions. GC-04A owns the shared Facilitator,
three-seat join amendment and its fresh verification. Apply both contracts to
the matching session model; do not reinterpret historical GC-04 PASS results.

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

> In paired regional sessions, choose Asia-Pacific or Europe, then Scribe or
> Facilitator. Display the complete delegation and semantic role before claiming
> a seat. Preserve the unified chooser for legacy sessions. GC-04A supplies the
> three-seat chooser only for explicitly shared-model sessions.
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
> Retain these boundaries when GC-04A adds a shared workspace. GC-04A owns the
> distinction between shared seat authority and a selected regional working view;
> operational orientation/proposal/RFI controls belong to GC-05–07 respectively.
>
> Provide accessible loading, full-seat, invalid-session, permission-error,
> retry, and degraded-sync states.

**Tests:** All four paired regional joins plus unified compatibility, workspace
mapping, reload, deep links, base-path routing, tampered query parameters, stale
storage, seat contention and keyboard operation. Re-run these compatibility
cases alongside GC-04A's separate three-seat matrix after shared-context changes.

**Acceptance:** Every regional participant sees the correct role and region
throughout the session; changing a URL cannot change authority.

### GC-04A: Reconcile the shared Green Facilitator foundation

**Objective:** Reconcile GC-01 through GC-04 with the confirmed arrangement:
one Asia-Pacific Scribe and one Europe Scribe author their respective proposals
for a single shared Green Facilitator, who will own the deck, RFIs and onward
White Cell handoff. Establish the foundation before GC-05; do not silently
convert existing unified or four-seat regional sessions.

**Prerequisites:** Read the shared instructions and D-01–D-05. GC-02 storage,
GC-03 authorization and the September 20/21 conflict/recipient repairs, GC-04
context and September 23 historical-NULL compatibility must be present. Inspect
later replacements of every affected function/policy. No represented roster is
approved by this task: real activation requires the existing approved-roster
record. Empty synthetic rosters are restricted to isolated verification fixtures:
SQL Editor tests roll back; hosted browser fixtures persist for the run and are
archived with explicit test provenance. Neither is exercise roster approval.

**Read first:**

- `docs/architecture/green-regional-contract.md` and `green-regional-contract.json`
- `index.html`, `teams/green/facilitator.html`, `teams/green/scribe.html`, `vite.config.js`
- `src/core/teamContext.js`, `seatContext.js`, `navigation.js`, `config.js`
- `src/roles/landing.js`, `src/roles/scribe.js`, `src/stores/session.js`, `src/stores/participants.js`, `src/main.js`
- `src/services/database.js`, `seatBootstrap.js`, `supabaseMock.js`
- `src/features/scribe/deckStorage.js`
- `data/2026-09-18_green_regional_storage.sql` through `data/2026-09-23_gc04_legacy_session_topology.sql`
- `tests/sql/gc04-session-context-editor.sql`, `src/core/seatContext.test.js`, `src/roles/landing.join.test.js`, `src/services/seatBootstrap.test.js`
- `scripts/gc04-live-check.mjs`, `scripts/gc04-live-contract.mjs`, `scripts/gc04-live-browser.mjs`, `scripts/gc04-live-preflight.mjs`
- `scripts/gc04a-live-race.mjs`, `scripts/gc04-deck-probe.mjs`, `tests/unit/gc04a-live-check.test.js`

**Implementation prompt:**

> Add an explicit, persisted, versioned seat-model discriminator. Regional
> artifact topology still has two owners and five orientation subjects. Preserve
> the old four-seat role IDs and unified role inversion in their existing models.
> Use one `green_shared_facilitator` seat with no owning delegation; explicitly
> map it to the legacy `scribe` deck workspace. Keep each regional Scribe mapped
> to the legacy `facilitator` workspace and keep existing Notetaker capacity.
>
> Add server-authorized setup for a fresh, evidence-free session using an
> approved roster. Serialize setup against the first claim; freeze the model
> after any seat/evidence, including disconnected seats. Do not add the Game
> Master creation selector here: GC-08 owns that UI.
>
> Enforce model/role compatibility, shared capacity one, authenticated seat
> ownership, rejoin, removal and stale-seat handling on the server. Permit shared
> reads only of explicitly forwarded/submitted/completed Green artifacts and
> explicitly addressed or shared White Cell messages. Exclude unforwarded and
> returned drafts, private notes, recipient proposal threads and other teams.
> Keep shared mutation capabilities closed in GC-04A. GC-05 enables only
> orientation-specific handoff/submission/return recovery; GC-06 enables proposal
> and recipient-thread operations; GC-07 enables RFIs and direct communications.
> Each owns its artifact/revision/recipient-specific contracts. This is foundation acceptance,
> not operational handoff or RFI acceptance.
>
> Expose the three participant entry paths; show the full region/role before
> claim. Restore the model and role from authenticated lookup/restore, reject
> URL/session mismatch, preserve base-path routing, and never treat selected
> region as authority. Provide a clearly labeled regional working view within
> the one deck workspace. Scope local state by model, seat and artifact region;
> clear inaccessible state on logout, seat change and removal. Explain deferred
> workflows in the UI; retain loading, full-seat, invalid-session, permission,
> retry and degraded-sync states and keyboard operation.
>
> Supply the three-seat hosted verification tools in GC-04A, before its sign-off.
> Preserve the default four-seat runner and its old manifests. Shared mode must
> prove distinct hosted identities, live recovery/removal, actual IndexedDB deck
> deletion with unrelated state retained, and simultaneous shared-seat claims
> through two distinct PostgreSQL connections with observed blocking and a
> committed winner check. Generate fixture IDs, preserve failure receipts and
> archive every fixture without deleting history. GC-12 extends/reuses these
> tools; it must not be the first source of required GC-04A verification.
>
> Deliver code, narrow tests and documentation together. Preserve historical
> evidence and mark earlier four-seat results as compatibility evidence only.
> Do not execute tests, npm, migrations or deployment actions. Supply complete
> human-run commands and self-contained SQL fixtures, with no REPLACE values.

**Tests:** Three joins and legacy workspace mapping; same-seat contention and
replacement; authenticated lookup/restore/reload; cross-seat and wrong-session
denial; both base paths and deep links; URL/model/delegation tampering; stale
storage and regional view switching; notification/deck cleanup; reconnect and
operator removal; direct RPC/RLS Scribe isolation, bounded shared reads, denied
shared writes, private notes/recipient threads; frozen setup and missing approval;
unified/four-seat compatibility; native keyboard controls. SQL fixtures must roll
back and must not disable installed controls. Mock results do not prove RLS.

**Acceptance:** Exactly three operational Green roles in the new model, with
one shared Facilitator capacity; both Scribes remain isolated by owner. The
server-confirmed seat/model determines access after join and reload. A URL,
storage value or working-view change cannot grant access. Old sessions and
evidence keep their identities. Fresh foundation evidence is required before
marking GC-04A verified and proceeding to GC-05. GC-05/06/07/08/09 dependencies
remain explicit. Manual screen-reader checks are excluded by the user's decision,
not recorded as passed.

Implementation and human verification: [GC-04A reconciliation](architecture/gc04a-shared-facilitator.md).

### GC-05: Implement separate orientations and the five-submission gate

**Objective:** Extend Strategic Orientation for the regional topology.

**Prerequisites:** Fresh GC-04A foundation evidence, its additive migration and
the versioned seat contract. This prompt owns the orientation permission changes;
its acceptance must not depend on GC-06 proposal permissions or GC-08 creation UI.
Use self-contained synthetic rehearsal fixtures while the creation UI is pending;
they neither approve a roster nor establish an operational creation path.

**Read first:**

- `docs/architecture/gc04a-shared-facilitator.md`
- `docs/architecture/green-regional-contract.json`
- `data/2026-09-24_gc04a_shared_facilitator.sql` and later function/policy replacements
- `src/services/database.js`, `src/services/supabaseMock.js`
- `src/features/scribe/sharedGreenContext.js`
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
> In the shared-Facilitator model, each regional Scribe forwards its own
> orientation to the single Facilitator, who submits each independently. The
> number of Facilitator seats does not reduce the five required submissions.
>
> Replace the GC-04A blanket shared-write denial only for Strategic Orientation.
> Implement the required Scribe handoff, shared Facilitator submission and
> White Cell return/correction/resubmission path, including narrowly scoped reads
> of the relevant review/revision records. Bind every operation to the authenticated
> seat/model and the persisted orientation's session, delegation, type, state and
> revision. Submitted role or artifact-type fields must not grant authority.
> Preserve Scribe isolation and immutable ownership. Do not enable generic shared
> action writes, proposal submission, recipient-thread writes, RFIs or direct
> messages. Keep unrelated unforwarded drafts and private notes inaccessible.
>
> Update additive SQL guards/RLS/RPCs, the adapter/mock, shared controller controls
> and capability guidance together. Replace orientation-only read-only rendering
> where needed; retain accurate deferred notices for proposals and RFIs. Preserve
> these orientation permissions when later prompts replace shared helpers.
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
Add both Scribes handing off to the same Facilitator, independent submissions,
White Cell return to the originating Scribe and corrected resubmission. Verify
real RPC/RLS rejection of wrong-session/region/revision/type requests, proposal
or RFI writes through orientation paths, and stale/revoked seats. Test the
orientation controls and remaining deferred notices in the shared workspace,
plus unified and four-seat compatibility.

**Acceptance:** The gate identifies the exact missing delegation and cannot be
bypassed through a non-UI write path. Both regional orientations complete their
submission/return/resubmission cycle through one Facilitator without waiting
for GC-06. Only orientation authority is added to the GC-04A foundation; the
five-submission gate and denial of unrelated shared writes have fresh evidence.

### GC-06: Implement regional proposals and handoffs

**Objective:** Scope Green proposal authoring and review to the originating delegation.

**Prerequisites:** GC-04A identity/model foundation, GC-05 orientation permissions
and gate, and the approved roster. Proposal/thread authorization and the minimum
White Cell review/return integration required here belong to GC-06, not GC-08.

**Read first:**

- `docs/architecture/gc04a-shared-facilitator.md`
- `docs/architecture/green-regional-contract.json`
- `data/2026-09-24_gc04a_shared_facilitator.sql` and the GC-05/later migrations
- `src/features/scribe/sharedGreenContext.js`, `src/services/supabaseMock.js`
- `src/roles/facilitator.js`
- `src/roles/scribe.js`
- `src/roles/whitecell.js`
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
> Each Scribe creates and forwards its delegation's proposal to the same shared
> Facilitator, who reviews and submits it to White Cell. Keep queues visibly
> separated by delegation and preserve permitted Facilitator editing for the
> appropriate workflow states. Existing four-seat sessions retain their matching
> regional Facilitator handoff.
>
> Extend GC-05's orientation-only authority with proposal-specific read/edit/
> submit/return recovery and approved recipient-thread operations. Replace the
> relevant GC-04A/GC-05 guards and read-only controls together, preserving already
> enabled orientation behavior. Validate the persisted source artifact, owner,
> state, revision, recipient approval and thread on the server. A generic submit
> flag or selected regional view must never authorize another artifact type.
> Keep RFIs/direct-message creation closed for GC-07 and private notes inaccessible.
> Update the shared capability notice to describe the remaining restrictions.
>
> Keep ownership immutable through White Cell return, correction, revision
> increment, and resubmission. Show region and revision on every review surface.
>
> Preserve separate Blue and Red approvals and append-only negotiation rounds.
> In the new model, responses reach the shared Facilitator under the originating
> artifact's delegation and recipient thread; only that region's Scribe receives
> any Scribe-visible return. Preserve historical regional-Facilitator routing.
>
> Scope idempotency and draft discovery so concurrent regional proposals do not
> overwrite or suppress each other.
>
> Do not introduce joint ownership in this change. A coordinated initiative may
> use two separately owned proposals with explicit references; it must not imply
> authorization from the other delegation.

**Tests:** Parallel drafting, invalid originators, wrong-region handoff, stale
revisions, double submission, two-recipient threads, and return routing.
Add direct RPC/RLS attempts to forge source type/owner/recipient, escape an
approved thread, mutate unforwarded drafts, or create RFIs/direct messages.
Retest GC-05 orientations and both older session models after helper replacements.

**Acceptance:** Both regional Scribes independently hand off to one Facilitator,
who submits both streams to White Cell without merging ownership, overwriting
records or leaking recipient-specific negotiations to the other Scribe. Proposal
and thread permissions are enabled without regressing orientations or opening
GC-07 operations; the full handoff/review/return cycle has fresh evidence here.

### GC-07: Scope RFIs, communications, and notifications

**Objective:** Implement delegation-aware messaging through the existing White Cell boundary.

**Prerequisites:** GC-04A seat/model and scoped state, plus GC-05/06 workflow and
recipient-thread permission contracts. GC-07 adds RFI/direct-message authority;
it must not redefine proposal approvals or wait for GC-08 to supply its core flow.

**Read first:**

- `docs/architecture/gc04a-shared-facilitator.md`
- `docs/architecture/green-regional-contract.json`
- `data/2026-09-24_gc04a_shared_facilitator.sql` and the GC-05/06/later migrations
- `src/roles/scribe.js`, `src/roles/whitecell.js`, `src/services/database.js`
- `src/services/supabaseMock.js`, `src/features/scribe/sharedGreenContext.js`
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
> The shared Facilitator creates RFIs for either delegation with explicit scope
> validated on the server. Answers and notifications retain that scope; access
> by the same Facilitator must not make an RFI visible to both Scribes. Preserve
> individual-role targeting and recipient-isolated proposal replies.
>
> Replace only the remaining RFI/direct-message foundation denials, including
> the associated read rules, scoped controller controls and deferred notices.
> Validate explicit owner scope on creation and persisted owner/state/revision
> on correction, return and resubmission; selected view and payload role confer
> no authority. Supply the minimum White Cell answer/return and participant
> reconciliation needed for this complete flow here. Preserve GC-05 orientations,
> GC-06 thread approvals and private-note isolation. Reflect permissions in SQL,
> adapter/mock and UI together; do not enable a parent-Green write bypass.
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
Add per-region shared Facilitator RFI creation/answer/return/resubmission, direct
White Cell messages, both Scribes' scoped reads and denied writes, stale/revoked
seats, and direct RPC/RLS attempts to change owners or bypass thread approval.
Retest GC-05/06 permissions and unified/four-seat compatibility.

**Acceptance:** Private messages remain private at the database boundary, and
shared Green announcements reach both delegations exactly as intended. Scoped
RFIs and direct communications work through the shared workspace with accurate
controls/notices, while orientation and proposal boundaries remain intact.

### GC-08: Update White Cell, realtime, and session administration

**Objective:** Enable Game Masters to create correctly configured regional sessions
and make regional ownership visible and operationally reliable.

**Known setup gap:** The current Game Master Create Session flow creates unified
Green sessions. GC-04 exposes regional participant choices only when the server
returns regional topology. Regional test fixtures do not establish that operators
can create regional sessions through the application. Closing this gap is explicit
GC-08 scope. First reconcile GC-01 through GC-04 with the shared-Facilitator
decision, then proceed through GC-05 through GC-07; GC-08 must not use a creation
selector as a substitute for those permission and workflow changes.

**Prerequisites:** GC-04A setup/freeze contract and the GC-05–07 operational
permissions and workflows. An approved roster is required for regional activation.
GC-08 integrates their administration and recovery; it does not defer their
minimum working White Cell submission, return or RFI paths until this prompt.

**Read first:**

- `src/roles/whitecell.js`
- `src/roles/gamemaster.js`
- `master.html`
- `src/services/database.js`
- `src/services/supabaseMock.js`
- `src/roles/landing.js`
- `src/roles/gamemaster.test.js`
- `src/services/database.green-storage.test.js`
- `data/2026-09-18_green_regional_storage.sql`
- `data/2026-09-19_green_regional_authorization.sql`
- `data/2026-09-22_gc04_session_context.sql`
- `data/2026-09-23_gc04_legacy_session_topology.sql`
- `data/2026-09-24_gc04a_shared_facilitator.sql`
- `docs/architecture/gc04a-shared-facilitator.md`
- The GC-05–07 migrations, capability tests and operator workflow documentation
- Later migrations replacing session creation, topology configuration, roster access or activation guards
- `docs/architecture/green-regional-contract.md`
- `docs/supabase-setup.md`
- `docs/supabase-rollback.md`
- `src/components/ui/Badge.js`
- `src/features/participants/ParticipantList.js`
- `src/stores/actions.js`
- `src/stores/requests.js`
- `src/stores/communications.js`
- `src/services/realtime.js`
- `src/services/sync.js`

**Implementation prompt:**

> Add an explicit Green configuration choice to the Game Master Create Session
> flow: Unified Green, or Regional Green with one shared Facilitator and two
> Scribes (Asia-Pacific and Europe). Show the three-seat arrangement, the
> selected configuration before submission and the server-confirmed configuration
> in the created session details. Preserve the existing unified creation contract
> for legacy clients and the behavior of existing four-seat regional sessions;
> do not make every new session regional implicitly.
>
> Regional setup must select an existing approved roster version through a
> Game Master-authorized server read. Validate the approval and capture its exact
> immutable snapshot on the server. Do not infer, merge, expand or approve the
> represented roster in this flow, and never use an empty synthetic test roster
> as exercise approval. If no approved roster is available, explain the blocker
> and prevent regional activation; unified creation remains available.
>
> Use the existing create/configure contracts where practical. Make regional
> creation and approved-roster configuration atomic on the server so a participant
> cannot claim a temporary unified seat between those operations. Add a dedicated
> RPC through an additive migration if required, preserving legacy signatures.
> Derive Game Master authority from the authenticated operator grant; browser
> flags, cached roles and supplied session/roster identifiers confer no authority.
>
> Reuse GC-04A's `configure_session_green_shared_facilitator(sid, roster_version)`
> validation and `database.configureSessionGreenSharedFacilitator` contract where
> applicable. That RPC configures an existing evidence-free session; two separate
> browser calls to create then configure are not atomic creation. Compose creation
> and configuration inside one authorized server transaction, with idempotent
> recovery. Preserve `green_seat_model='shared_facilitator_v1'` independently of
> `session_topology_version=2`, its capacity-one index, frozen roster/model, and
> authenticated lookup/claim/restore checks. Match the creation contract in the mock.
>
> Configure topology before any participant seat or historical evidence exists.
> Enforce the existing freeze and activation guards on the server, including
> concurrent setup/join attempts. Never convert occupied or historically used
> unified sessions, relabel historical NULL/v1 topology, or clear evidence to
> make a session configurable. New regional sessions must return the explicit
> shared-Facilitator model defined by the revised GC-01 contract from code lookup
> and support all three target GC-04 joins through the normal UI. Do not reuse
> the older version-2 meaning to silently broaden an existing Facilitator seat.
>
> The shared Facilitator uses one deck/RFI workspace and receives proposals
> from both regional Scribes, then submits each separately to White Cell.
> Display originating delegation on each queue item, review, return and RFI;
> selecting a region filters the work view, not the seat's authority. Enforce
> one shared Facilitator claim and keep each Scribe restricted to its own
> delegation. Do not create an additional regional Facilitator seat as a shortcut.
>
> Provide keyboard-operable configuration and roster controls plus explicit
> loading, no-approved-roster, permission, validation, retry and uncertain-network
> states. Do not display creation success or distribute a join code before the
> server confirms the requested setup. Handle double submission and lost responses
> without duplicate sessions or a silent fallback to unified Green; recover and
> display the authoritative result. Document the operator setup/recovery steps.
>
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
recovery, seat revocation, archive closure, and timeline visibility. Add normal-UI
unified and regional creation, keyboard setup, approved-roster snapshot binding,
missing/forged roster rejection, unauthorized direct RPC attempts, double-submit
and lost-response recovery, concurrent setup/join attempts, frozen-session
reconfiguration denial, and unchanged historical NULL/v1 and four-seat regional
sessions. Follow a newly UI-created session through code lookup, all three target
joins, separate Scribe handoffs to the same Facilitator and both submissions to
White Cell. Test same-Facilitator contention, regional view switching, separate
RFI routing and rejection of cross-Scribe reads/writes;
pre-created synthetic fixtures alone do not satisfy this creation-path test.
Retest the GC-05–07 permission boundaries through startup, reconnect and operator
removal in all three session models; creation must not reset or broaden them.

**Acceptance:** White Cell can distinguish and manage both streams, while
participant recovery never broadens access. A Game Master with an approved roster
can create a regional session through the application without SQL edits or copied
database IDs; participants then see Asia-Pacific Scribe, Europe Scribe and one
Shared Green Facilitator. Both Scribes hand off to that Facilitator and retain
separate ownership through White Cell submission and return. The
server prevents unauthorized setup, incomplete regional activation and topology
changes after the session is frozen. Unified creation and historical sessions
retain their existing behavior. Missing roster approval is an explicit blocker
for regional activation, not a passing setup result.

### GC-09: Update decks, onboarding, and session support

**Objective:** Adapt participant guidance for the two regional Scribes and shared
Facilitator, retaining guidance for compatible existing session models.

**Prerequisites:** GC-04A context/deck storage and completed GC-05–08 workflows,
including GC-07 deck-message audience rules. Final materials require the approved
roster. Guidance cannot substitute for an unimplemented permission or workflow.

**Read first:**

- `src/features/scribe/deckConfig.js`
- `src/features/scribe/deckStorage.js`
- `src/features/scribe/sharedGreenContext.js`, `src/roles/scribe.js`
- `docs/architecture/gc04a-shared-facilitator.md`
- GC-05–08 capability, workflow and setup documentation
- `decks/green/fractured-order-facilitator-deck.html`
- `decks/green/fractured-order-green-facilitator-deck.html`
- `src/features/onboarding/followAlong.js`
- `src/features/onboarding/platformOverview.js`
- `src/features/plugins/intercom.js`
- `docs/start-here-onboarding.md`
- `tests/unit/facilitator-decks.test.js`
- `tests/unit/start-here-role-coverage.test.js`

**Implementation prompt:**

> Provide clear instructions for the two regional Scribes and one shared
> Facilitator deck workspace. Reuse shared exercise material; label any regional
> deck sections or assignments explicitly rather than creating a second seat.
>
> Reconcile GC-04A's temporary read-only summaries and deferred-workflow notice
> with the controls enabled by GC-05–07. Each earlier prompt updates its own
> notices when implementing a capability; GC-09 completes the guides and deck.
> Never claim a pending capability works or unconditionally remove denial/error
> states. Preserve the confirmed model/seat namespace and explicit regional
> working keys; switching views must not load another region's draft or change
> the shared deck assignment. Keep foundation and old-model guidance accurate
> wherever those configurations remain supported.
>
> Audit which deck file the runtime actually loads; do not assume the separately
> named Green briefing is the active default.
>
> Define White Cell deck assignments and uploaded-deck state by explicit scope:
> shared Green deck or a named regional section/asset. Keep regional data isolated
> when the shared Facilitator changes views, and retain previous per-delegation
> deck behavior for four-seat sessions. Never infer a broader assignment audience.
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

**Tests:** Guidance matches enabled orientation/proposal/RFI controls; unresolved
capabilities remain explicit; shared/regional uploaded deck isolation, view
switch/reload/removal cleanup, keyboard operation, announcement audiences and
unified/four-seat guidance. Verify the runtime deck and text fallback actually used.

**Acceptance:** All three target seats have accurate onboarding, the shared
Facilitator has a working deck/RFI workspace, regional view state stays distinct,
and announcement delivery and existing session guidance remain correct.

### GC-10: Preserve PLI behavior and regional attribution

**Objective:** Carry regional provenance through PLI without changing methodology.

**Prerequisites:** GC-04A identity/model contract, GC-05's unchanged qualifying
orientation semantics and Blue orientation dependency, and GC-06's authoritative
proposal owner/revision contract. Staffing changes introduce no scoring inputs.

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
- `docs/architecture/green-regional-contract.json`
- GC-05 orientation and GC-06 proposal contract documentation

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
> Resolve originating delegation from the source artifact, not the shared
> Facilitator's NULL seat delegation or current working view. Preserve submitter
> identity separately. A staffing-model label, where needed for provenance,
> must not become a PLI model input or redefine the orientation dependency.
>
> Avoid unapproved changes to model prompts, scoring inputs, codebooks, or thresholds.

**Tests:** Equivalent regional proposals retain existing routing; Blue orientation
lookup remains unchanged; attribution survives all output stages; aggregate
counts reconcile.
Compare equivalent artifacts across shared, four-seat and unified staffing
without rewriting historical inputs or changing expected scoring behavior.

**Acceptance:** The split changes ownership and attribution, with no unintended
scoring change.

### GC-11: Extend research exports and historical compatibility

**Objective:** Extend canonical evidence exports to represent regional Green accurately.

**Prerequisites:** GC-04A persisted model/seat identity and GC-07–10 authoritative
workflow, recovery and provenance contracts. Preserve existing export access
controls; export work grants no additional participant access.

**Read first:**

- `src/features/export/researchExport.js`
- `src/features/export/exportCsv.js`
- `src/features/export/exportJson.js`
- `src/services/database.research-export.test.js`
- `src/services/database.participants-history.test.js`
- `src/features/export/researchExport.test.js`
- `docs/repository-artifact-policy.md`
- `docs/architecture/green-regional-contract.json`
- `docs/architecture/gc04a-shared-facilitator.md`
- `data/2026-09-24_gc04a_shared_facilitator.sql` and later model/history replacements

**Implementation prompt:**

> Include session topology, roster version, parent team, delegation, original
> persisted role, and semantic role wherever relevant.
>
> Export persisted `green_seat_model` separately from `session_topology_version`
> and artifact `delegation_id`. Preserve historical NULL values. If an effective
> compatibility label is added, mark it as derived using GC-04A's documented
> mapping: unified/historical NULL topology with NULL model is `unified_v1`,
> topology 2 with NULL model is `regional_pairs_v1`, and explicit shared staffing
> is `shared_facilitator_v1`. Reject or explicitly flag unknown combinations;
> do not silently label them unified or shared.
>
> Keep the shared submitter's original role and NULL owning seat delegation
> distinct from each submitted artifact's Asia-Pacific or Europe ownership.
> Retain author, submitting seat, revision and review evidence as captured;
> never infer missing historical authorship from the current roster or seat.
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

**Tests:** Mixed unified, historical NULL, four-seat and shared sessions in every
supported projection; original versus derived model fields; unknown model
handling; both regions submitted by the same shared seat; removal/replacement
history; immutable revisions/recipient threads; distinct artifact counts and
unchanged operator/participant export access.

**Acceptance:** A researcher can reconstruct who submitted each record, for which
delegation, under which roster and staffing model, without changing historical
evidence. Shared staffing cannot collapse two owners or relabel paired sessions.

### GC-12: Build the rehearsal and release evidence package

**Objective:** Extend contract and browser rehearsals for regional Green.

**Prerequisites:** GC-01–11 including GC-04A; each stage's actual migration order,
permission expectations and fresh evidence. An incomplete workflow or unresolved
roster is recorded as a blocker, never hidden by a synthetic fixture or old PASS.

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
- `docs/architecture/gc04a-shared-facilitator.md`
- `tests/sql/gc04a-shared-facilitator-editor.sql`
- `tests/unit/gc04a-context.test.js`, `src/services/database.shared-green.test.js`
- `playwright.gc04a.config.js`, `scripts/gc04-live-check.mjs`
- The GC-05–11 migrations, stage-specific tests and evidence procedures

**Implementation prompt:**

> Add independently evidenced procedures for all three target seats, including
> both Scribes handing off to the same Facilitator. Preserve unified and
> four-seat regional coverage; prior four-seat results are not evidence of the
> shared-Facilitator model.
>
> Verify staged permissions: GC-04A denies shared mutations; GC-05 enables only
> orientations; GC-06 adds proposals/approved threads; GC-07 adds scoped RFIs and
> direct messages. Add positive and negative RPC/RLS and UI checks at each stage,
> retaining earlier capabilities and all remaining denials. Later additive
> migrations must not restore superseded blanket denials or widen generic access.
> Preserve historical test output with its revision/migration stage; version
> expected denials when a later prompt intentionally enables that exact operation.
> Do not run a foundation-only assertion against the final system and weaken
> security to make it pass. Re-run unchanged isolation/seat/history invariants.
>
> Reuse GC-04A's delivered `--shared` hosted runner and its observed contention
> and IndexedDB cleanup checks; extend it for the later permission stages while
> retaining older-model coverage. Do not defer foundation tooling until GC-12.
> Supply complete commands and generated
> synthetic identities/fixtures, with containment and cleanup, for hosted auth,
> real concurrent shared-seat claims, both base paths, reconnect, removal, the
> GC-08 normal creation path and GC-11 mixed-model exports. No manual REPLACE
> values or historical PASS substitution. Distinguish local mock, real SQL and
> hosted evidence; manual screen-reader checks remain excluded, not passed.
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

**Tests:** The staged permission matrix and all three model compatibility suites;
normal-UI creation through both regional handoffs, five orientations, separate
White Cell reviews/returns, private RFIs/threads, recovery and reconciled exports.
Real multi-connection contention yields one shared claim without destroying
seat history; stale/revoked seats and forged scope remain denied.

**Acceptance:** Implementation has reproducible verification instructions and
explicit outstanding evidence. Only the human records gate completion after
executing verification. Evidence identifies the actual frontend revision,
migration stage, model and environment; each enabled capability and retained
denial is demonstrated without relying on earlier four-seat results.

## Session-operation prompt cards

These prompts support the human roles or a supporting assistant. They do not
authorize an assistant to invent positions, submit records, or adjudicate outcomes.
Use the approved roster in the placeholders. They describe the target regional
workflow and are not evidence that the current platform supports it.

### OP-01: Shared Green Facilitator

> You are the single Green Facilitator serving Asia-Pacific and Europe, each
> with its own `[approved represented entities]` and regional Scribe.
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
> Have each Scribe record its region's agreed proposal and unresolved differences. Review
> originators, intended partners, timing, conditions, expected outcomes, and any
> unsupported assumptions.
>
> Use the shared Facilitator seat for the deck, RFIs, negotiation replies and
> White Cell submissions. Review the artifact's originating region before every
> action. Submit each region's forwarded artifact separately and route corrections
> back to its own Scribe. Do not copy one region's decisions into the other's
> record or disclose private drafts or recipient threads to the other Scribe.
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
> Forward the completed draft to the shared Green Facilitator with Asia-Pacific
> ownership intact. Record its artifact
> ID and revision. If White Cell returns it, correct the same artifact and preserve
> the review history.
>
> Do not submit directly to White Cell, create Facilitator-owned RFIs, or alter
> European records.

### OP-03: European facilitation checklist for the shared Facilitator

This stable prompt ID is a regional checklist for the OP-01 shared Facilitator,
not a second seat. It replaces the former separate-European-Facilitator target;
existing four-seat session records and permissions are unchanged.

> While facilitating Green - Europe for `[approved represented entities]`,
> select the European work context in your shared Facilitator workspace.
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
> Manage European RFIs, submission to White Cell, and approved negotiation
> replies with their European attribution intact. Use the same Facilitator seat
> as Asia-Pacific, keeping the two regions' records and recipients separate.
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
> Forward drafts to the shared Green Facilitator with European ownership, artifact IDs and
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
| Before play | Confirm both authorized regions, roster, shared role and deck/RFI access | Confirm own regional workspace and empty/current records | One shared Facilitator and two correctly occupied Scribe seats |
| Strategic Orientation | Elicit and review delegation position | Record forecast, orientation, and strategy | Two distinct Green orientations |
| Move opening | Explain scene and standing questions | Record relevant decisions and references | Shared understanding within each delegation |
| Deliberation | Surface conditions and disagreement | Distinguish decisions from discussion | Faithful draft |
| Handoff | Review completeness and authorization for the named region | Forward identified revision | Shared Facilitator receives the region-owned artifact |
| White Cell review | Submit and track responses | Correct returned records | Preserved revision history |
| Negotiation | Own replies and commitments | Maintain decision record | Separate regional and recipient threads |
| Move close | Confirm pending obligations | Reconcile handoff ledger | No orphaned or duplicate submissions |
| Hot wash | Explain why positions changed | Link conclusions to recorded evidence | Region-specific and joint findings |

### OP-05: Cross-region coordination

> Each delegation states its current position, desired coordination, conditions,
> and authorized disclosure. Identify agreement and disagreement explicitly.
> Choose what may be shared with Blue, Red, or White Cell. The shared Facilitator
> submits separately on each delegation's behalf using its own authorized record.
> Consultation and sharing a Facilitator do not create a joint commitment.

### OP-06: White Cell readiness

> Confirm the session uses regional Green, the approved roster is recorded, and
> the shared Facilitator and both regional Scribes occupy the three target seats
> correctly. Confirm both Green orientations
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

**Pass:** All three target roles resolve correctly, seat claims behave atomically in the
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

**Pass:** Updated 19-actor operational and 24-actor role procedures for the
shared-Facilitator model complete, with the unchanged existing roster assumptions;
compatible four-seat sessions retain their separate 20/25-actor coverage,
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
| 2026-09-18 | 1.1 | User-requested GC-08 scope addition: Game Master unified/regional creation choice, approved-roster selection, atomic server-authorized setup, freeze protection, recovery, and UI-to-regional-join acceptance tests. | Prompt update only; no implementation or verification status changed |
| 2026-09-18 | 1.2 | User clarified two regional Scribes forwarding to one shared Green Facilitator for deck, RFIs and White Cell submission. Updated target, decisions, affected GC prompts, setup acceptance, operating cards and target rehearsal counts; requires GC-01 through GC-04 reconciliation before GC-05. | Documentation only; existing four-seat runtime, contracts, historical records and test evidence unchanged; new-model verification pending |
| 2026-09-18 | 1.3 | User-authorized GC-04A adds the versioned shared-Facilitator foundation, prerequisites, implementation boundary, tests and acceptance before GC-05. | Code and fixtures supplied; no tests, migrations, npm commands or deployments executed; human verification pending |
| 2026-09-18 | 1.4 | Aligned GC-05–12 prerequisites, read lists, staged permissions, tests and acceptance with GC-04A: orientations in GC-05, proposals/threads in GC-06, RFIs/direct messages in GC-07, atomic setup in GC-08, accurate guidance, unchanged PLI, distinct staffing-model exports and staged evidence. Corrected companion contract/runbook dependencies. | Specification/dependency alignment only; no runtime permissions or prompt statuses changed; tests and execution gates not run |
| 2026-09-18 | 1.5 | Clarified GC-04 as the paired/unified baseline and GC-04A as its shared-seat amendment. Assigned and supplied hosted three-seat, actual two-connection contention and IndexedDB cleanup tooling in GC-04A; GC-12 reuses it. Documented archived hosted synthetic fixtures separately from rolled-back SQL tests. | Tools/tests supplied, not executed; no migration, deployment or gate status changed |
