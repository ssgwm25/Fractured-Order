# GC-01: Regional Green identity and permission contract

Contract version **1.3.0**, roster decision recorded **2026-09-20**;
GC-06 migration amendment **2026-09-26**. Status: proposed,
not activated; human review and verification pending. This is the implementation
reference for GC-02 through GC-12 in the [prompt book](../green-cell-regional-split-prompt-book.md).
The [declarative contract](green-regional-contract.json) contains the exact
identifiers, route mappings, approved roster and historical candidates, and permission matrix. It is a
specification fixture, not a runtime authorization service. No production code
imports it, and no regional functionality is enabled by GC-01.

## GC-04A shared-Facilitator amendment

The new target uses `session_topology_version=2` and the independent persisted
`green_seat_model='shared_facilitator_v1'`: two regional Scribes and one shared
Green Facilitator. NULL model on existing topology 2 remains `regional_pairs_v1`;
NULL model on topology 1 or historical NULL topology remains `unified_v1`.
Those are response labels, not historical backfills. An unknown model is denied.
The original GC-01 source inventory below records the earlier paired model.

The shared seat's `delegation_id` is NULL; its explicit role/model authorizes
bounded reads from the two existing owners. Owned Green artifacts still require
exactly one region. No third owning delegation or merged proposal is introduced.
New sessions reject either per-region Facilitator role; old sessions reject the
new shared role. The two Notetaker identities/capacity remain unchanged.

The read-only foundation profile below describes the GC-04A implementation;
GC-05 adds orientation-specific submission/return recovery, GC-06 adds proposal
and approved-thread operations, and GC-07 adds scoped RFIs/direct communications.
Each must extend the preceding stage with tested per-artifact/revision/recipient
contracts, matching SQL, adapter/mock, UI controls and notices. Do not enable a
generic shared write capability or defer GC-05 submission authority to GC-06.
The foundation excludes drafts, returned drafts, notes, recipient threads and other teams.
Five orientation subjects remain required in either regional model. Rehearsal
targets become 19 operational / 24 role-matrix actors; preserve old 20/25 results
as evidence of the earlier model only. The subsequent roster decision is recorded
under D-02 below; it does not activate a session.

GC-04A implementation, deferred workflows and exact verification instructions:
[shared-Facilitator reconciliation](gc04a-shared-facilitator.md). Its additive
migration and tests have not been executed by the agent. This amendment does
not declare the exercise operational or any gate passed.

The JSON fixture's `deferred_mutations` lists implementation owners, not enabled
permissions. The historical foundation profile remains unchanged. Historical version 1.2.0
selected `shared_facilitator_orientations`: orientation submission is bound to the
persisted region and Scribe handoff revision; returned orientations and their
linked review/revision records are readable. Private drafts and unrelated shared
writes remain closed. See [GC-05 implementation and verification](gc05-regional-orientations.md).
Later prompts must version the applicable permission expectations and preserve
historical evidence; no model label or document update activates those operations.
GC-08 composes atomic creation around GC-04A setup/freeze rules; GC-09 reconciles
guidance with completed workflows; GC-10 preserves scoring; GC-11 exports staffing
model separately from topology/ownership; GC-12 verifies each stage and all three
compatible session models. See the prompt book for each stage's tests/acceptance.

GC-06 selects `shared_facilitator_proposals`, retaining the two earlier profiles
as historical contracts. Proposal RPCs bind active seat, owner, state, revision and
row version. Threads require a persisted approval for their exact source revision
and recipient; private notes, shared RFIs and direct creation remain closed. See
[GC-06 implementation and human verification](gc06-regional-proposals.md).

## Historical GC-01 baseline

GC-01 delivers architecture, the fixture, and narrow contract regression tests.
Storage, RLS/RPCs, join UI, and workflow changes belong to later prompts. Adding
the fixture and tests is the only supporting scope beyond this document and the
requested book link. No migration, roster expansion, PLI change, new framework,
or participant decision is part of this change.

## Current behavior: source evidence, not a deployed gate result

| Concern | Current repository behavior |
| --- | --- |
| Topology | `TEAM_OPTIONS` and `ENUMS.TEAMS` retain Blue, Red, Green, Industry and operator identities. There is no regional session topology contract. |
| Green capacity | One displayed Facilitator, one displayed Scribe, and two Notetakers. `src/core/config.js` and SQL seat limits key capacity by legacy role. |
| Legacy inversion | `green_facilitator` is the displayed Scribe at `teams/green/facilitator.html`, controlled by `src/roles/facilitator.js`. `green_scribe` is the displayed Facilitator at `teams/green/scribe.html`, controlled by `src/roles/scribe.js`. |
| Authority | Supabase resolves `auth.uid()` through an active `session_participants` seat and `participants.auth_user_id`. Helpers resolve team and legacy surface, not delegation. Browser context also uses route/body/storage values; these are not independent authorization evidence. |
| Orientation | The Green profile forecasts Blue, selects Green's catalogue orientation, and records strategy. Envelope version 2 is independent of session topology. Legacy v1 envelopes remain readable. Required teams are Blue, Green, Red, Industry. The JS completion helper qualifies parsed orientation envelopes with status `submitted` or `adjudicated`; it does not require a new approval. SQL uniqueness is `(session_id, team)`. |
| Red forecasts | Existing keys `green_asian_pacific` and `green_europe` describe Red forecasts. They do not establish regional seats or prove historical Green decisions. |
| Proposals | `PROPOSAL_ORIGINATORS` is one flat list. One Green proposal may name Blue and Red; White Cell approves recipients independently. Immutable rounds carry source proposal/revision, recipient, thread, parent, and sender metadata. There is no originating delegation. |
| Role/SQL difference | UI assigns final submission, RFIs, and negotiation to the displayed Facilitator. Some existing SQL is broader: the thread append RPC permits both legacy `facilitator` and `scribe` surfaces; action and review SELECT policies include session-wide reads. Do not describe existing policy as regional isolation. |
| RFIs/messages | RFIs are created/resubmitted by legacy `*_scribe` (displayed Facilitator), read by the owning team and authorized operators. Communication policies use sender role, source/recipient team and role. The later thread policy supersedes the earlier direct-message read policy. |
| Notes | Two Notetakers share team identity. `notetaker_data` is merged by session/move; JSON contains `team_entries` and `participant_entries`. Browser seat/team selection does not conceal other JSON fields at the database boundary. |
| Operators | White Cell Lead has the shipped review/control surface. White Cell Support and viewer are compatibility states without shipped join buttons. Five SME roles retain matching PLI review or handoff duties; they are not Green seats. SQL additionally retains Game Master PLI/handoff break-glass access. |
| Retired training | `2026-08-26_decommission_ssg_training.sql` retires the training product, removes training RPCs and protects historical rows under `retired_training_archive`. It is not a live regional training surface. |
| Rehearsals | Existing documentation specifies 18 operational actors and 23 role-matrix actors, including eight Notetakers. Those totals describe unified Green. Old evidence is not GC-01 verification. |
| Decks | The cited Green briefing has regional physical tables. Runtime `deckConfig.js` defaults instead to `decks/green/fractured-order-facilitator-deck.html`. Physical seating and deck vocabulary are not permission rules. |

Primary sources read: [README](../../README.md), [teamContext.js](../../src/core/teamContext.js),
[enums.js](../../src/core/enums.js), [Strategic Orientation](../../src/features/actions/strategicOrientationDetails.js),
[proposal details](../../src/features/actions/proposalDetails.js),
[role matrix](../role-capability-test-matrix.md), [operational rehearsal](../operational-rehearsal.md),
and [Green briefing](../../decks/green/fractured-order-green-facilitator-deck.html).
The impact inventory below identifies additional source dependencies, including
later SQL replacements. This review makes no claim about applied database state.

## Proposed versioned identity

These are reserved contract fields for GC-02, not claims that columns exist now.

| Field | Contract |
| --- | --- |
| `session_topology_version` | Integer `1` means unified Green; integer `2` means regional Green. Unknown versions fail closed. This version does not replace artifact envelope, revision, export, or PLI versions. |
| `team` | Remains `green` for both delegations. No new parent teams. |
| `delegation_id` | Exactly `asian_pacific` or `europe` on v2 Green seats and owned records; `null` on v1 Green and all non-Green records. A missing delegation on a v2 Green write is invalid, not a unified record. |
| `green_roster_version` | `green-roster-v1` records the user's first explicit roster choice under D-02. Database registration and frozen session binding still require their existing authorized server path; this fixture is not a database approval receipt. Never persist a candidate ID or the word `pending` as an approved roster. |
| `green_roster_snapshot` | With the approved version, freeze per-delegation represented entity IDs, display labels, explicit aliases, source references, approving exercise authority and approval date. Never resolve membership against a mutable global list. |
| `role` / `semantic_role` | Preserve the original persisted role; resolve semantic role and workspace using the explicit registry below. Never derive authority by splitting arbitrary strings or inverting every suffix. |
| Ownership key | `(session_id, team, delegation_id)` plus the existing artifact ID/revision or Notetaker seat identity. Persist authoritative scope alongside the artifact and its snapshots; text envelopes cannot override it. |

Missing topology on an existing session is interpreted as v1 by a compatibility
reader, without rewriting its rows. New session creation must choose a supported
version explicitly. A v2 setup may be prepared before roster approval, but
participant claims and operational writes must stay closed until the approved
roster version and snapshot are present. Freeze topology and roster before the
first seat or artifact; reject changes once either exists, including after seats
disconnect. There is no automatic active-session conversion.

The v2 orientation subjects are exactly `blue`, `green:asian_pacific`,
`green:europe`, `red`, `industry`. These are completion keys, not replacement team
IDs. V1 retains `blue`, `green`, `red`, `industry`. The qualifying submission
predicate stays the existing one; submitted-to-White-Cell is not silently changed
to approved/completed. Enforce uniqueness with explicit NULL handling. One region
cannot satisfy the other region's gate. One global clock, move and phase remain.

## Roster decision D-02: approved as green-roster-v1

On 2026-09-20 the user explicitly approved **Asia-Pacific: South Korea, Japan,
ASEAN; Europe: UK, France, EU** in this conversation. This is the approval source
for `green-roster-v1`, recorded in contract version 1.2.1. Keep the existing
proposal identifier `ROK` for South Korea, with that explicit label/alias.
The exact canonical lists are `ROK, Japan, ASEAN` and `UK, France, EU`.
EU and ASEAN remain single represented entities; no member countries are added.

This records the roster choice only. No database approval row, operational
session, migration, permission or historical artifact was created or changed.
Registration must use the existing approval mechanism with actual operator
provenance, followed by frozen session snapshots and GC-06 server-side membership
validation. GC-06 supplies that validation; `membership_validation_enabled` now
describes the supplied code, not an installed migration or a passed gate. Actual
registry provenance and the frozen operational session snapshot remain prerequisites.
Briefing reconciliation remains GC-09.

The following discrepancy is retained as historical source evidence:

| Candidate/source | Asia-Pacific represented entities | Europe represented entities |
| --- | --- | --- |
| `proposal_form`: `PROPOSAL_ORIGINATORS` | ROK, ASEAN, Japan | EU, France, UK |
| `green_briefing`: Green briefing slide 11 | Australia, Japan, Republic of Korea | European Union, Germany, United Kingdom |

The form contains a flat list, not a regional membership mapping. The table
records the candidate partition from the prompt book, not a deployed validator.
ROK/Republic of Korea, EU/European Union and UK/United Kingdom have corresponding
labels. ASEAN versus Australia and
France versus Germany are substantive conflicts. EU and ASEAN are represented
entities: neither expands automatically into member countries.

The approved selection matches the proposal-form candidate, without merging or
enlarging either list. Retain both historical candidates and their source
references. No participant is assigned a decision or an entity commitment by
this document.

`ENUMS.TARGETS` and the Blue action country/industry focus lists describe possible
action targets, not Green membership. They include entities outside either
candidate and must never supply regional originator permissions. Membership
validation remains disabled in the specification fixture pending implementation;
the recorded choice does not permit arbitrary originators or prove operational
activation. GC-06 must enforce the approved, session-bound regional membership.

## Identity and route matrix

Routes below are application-relative and must use the existing base-path helper.
The `delegation` query parameter requests a view only. Startup/rejoin must resolve
the authenticated seat first and reject unknown, missing or mismatched regional
context without falling back to Blue or unified Green. Deep links do not claim a
seat. Routes reuse existing HTML/controllers; no new Vite entry pages are needed.

| Topology | Persisted role | Semantic role | Delegation | Capacity | Route | Permission profile |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | `green_shared_facilitator` | facilitator | null | 1 | `teams/green/scribe.html` | shared_facilitator_proposals |
| 2 | `green_asian_pacific_facilitator` | facilitator | asian_pacific | 1 | `teams/green/scribe.html?delegation=asian_pacific` | regional_facilitator |
| 2 | `green_asian_pacific_scribe` | scribe | asian_pacific | 1 | `teams/green/facilitator.html?delegation=asian_pacific` | regional_scribe |
| 2 | `green_europe_facilitator` | facilitator | europe | 1 | `teams/green/scribe.html?delegation=europe` | regional_facilitator |
| 2 | `green_europe_scribe` | scribe | europe | 1 | `teams/green/facilitator.html?delegation=europe` | regional_scribe |
| 2 | `green_asian_pacific_notetaker` | notetaker | asian_pacific | 1 | `teams/green/notetaker.html?delegation=asian_pacific` | regional_notetaker |
| 2 | `green_europe_notetaker` | notetaker | europe | 1 | `teams/green/notetaker.html?delegation=europe` | regional_notetaker |
| 1 | `green_facilitator` | scribe | null | 1 | `teams/green/facilitator.html` | legacy_scribe |
| 1 | `green_scribe` | facilitator | null | 1 | `teams/green/scribe.html` | legacy_facilitator |
| 1 | `green_notetaker` | notetaker | null | 2 | `teams/green/notetaker.html` | legacy_notetaker |

V2 allocates existing Green Notetaker capacity as **one Asia-Pacific seat and one
Europe seat**. These regional identities replace the unified two-seat pool for
new v2 sessions; they do not coexist with it. V1 keeps the original pool, without
assigning regions to existing people or notes. Replacements inherit the seat's
region, not another region's notes; retain original authors and seat history.
Each v2 delegation has three seats total, including its Notetaker. Across the
exercise, Notetaker capacity remains eight. Only the extra Facilitator/Scribe
pair adds capacity: future operational and role rehearsals become 20 and 25 actors.

| Persisted role | Route | Permission profile | Entry/compatibility rule |
| --- | --- | --- | --- |
| `whitecell_lead` | `whitecell.html` | white_cell | Existing operator grant and session checks; both delegations |
| `whitecell_support` | `whitecell.html` | white_cell | Compatibility only; preserve existing granted White Cell operations, no new join button |
| `white` | `master.html` | game_master | Existing Game Master operator flow; do not infer a White Cell seat from the string alone |
| `sme_econ` | `sme.html` | sme_review | Existing Econ authorization and Macro seat |
| `sme_ni_escalation` | `sme.html` | sme_review | Existing NI/Escalation authorization and seat |
| `sme_diplomacy_information` | `sme.html` | sme_review | Existing paired Dip/Info authorization and seat |
| `sme_tsj` | `sme.html` | sme_handoff | Existing TSJ handoff/packet acknowledgement |
| `sme_verba` | `sme.html` | sme_handoff | Existing Verba handoff/packet acknowledgement |
| `viewer` | `teams/green/facilitator.html?mode=observer` | observer | Passive compatibility route; no new claim or regional private access |

Retain existing White Cell alias normalization (including team-prefixed aliases).
The SQL normalizer also maps `white` to White Cell Lead in participant contexts;
the Game Master flow uses its separate `gamemaster` grant. Preserve that boundary.
Blue, Red and Industry role IDs and capacities remain unchanged. Regional Green
roles are invalid in v1; unified Green role claims are invalid in v2. Do not
reinterpret one as the other when resuming cached sessions.

## Permission matrix and server enforcement

The following profile matrix is normative for v2; legacy rows explicitly retain
the v1 contract. Every identity above references exactly one profile. All permits
also require existing lifecycle, revision, session, and operator/SME checks.
`no` means deny, including direct API calls. Nothing grants a regional actor
cross-region private reads or writes. The fixture uses these exact column names.

| Profile | read_artifacts | edit_artifacts | submit_artifacts | rfis | direct_messages | proposal_threads | notes | review_or_control |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| regional_scribe | own | draft_returned | no | read_own | addressed | read_own | no | no |
| regional_facilitator | own | forwarded_returned | own | manage_own | own_white_cell | append_own | no | no |
| shared_facilitator_foundation | both_forwarded_submitted_completed | no | no | no | addressed_read_only | no | no | no |
| shared_facilitator_orientations | foundation_plus_orientation_returns_reviews | no | orientation_handoff_revision_only | no | addressed_read_only | no | no | no |
| shared_facilitator_proposals | orientations_plus_owned_proposal_returns_threads | proposal_forwarded_returned | orientation_and_proposal_handoff_revision_only | no | addressed_read_only | approved_current_revision_threads | no | no |
| regional_notetaker | own_released | no | no | read_own | addressed | no | own_seat | no |
| legacy_scribe | legacy_session | draft_returned | legacy_submit | read_own | legacy_addressed | legacy_append | legacy_notes_read | no |
| legacy_facilitator | legacy_session | forwarded_returned | own | manage_own | own_white_cell | legacy_append | legacy_notes_read | no |
| legacy_notetaker | legacy_session | no | no | read_own | legacy_addressed | legacy_thread_read | legacy_notes_write | no |
| white_cell | both | no | no | review_both | both | review_both | read_both | white_cell |
| game_master | both | no | no | read_both | read_both | read_both | read_both | session_admin |
| sme_review | assigned | no | no | no | no | no | no | matching_pli_seat |
| sme_handoff | released_packets | no | no | no | no | no | no | matching_ack |
| observer | released | no | no | no | addressed | no | no | no |

Permission terms have these exact bounds:

- `own`: the confirmed seat's session, parent team and delegation, including its
  revision/review history. `draft_returned` allows Scribe create/edit/delete of
  eligible drafts and correction of returned artifacts, plus handoff to its own
  Facilitator. It never allows final submission or deleting review history.
  `forwarded_returned` allows Facilitator review/edit of handed-off or returned
  artifacts and submission/resubmission, preserving existing revision checks.
- `own_released`: own-delegation artifacts submitted to White Cell or explicitly
  released through an authorized projection; no private drafts. `released` is
  only explicitly public/session-released content and never a private row made
  visible by a browser filter. No new viewer access is introduced.
- `read_own` RFIs: regional team members can read their region's RFI and history.
  `manage_own`: only that region's Facilitator creates, corrects and resubmits;
  only White Cell returns/answers. RFI questions/answers are not implicitly shared
  across Green. Lifecycle restrictions continue to apply.
- `addressed`: only explicit role/delegation/shared announcements addressed to the
  seat. A Facilitator-to-White-Cell direct exchange stays private to that
  Facilitator seat and operators, unless White Cell explicitly releases a copy.
  `own_white_cell` permits sending this exchange. A regional Scribe/Notetaker may
  read region-wide messages, not a message targeted only to the Facilitator.
- `read_own` threads: Scribe reads the originating region's approved Blue and Red
  threads. `append_own`: only its Facilitator conducts that region's negotiation.
  The Blue/Red recipient sees only its independently approved thread and the
  forwarded snapshot, not the other recipient's rounds, regional private draft,
  or another proposal. Existing Blue/Red semantic role duties remain unchanged.
  Notetakers get no private thread access; an explicitly released summary is a
  separate record. Thread locks, revision links, retries and append-only history
  survive. White Cell approves/forwards/reviews; it does not impersonate a
  delegation's negotiating voice.
- `own_seat`: notes/dynamics/alliance/captures under the assigned region and
  Notetaker seat, with original author attribution. Operators may read/export
  both; other regional staff do not automatically acquire private note access.
- `both`/`read_both` apply to authorized operators in the selected session.
  White Cell may review/return/complete both regions and control the one exercise
  clock. It does not edit participant decisions. Game Master retains session,
  participant, export and plugin administration and the existing SQL Game Master
  PLI/handoff break-glass permissions. GC-01 adds no new editing power or SME UI
  workflow to that grant. White Cell review still requires its separate checks.
- `assigned`/`matching_pli_seat`: SMEs receive adjudication inputs/results under
  existing seat and finalization gates for either delegation, not private drafts,
  notes, RFIs or negotiations. Econ, NI and paired Dip/Info retain their current
  track powers. `released_packets`/`matching_ack`: TSJ/Verba receive the existing
  action-complete handoffs and separately finalized PLI packets and acknowledge
  only their matching seat. White Cell's PLI view remains read-only.
- Legacy tokens are confined to v1. `legacy_session` means current session-wide
  action/review SELECT with the existing team-filtered UI. `legacy_submit` means
  the Scribe UI hands off, while the existing SQL update policy also permits
  same-team submission under workflow guards. `legacy_append` permits both legacy
  Scribe/Facilitator surfaces in the thread RPC; only the Facilitator UI conducts
  negotiations. `legacy_thread_read` is the current source/recipient-team thread
  SELECT, including a team's Notetakers. `legacy_addressed` retains current
  sender/recipient/team metadata OR matching; it does not promise role-private
  delivery beyond the actual legacy policies. `legacy_notes_read` retains
  session-wide note-row SELECT; `legacy_notes_write` additionally retains
  team-authorized Notetaker writes, with seat entries selected in the browser.
  `own` in a legacy row means unified Green within that session. These explicit
  compatibility allowances never apply to v2 or another session; do not retrofit
  regional ownership onto historical records.

GC-03 must implement a registry-backed server capability resolver from
`auth.uid()` and the authenticated active **session seat**, never mutable global
participant role, URL, localStorage, payload team, or sender metadata alone.
Check the persisted topology, seat status, parent team, delegation and capability
for every SELECT, INSERT, UPDATE, DELETE and RPC, plus the referenced record's
session/scope. Match old and new ownership on updates; ownership cannot be moved
by changing payload columns. Unknown/ambiguous scope fails closed. Claims must be
atomic; removed, replaced, stale or archived seats cannot regain authority by
replaying cached context. Preserve heartbeat and the protected retired-archive boundary.

RLS and SECURITY DEFINER RPC checks must agree. Replace permissive legacy
session-wide policies for v2; adding a restrictive-looking alternative policy
while leaving an OR-permissive policy is insufficient. Scope review rows, linked
artifacts, timeline, notifications, realtime, exports, and note JSON reads as
well as the primary action. Browser filtering is presentation only. No private
payload may be copied into a publicly readable event or session-wide broadcast.

Audience and ownership are separate. Proposed `sender_delegation_id` and
`recipient_delegation_id` accompany validated `source_team`, `recipient_team`,
role and scope metadata. A single regional audience is
`recipient_scope = delegation`; shared Green delivery must explicitly use
`recipient_scope = both_green_delegations` with `recipient_team = green` and
no single recipient delegation. Role scope is narrower than delegation scope.
Reject conflicting scope fields; do not broaden a role-targeted message merely
because `to_role` or fallback team is Green. `all` remains an explicit session
announcement, never a private-message fallback. Bare `green` is a legacy v1
audience; new v2 producers must select a region or explicit shared scope. Shared
copies do not change source ownership, unlock drafts, or create joint commitments.
White Cell sends shared Green announcements under its existing communication
authority; this audience does not give regional staff a new broadcast capability.

## Compatibility and evidence preservation

- Keep original IDs, revisions, persisted roles, envelope contents, captured
  events, review snapshots, and immutable negotiation rounds. Never infer a
  historical delegation from originator text, a forecast, or a user's current seat.
  V1 data can be displayed as unified/legacy for clarity without relabeling storage.
- Preserve catalogue IDs/labels/tags and version-1 readers. The briefing's
  align/hedge/defect descriptions do not replace the platform catalogue.
- Scope new browser draft, deck, note and notification keys by session, topology,
  role/seat and delegation as applicable. Restore only after server confirmation;
  clear inaccessible state on seat change, removal, logout and reconnect.
- Carry scope through action/review snapshots, RFI history, source proposal and
  recipient thread metadata, participant display-name snapshots and research
  exports. A regional proposal has one source ID even when forwarded twice.
  Parent Green totals count distinct source artifact IDs, not recipients/rounds.
  Keep legacy, Asia-Pacific and Europe distinguishable in cross-session exports.
- Keep `team = green` for PLI: Green proposals retain Macro-skipping and paired
  Diplomacy/Information routing, and NI's Blue orientation dependency. Delegation
  is provenance/filtering only; no change to prompts, scoring inputs or thresholds.
- Use additive migrations after reviewing the full replacement chain below.
  Rollback must retain regional evidence and a compatible reader; never drop
  ownership columns, combine regional records, or reinterpret v2 as v1.

## Impact inventory: Green ownership, access, aggregation and completion

This inventories both literal Green checks and generic team/role/session paths
that operate on Green. Paths are relative to repository root. Entries are work
sites for later prompts, **not a claim they were modified**. Pure color constants,
generic accessibility `role` attributes and display-only Green colors do not
grant access; static/pilot historical material stays unchanged.

| Area and exact work sites | Existing coupling and required regional treatment | Owner prompt |
| --- | --- | --- |
| `src/core/teamContext.js`, `src/core/enums.js`, `src/core/config.js`, `src/core/types.js` | Four-team/legacy role registries, route regexes, response target sets, capacities and types. Separate semantic roles from legacy workspace; fail closed for unknown regional identities. | GC-02–04 |
| `index.html`, `teams/green/facilitator.html`, `teams/green/scribe.html`, `teams/green/notetaker.html`, `vite.config.js`, `src/core/navigation.js` | Join choices, body team, legacy page/controller and base paths. Reuse routes with validated context. | GC-04 |
| `src/roles/landing.js`, `src/main.js`, `src/stores/session.js`, `src/stores/participants.js`, `src/services/heartbeat.js`, `src/services/supabase.js` | Claim/bootstrap, persisted role/team, startup/rejoin/heartbeat and auth teardown. Bind session seat and clear revoked scope. | GC-03–04,08 |
| `src/services/database.js`, `src/services/supabaseMock.js` | Claims, role normalization, team-filtered CRUD, action normalization, artifact reviews, RFIs, communications, note merges and exports. Match authoritative scope in live and mock paths. | GC-02–08,11 |
| `src/roles/facilitator.js` | Displayed Scribe: `PROPOSAL_TEAM_IDS`, Green modal validation/payload/handoff, own-team action queues, orientation gate, received proposals/notifications/RFIs. Originators and ownership require regional scope. | GC-05–07 |
| `src/roles/scribe.js` | Displayed Facilitator: team action review/finalization, deck/projection, RFIs, direct communications, negotiation thread matching and alert state. Scope by owning region and recipient. | GC-05–09 |
| `src/features/actions/strategicOrientationDetails.js`, `src/stores/gameState.js`, `src/features/gameControls/MoveControl.js`, `src/features/gameControls/PhaseControl.js`, `src/roles/whitecell.js` | Team-set completion and orientation review; five subjects for v2, four for v1; global game controls. | GC-05,08 |
| `src/features/actions/proposalDetails.js`, `src/features/actions/proposalRecipientState.js`, `src/features/actions/artifactLifecycle.js`, `src/features/actions/blueActionDetails.js`, `src/features/actions/moveResponseDetails.js` | Flat originators, parent/source team, recipient approval and thread grouping, review/revision state, Green informed/engaged targets and response references. Keep originator membership separate from target audiences. | GC-06–07 |
| `src/features/actions/ActionForm.js`, `src/features/actions/ActionList.js`, `src/features/actions/ActionCard.js`, `src/features/actions/ActionReview.js`, `src/features/actions/actionMarkRail.js`, `src/stores/actions.js` | Generic team-scoped writes/filtering, sequence/group labels and revisions; source artifact counts cannot double-count regional or forwarded copies. | GC-05–06,08 |
| `src/features/requests/RfiForm.js`, `src/features/requests/RfiList.js`, `src/features/requests/RfiResponse.js`, `src/stores/requests.js` | Team authorship/history, pending/review states and team statistics. Own-region RFI boundaries. | GC-07–08 |
| `src/features/communications/targeting.js`, `src/features/communications/SendCommunication.js`, `src/features/notifications/workflowNotifications.js`, `src/stores/communications.js` | Team/role audience fallback, sender/source metadata, durable destinations/read state and duplicate suppression. Explicit shared versus private delivery. | GC-07 |
| `src/roles/notetaker.js`, `src/features/notetaker/storage.js`, `src/features/notetaker/TeamDynamics.js`, `src/features/notetaker/AllianceTracking.js`, `src/features/notetaker/timelineDetails.js` | Team and participant JSON entries, move notes, dynamics/alliance records, inbox and seat-local persistence. Split protected storage/projection before exposing region views. | GC-02–04,07,09 |
| `src/features/capture/QuickCapture.js`, `src/features/capture/CaptureList.js`, `src/features/timeline/TimelineView.js`, `src/features/timeline/TimelineItem.js`, `src/stores/timeline.js` | Team-scoped captures, visibility fallback and team aggregation; prevent private content leaking via timeline. | GC-07–08 |
| `src/services/realtime.js`, `src/services/sync.js`, action/request/communication/participant/timeline stores | Session-only subscriptions and initialization/reconciliation caches. RLS-backed fanout and scope-aware reset/reconnect; session equality alone is insufficient. | GC-08 |
| `src/roles/whitecell.js`, `src/roles/gamemaster.js`, `src/features/participants/ParticipantList.js`, `src/components/ui/Badge.js`, `src/components/layout/Header.js`, `src/utils/formatting.js` | Green proposal queues, team labels/counts, participant removal, decks, timer and export controls. Show both regional owners without creating two game clocks. | GC-08 |
| `src/features/scribe/deckConfig.js`, `src/features/scribe/deckStorage.js`, both `decks/green/fractured-order-facilitator-deck.html` and `decks/green/fractured-order-green-facilitator-deck.html` | Team-based default, assignment recipient and browser-upload key. Region-specific assignments/state; resolve conflicting briefing roster before final copy. | GC-09 |
| `src/features/onboarding/followAlong.js`, `src/features/onboarding/platformOverview.js`, `src/features/onboarding/audioGuide.js`, `src/features/onboarding/startHereAudioManifest.js` | Team/role instructions, transcripts/audio references. Regional procedures require reviewed text and accurate media status. | GC-09 |
| `src/features/plugins/intercom.js`, `src/features/plugins/registry.js`, `src/features/plugins/sessionRecorder.js`, `data/2026-06-28_intercom_storage_bucket.sql` | Intercom enumerates legacy Scribes; session-wide plugin/audio/recording storage must not become a private-region transport. Reach both regional Scribes for explicit session announcements; preserve recording audience notices. | GC-07–09 |
| `pli/tracks/router.py`, `pli/run_pli.py`, `pli/adjudicate_router.py`, `supabase/functions/trigger-pli-adjudication/index.ts` | Green-specific routing and Blue orientation lookup; carry source identity through selection/writeback without changing PLI decisions. | GC-10 |
| `src/roles/sme.js`, `src/features/pli/DiplomacyInfoReview.js`, `src/features/pli/PliMacroReview.js`, `src/features/pli/NiEscalationReview.js`, `src/features/pli/SmeHandoffQueue.js`, `src/features/pli/SmePliPacketQueue.js`, `src/features/pli/pliNotify.js`, `src/features/pli/pliShared.js`, `src/features/pli/pliSmeEdits.js` | Green queue filters, matching-seat access, notifications and source artifact lookup. Regional provenance adds no SME powers. | GC-10 |
| `src/features/pli/PliReportPanel.js`, `src/features/pli/pliReportBuilders.js`, `src/features/pli/PliSmeEfficacyPanel.js`, `supabase/functions/pli-report-narrative/index.ts`, `src/features/plenary/plenaryData.js`, `src/features/plenary/PlenaryBoard.js`, `src/features/plenary/plenaryCharts.js` | Team grouping, report facts, finalization gates and public output; distinct-ID aggregation and approved attribution. | GC-10–11 |
| `src/features/export/researchExport.js`, `src/features/export/exportCsv.js`, `src/features/export/exportJson.js`, `src/features/export/ExportPanel.js`, `src/utils/keyGenerator.js` | Parent-team groups/role parsing, author fallback, projections, evidence keys and cross-session export. Preserve original roles, scope and captured versus reconstructed chronology. | GC-11 |
| `tests/contracts/roleCapabilityMatrix.js`, `tests/contracts/operationalFeatureManifest.js`, `tests/e2e/support/mockBackend.js`, `tests/e2e/live-demo-topology.e2e.js`, `tests/e2e/live-demo-role-matrix.e2e.js`, `tests/e2e/live-demo-playthrough.e2e.js`, `tests/e2e/live-demo-realtime.e2e.js`, `tests/e2e/live-demo-scale.e2e.js`, `tests/e2e/live-demo-operator-controls.e2e.js` | Fixed role/team/actor inventories and simulated permissions. Add v2 procedures while preserving v1; mock evidence never proves RLS. | GC-12 |
| `pli/pilot/green_actions.json`, `pli/pilot/run_green_multitrack.py`, `pli/reports/generate_green_desktop_pdf.py`, `pli/reports/green_visual_summaries.py`, `pli/archive/` | Offline/historical unified Green evidence and aggregate reports. Do not relabel, rerun or migrate history as part of this split. | Preserve |

### Database boundary inventory and replacement chain

All files below are under `data/`. The names identify repository source, not
deployment order evidence. Later implementations must re-search for replacements,
policy drops, trigger attachment and grants before editing. In particular, SQL
file timestamps alone do not prove which definitions are deployed.

| Boundary | Original and later definitions to inspect together |
| --- | --- |
| Base schemas and historical policies | `COMPLETE_SCHEMA.sql`, `updated_supabase_schema.sql`, `updated_supabase_migration.sql` contain team/role fields and broad policies. `CURRENT_BUILD_SUPABASE_PATCH.sql` is a legacy-project repair, not the authoritative migration ledger. None is the final hardening state. |
| Session lookup and claims | `2026-04-07_secure_session_join_contract.sql`; `2026-04-08_live_demo_role_seat_contract.sql`; `2026-04-08_live_demo_rls_hardening.sql`; `2026-04-08_facilitator_join_session_access_fix.sql`; `2026-04-09_global_white_cell_role_contract.sql`; `2026-04-17_seat_claim_role_input_normalization.sql`; `2026-06-18_participant_auth_identity_reconcile.sql`; `2026-06-25_industry_team_role_contract.sql`; latest claim/seat-limit definitions found in `2026-07-20_sme_handoffs.sql`. Preserve locking, identity reconciliation and stale release/heartbeat/disconnect. |
| Role/team/surface resolvers | `2026-06-25_participant_role_resolver_normalization.sql` is replaced by `2026-07-29_industry_submission_permissions.sql` (normalizer, participant role/surface/team); SME surfaces and aliases must survive the new registry. |
| Session read/write and grants | `2026-04-08_live_demo_rls_hardening.sql`, `2026-04-17_white_cell_backend_alignment.sql`, `2026-07-20_staff_access_code_only.sql`, `2026-08-12_session_archive_transition.sql`; latest `live_demo_can_read_session`/`live_demo_can_write_session` found in `2026-08-18_ssg_training_session.sql`. Preserve protected training exclusion and active-session write checks. |
| Shared game controls and plugin state | `operator_update_game_state` is replaced in `2026-06-25_timer_allocations_game_state.sql`, then `2026-06-28_white_cell_plugins_game_state.sql`. Keep the White Cell grant/session checks, timer allocations and plugin state when adding topology-aware completion. |
| Actions, ownership, orientation uniqueness | `2026-07-14_action_artifact_workflow_integrity.sql` defines artifact/team checks, source links and `idx_actions_one_orientation_per_session_team`. Submission policies also occur in `2026-06-25_scribe_action_submit_policy.sql`, `2026-07-21_scribe_proposal_submit_policy.sql`, `2026-07-29_industry_submission_permissions.sql`, and `2026-08-06_facilitator_rfi_communications.sql`. Do not omit parallel Industry policies when auditing permissive access. |
| Artifact and request workflow/review snapshots | `2026-07-29_return_action_to_blue.sql` is followed by `2026-08-05_team_neutral_artifact_review.sql`: `normalize_action_workflow_write`, `normalize_request_workflow_write`, `operator_review_artifact`, answer/return RPCs and `artifact_workflow_reviews_select`. Preserve revision locks, snapshots and immutable review history; narrow v2 reads. |
| Orientation canonicalization | `2026-08-13_strategic_orientation_team_canonicalization.sql` adds `canonicalize_strategic_orientation_artifact_type`; keep compatibility selection/forecast types separate from full envelope fields and regional ownership. |
| Proposal approvals and immutable threads | `2026-04-17_white_cell_backend_alignment.sql`, `2026-06-03_proposal_response_finalization_lock.sql`, `2026-06-25_industry_team_role_contract.sql`, `2026-07-14_action_artifact_workflow_integrity.sql`; `2026-08-06_proposal_recipient_threads.sql` replaces recipient status writes/review RPC and communication read/insert policies, adds append RPC and immutability/unique-round guards. `2026-08-15_proposal_forwarding_integrity.sql` later adds recipient payload sync, `prepare_proposal_communication`, and `operator_forward_proposal_response`. All source/recipient/parent/revision checks need scope preservation. |
| RFIs and direct communications | `2026-08-06_facilitator_rfi_communications.sql` replaces request policies and adds `guard_facilitator_request_write`; its communication policies are subsequently replaced by the thread migration above. Operator communication/answer paths also originate in the April hardening/alignment and June Industry migrations. Preserve `2026-08-11_requests_responded_by_schema_repair.sql` and the later `update_request_response_time` trigger replacement in `2026-08-13_rfi_answer_completion_trigger.sql`. |
| Action notifications and timeline copies | `2026-08-13_action_notification_delivery.sql`, `2026-08-13_action_notification_type_contract.sql`, latest completion RPC in `2026-08-14_action_notification_title_snapshot.sql`. Green/Industry recipients and title snapshots require explicit regional/shared audience. |
| Notes, links and generic evidence reads | `2026-04-08_live_demo_rls_hardening.sql` policies for `notetaker_data`, `timeline`, `action_logs`, `reports`, `move_completions`, `participant_activity`, `data_completeness_checks`, `action_relationships`, `rfi_action_links`, `game_state_transitions`; `2026-06-04_research_export_capture.sql` research/proposal projections. Audit linked rows and session-wide SELECT policies, not just primary action writes. |
| SME and PLI evidence | `2026-07-17_pli_adjudications.sql`, `2026-07-20_operator_grants_sme_surface.sql`, `2026-07-20_sme_handoffs.sql`, `2026-07-20_sme_pli_write_hardening.sql`, `2026-07-29_sme_handoffs_backfill.sql`, `2026-08-25_sme_pli_packets.sql`: preserve grant/seat/finalization boundaries, White Cell read-only PLI and existing Game Master break-glass access; carry delegation from source action, never SME-supplied ownership. |
| Removal/archive/history | `2026-04-16_game_master_remove_session_participant.sql`, `2026-08-12_session_archive_transition.sql`, `2026-08-17_game_master_session_retirement.sql`, `2026-08-26_session_role_name_snapshots.sql`: deletion tombstones, display-name snapshots, active participant projections and revoked-seat behavior must preserve regional attribution. |
| Retired training history | `2026-08-18_ssg_training_session.sql` and `2026-08-18_training_mastery_progress.sql` are followed by `2026-08-26_decommission_ssg_training.sql`. The latter removes training RPC access, installs non-live session guards and preserves a protected archive. Do not restore training or convert its historical attempts into live seats. |

## Verification and remaining dependencies

No tests, npm commands, migrations, load harnesses or deployments were run for
GC-01. Source inspection is the only current evidence. The prompt status table is
left for the human to update; this document does not mark a gate passed.

From the repository root, the human can run:

```powershell
npm test -- tests/unit/green-regional-contract.test.js src/core/teamContext.test.js src/features/actions/strategicOrientationDetails.test.js src/features/actions/proposalDetails.test.js
git diff --check
```

Expected pass: the new contract tests reconcile all seats/routes/profile rows,
retain legacy role inversion, cap Notetakers at two, distinguish the two roster
candidates as historical evidence, pin the approved roster without runtime activation,
pin regional submission/SME boundaries and four/five
orientation subjects, and verify the book link and source paths. Existing focused
tests remain green. `git diff --check` reports no whitespace errors. These checks
verify a specification and legacy contracts, **not implemented regional RLS**.

Unresolved dependencies/evidence:

1. D-02 roster choice is now recorded. Actual database registration, frozen session
   binding, GC-06 membership validation and GC-09 final materials remain required;
   the recorded decision is not evidence that those operations have occurred.
2. Human review of this contract and fresh focused-test output from this revision.
3. GC-02–03 additive storage/RPC/RLS implementation, migration evidence and real
   Supabase tests using separate identities: same-seat contention, cross-region
   direct reads/writes, source/thread spoofing, note JSON disclosure, stale/revoked
   seat recovery, archive/non-live closure and v1 compatibility. No such evidence
   exists in this change.
4. GC-04–11 implementation and GC-12 fresh regional workflow/recovery/export
   evidence, including distinct-ID reconciliation and independent PLI regression.
   The existing 18/23-actor gates cannot establish the future 20/25-actor topology.

No additional scope expansion is necessary for GC-01. Restoring the retired
training product, producing new audio or changing the represented roster require
their own explicit scope; preserving the archive does not authorize those changes.
