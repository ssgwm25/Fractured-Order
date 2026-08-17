# TRAINING2026 Learning Contract

**Status:** Authoritative design and curriculum contract  
**Contract version:** 1.0  
**Frozen:** 2026-08-17

`TRAINING2026` is the self-guided Fractured Order learner experience for the
four team branches and three public participant roles. This document is the
source of truth for its scope, curriculum, completion rules, accessibility
acceptance, and isolation boundary. The briefing prototypes are design inputs,
not executable specifications.

## Non-negotiable boundary

- `TRAINING2026` is **code-restricted, not identity-verified**. A shared code
  limits casual discovery; it does not authenticate an SSG member, prove who
  completed a path, or authorize access to a live exercise.
- The supported scope is exactly **12 learner profiles**: four teams multiplied
  by the semantic Scribe, Facilitator, and Notetaker roles.
- Operator and SME routes are explicitly excluded from `TRAINING2026`. Game
  Master, White Cell Lead, all five SME consoles, White Cell Support, and
  Observer are not selectable, routable, or implied training profiles.
- Training is a sealed instructional simulation. It has **no live persistence**,
  creates no live session rows, sends no live communications, and mounts no
  White Cell plugin.
- **Simulated White Cell responses are instructional fixtures and never
  deterministic adjudication records.** They must be visibly labelled as
  training fixtures and may explain or demonstrate a workflow only.
- Training completion is anonymous practice evidence. It is not proof of
  identity, attendance, authorization, certification, or live-game activity.

## Locked learner scope: all 12 profiles

These semantic profile IDs are the only supported training profiles:

| Team | Scribe | Facilitator | Notetaker |
| --- | --- | --- | --- |
| Blue | `blue.scribe` | `blue.facilitator` | `blue.notetaker` |
| Red | `red.scribe` | `red.facilitator` | `red.notetaker` |
| Green | `green.scribe` | `green.facilitator` | `green.notetaker` |
| Industry | `industry.scribe` | `industry.facilitator` | `industry.notetaker` |

The following shipped profiles and compatibility states are explicitly outside
the training scope: `operator.game_master`, `operator.white_cell_lead`,
`sme.econ`, `sme.ni_escalation`, `sme.diplomacy_information`, `sme.tsj`,
`sme.verba`, `whitecell_support`, and `viewer`. Direct URL or query-string
attempts to select any of them must fail closed to the training profile picker;
they must never fall through to the corresponding live route.

## Semantic role and compatibility-route mapping

Learner-facing labels always use semantic role names. Existing route, storage,
and controller identifiers remain inverted for compatibility and must not leak
into curriculum copy.

| Learner-facing role | Current internal surface | Current route | Controller | Curriculum ownership |
| --- | --- | --- | --- | --- |
| Scribe | `ROLE_SURFACES.FACILITATOR`; persisted suffix `*_facilitator` | `teams/<team>/facilitator.html` | `src/roles/facilitator.js` | Orientation and team artifact authoring; handoff; read-only shared surfaces; quick capture |
| Facilitator | `ROLE_SURFACES.SCRIBE`; persisted suffix `*_scribe` | `teams/<team>/scribe.html` | `src/roles/scribe.js` | Four workspaces; projection; final submission; RFIs; direct communications; proposal threads; alerts |
| Notetaker | `ROLE_SURFACES.NOTETAKER`; persisted suffix `*_notetaker` | `teams/<team>/notetaker.html` | `src/roles/notetaker.js` | Seat-scoped notes; shared captures; dynamics and alliances; inbox; read-only review |

Training profile IDs use the semantic role (`blue.scribe`, not
`blue.facilitator`) even when a compatibility route uses the opposite filename.
Training state keys must also use semantic profile IDs and must not reuse the
live follow-along keys such as `followalong:facilitator:<team>`.

## Four team branches and current artifact taxonomy

Every path begins with one versioned Strategic Orientation artifact. The
Scribe authors and forwards it; the Facilitator reviews, projects, and submits
it to the simulated White Cell fixture. Catalogue selections and required
narratives are distinct inputs and are never inferred from one another.

| Team branch | Ordered Strategic Orientation workflow | Current move artifact |
| --- | --- | --- |
| Blue | Choose Blue's orientation; forecast Red's orientation; describe what Red is expected to do. | **Action.** Action title, objective, one or more Instruments of Power, sectors, supply-chain decision and conditional action angles/areas, implementation, focus countries, expected outcomes, and optional team-notification routing with its required note. |
| Red | Choose Red's orientation; explain it; forecast Blue, Green (Asian Pacific), and Green (Europe). | **Action using the current shared action workflow.** Action title, six-month objective, one or more DIME Instruments of Power, supply-chain focus, sectors, focus countries, expected outcomes, and applicable notification metadata. The Red path has no current implementation, legislative-route, or date-of-effect control. |
| Green | Forecast Blue's orientation; choose Green's orientation; describe Green's strategy given that forecast. | **Proposal.** Proposal Title, at least one Originator, Objective, Intended Partners, Focus Sectors, a Yes/No supply-chain-focus decision with conditional Supply Chain Area, Timing & Conditions, and Expected Outcome(s) & Duration Assessment. |
| Industry | Forecast Blue's orientation; choose Industry's orientation; describe Industry's strategy given that forecast. | **Proposal.** Proposal Title, Industry of Focus, Country of Focus, and Proposed Activity in place of Green's Originator and Objective fields, plus the shared Intended Partners, Focus Sectors, supply-chain decision/conditional area, Timing & Conditions, and Expected Outcome(s) & Duration Assessment. |

The current Red authoring taxonomy is an **Action**, not a new Move Response.
Legacy Move Response envelopes and renderers may remain readable as historical
compatibility behavior, but `TRAINING2026` must not offer them as an authoring
choice or count them toward mastery.

The locked primary taxonomy is therefore: Blue or Red action, Green proposal,
and Industry proposal.

The common authoring lifecycle taught by the training is:

1. Scribe creates or edits a draft.
2. Scribe forwards the complete draft to the Facilitator.
3. Facilitator reviews and may edit or project it.
4. Facilitator submits it to the simulated White Cell fixture.
5. The fixture returns it with instructional notes or marks the exercise item
   complete without assigning a deterministic outcome.
6. A returned item retains its identity and revision history through correction
   and resubmission.

For proposals, the curriculum also shows separate Blue and Red recipient
approval states and one recipient-isolated, append-only negotiation thread.
One recipient's messages, decisions, and thread identifier must never appear in
the other recipient's fixture.

## Learner journey

Each role path targets **15–25 minutes**, including the mastery check. Individual
instruction or practice steps should generally remain **below 90 seconds**.
Longer forms must be split into meaningful pages with progress and resumable
state rather than presented as one oversized step.

| Stage | Target | Contract |
| --- | --- | --- |
| 1. Code entry | 30–60 seconds | Enter `TRAINING2026`; explain that the shared code restricts entry but does not verify identity. Invalid input produces an inline, announced error and retains focus. |
| 2. Welcome video | 2:28 source duration | User-initiated, skippable overview of Fractured Order, Plenum, the participant and control-cell roles, session phases, and the structured exercise record. Full-source playback is the product-owner decision. Synchronized open captions are burned into the video; a separate WebVTT track and complete adjacent transcript provide accessible text alternatives. |
| 3. Profile selection | 30–60 seconds | Choose one of four teams and one of three semantic roles. Only the 12 locked profiles can continue. |
| 4. Profile-aware walkthrough | 8–14 minutes | Open a training-only facsimile of the selected surface, demonstrate the live tracker, and complete the role-specific tasks below with team-specific fixtures. |
| 5. Mastery check | 3–5 minutes | Complete five questions or decisions, including the two critical boundary items. Incorrect answers receive corrective feedback and can be retried. |
| 6. Completion | Under 60 seconds | Show the anonymous completion receipt, remaining limitations, replay, and role-switch controls. |

### Refresh, reset, replay, and switching

- A refresh uses the current tab's namespaced `sessionStorage` attempt ID only
  as a resume hint, then revalidates ownership and protected-template metadata
  through the training bootstrap RPC. It must not create a new live participant
  or artifact.
- **Reset** clears only the exact current attempt namespace, reloads pristine
  fixtures, returns to that profile's first instructional step, and leaves
  unrelated tabs and attempts untouched.
- **Replay** starts a new attempt for the same semantic profile. Prior fixture
  mutations cannot enter the replay.
- **Try another role** returns to the 12-profile picker and creates a new attempt
  after selection. Progress and mastery never carry across roles or teams.
- A completed receipt may be displayed or downloaded by the learner, but it is
  not uploaded and cannot be represented as identity-verified evidence.

## Measurable objectives and completion evidence

### Objectives common to every profile

By completion, the learner can:

1. identify their semantic team and role without relying on legacy route names;
2. distinguish training fixtures from live session records;
3. identify the Scribe → Facilitator → White Cell ownership boundary;
4. locate the move/phase/timer context and explain that White Cell controls it
   during a live exercise; and
5. recover from refresh, reset the attempt, replay the path, or switch profiles
   without affecting another learner.

### Scribe objective and evidence contract

The four Scribe paths share the same ownership rules but use the selected
team's orientation and move-artifact branch.

| Measurable objective | Required completion evidence |
| --- | --- |
| Complete every required field in the selected team's ordered Strategic Orientation workflow. | `scribe.orientation.validated` followed by `scribe.orientation.forwarded`; the fixture summary contains every required catalogue selection and narrative. |
| Create the correct current artifact: Blue Action, Red Action, Green Proposal, or Industry Proposal. | `scribe.artifact.validated` records the profile's expected taxonomy and all required-field checks as passed. |
| Hand the artifact to the Facilitator without claiming direct White Cell submission. | `scribe.artifact.forwarded`; the next-owner value is the semantic Facilitator. |
| Use Quick Capture and distinguish it from formal artifact authoring. | `scribe.capture.appended`; the capture is appended without replacing another fixture entry. |
| Locate read-only RFI history, White Cell updates, timeline, journal, and received information surfaces. | `scribe.readonly_surfaces.reviewed`; no create-RFI or direct-communication write is attributed to the Scribe. |

### Facilitator objective and evidence contract

| Measurable objective | Required completion evidence |
| --- | --- |
| Switch among Team Action Review, Deck, RFIs, and Communications and return to the last viewed record or slide. | `facilitator.workspaces.restored` after all four workspaces have been visited and one prior view restored. |
| Review and project a forwarded orientation or artifact, then perform the final handoff. | `facilitator.artifact.projected` and `facilitator.artifact.submitted_to_fixture`; the artifact remains the Scribe's revision and the destination is the simulated White Cell fixture. |
| Create an RFI, respond to a fixture return, resubmit the same RFI revision chain, and locate its answer history. | `facilitator.rfi.lifecycle_completed` with one stable fixture RFI ID and ordered revisions. |
| Send and review an isolated direct communication with White Cell. | `facilitator.communication.fixture_sent`; no live communication store is called. |
| Make a proposal-recipient decision and append one negotiation round without overwriting round zero. | `facilitator.proposal_thread.appended` with the selected recipient and isolated fixture thread ID. |
| Open a durable activity notice, move focus to its destination, and dismiss it separately from unread state. | `facilitator.alert.destination_opened` and `facilitator.alert.dismissed`. |

### Notetaker objective and evidence contract

| Measurable objective | Required completion evidence |
| --- | --- |
| Record move-scoped team dynamics and alliance notes for the current seat. | `notetaker.seat_notes.saved`; a second fixture seat remains unchanged. |
| Append an observation, moment, or quote through Quick Capture. | `notetaker.capture.appended`; the shared fixture list gains a new entry rather than replacing an existing one. |
| Read a White Cell inbox item and distinguish unread state from deletion. | `notetaker.inbox.opened`; history remains present after the unread marker clears. |
| Review a complete action and the chronological session timeline without editing either. | `notetaker.readonly_review.completed`; no artifact mutation control is exposed. |
| Explain the difference between seat-scoped notes and shared captures. | Critical mastery item `notetaker.storage_scope` is correct. |

### Mastery and completion rule

The mastery check contains five items tailored to the selected profile. A pass
requires at least **4 of 5 correct** and both critical items correct:

1. the role-ownership/handoff question for the selected semantic role; and
2. the training-boundary question stating that simulated White Cell output is
   a fixture, not a deterministic adjudication record or live result.

Notetaker additionally treats `notetaker.storage_scope` as critical; an
incorrect answer must be corrected before completion. Learners may retry
incorrect items after feedback. Merely viewing every walkthrough step does not
complete a path.

An anonymous completion receipt contains only:

- contract ID and version;
- random training attempt ID;
- semantic profile ID, team, and role;
- required step and task result IDs;
- mastery score and critical-item pass flags;
- elapsed seconds and completion timestamp;
- `identity_verified: false`;
- `live_persisted: false`; and
- storage scope (`sessionStorage` or an explicit user download).

The receipt must not contain the entered access code, a live session ID,
participant credentials, live artifact IDs, or a claim about adjudication.

## Acceptance checklist

### Accessibility and keyboard

- [ ] One descriptive page title, one visible `h1`, logical heading levels,
  landmarks, and a working skip link are present in every stage.
- [ ] All actions use native buttons, links, inputs, radios, checkboxes, and
  selects where those semantics apply; instructions never depend on color,
  position, hover, sound, or motion alone.
- [ ] The complete journey is operable with keyboard only. Tab order follows
  visual order; radio groups and tabs use expected arrow-key behavior; no
  keyboard shortcut fires while the learner is typing in a field.
- [ ] Visible focus is never obscured by the coach, spotlight, sticky header, or
  mobile navigation.
- [ ] Dialogs trap focus, provide an accessible name, close with Escape when
  safe, and restore focus to the invoking control.
- [ ] Validation errors are linked to their fields, summarized, announced once,
  and do not erase entered work.
- [ ] Step changes, completion, fixture returns, and degraded-media states are
  announced without repeatedly reading unchanged content.
- [ ] The experience remains usable at 200% browser zoom and with text spacing
  overrides; content is not clipped or hidden behind overlays.

### Mobile

- [ ] At 320px and 390px portrait widths, there is no page-level horizontal
  scrolling, primary controls remain reachable, and controls meet a minimum
  44-by-44 CSS-pixel touch target where space permits.
- [ ] Hiding the desktop rail provides an equivalent labelled mobile navigation
  control; no panel becomes unreachable.
- [ ] The coach never covers the required control. It docks below or above the
  target and can be collapsed without losing the current step.
- [ ] On-screen keyboards do not hide focused inputs, errors, or Next/Submit
  controls.

### Reduced motion

- [ ] `prefers-reduced-motion: reduce` removes spotlight pulsing, animated
  scrolling, parallax/grid drift, sweeps, and nonessential transitions.
- [ ] Progress and completion remain understandable through text and state, not
  animation.
- [ ] No flashing content exceeds accessibility thresholds.

### Video, captions, audio, and degraded media

- [ ] Video and narration start only after user action; training never requires
  sound.
- [ ] The welcome video has synchronized captions plus a complete adjacent
  transcript. Narrated coach text is also available as persistent text.
- [ ] Play/pause, replay, mute, volume, captions, transcript, and skip controls
  are keyboard and screen-reader operable.
- [ ] Captions identify meaningful non-speech audio and do not obscure controls.
- [ ] If video, recorded audio, browser speech synthesis, or media metadata
  fails or times out, a visible degraded-media state provides transcript-first
  instruction, Retry, and Continue without blocking the path.
- [ ] Media failure never changes mastery scoring or calls a live service.

### General state acceptance

- [ ] Every asynchronous or fixture-backed panel has explicit loading, empty,
  error, retry, and degraded states.
- [ ] Training mode remains visibly labelled throughout the walkthrough,
  completion screen, downloads, fixture communications, and fixture reviews.
- [ ] Replay and role switching are reachable at completion and do not require
  reloading or editing the URL.

## Data-isolation threat model

The implementation must use a training-only adapter backed by immutable fixture
definitions plus per-attempt in-memory/`sessionStorage` state. The adapter may
call only the owner-scoped training bootstrap/progress RPCs. Calling a live
database method, realtime, action, RFI, communication, participant, or plugin
adapter from the training runtime is a release blocker.
Training must not import or mount the White Cell plugin registry.

| Threat | Failure to prevent | Required control and acceptance evidence |
| --- | --- | --- |
| Shared access code | Treating knowledge of `TRAINING2026` as authentication or attaching completion to a named person. | State “code-restricted, not identity-verified” at entry and completion; collect no identity; never exchange the code for a live grant. |
| Simultaneous learners | Two learners overwrite, read, or complete one another's fixtures. | Generate a high-entropy attempt ID in each tab; namespace every mutable value by attempt and semantic profile; prove two concurrent attempts diverge without shared mutation. |
| Refresh | Refresh creates a second attempt, loses required state unpredictably, or hydrates from live data. | Treat the current namespaced `sessionStorage` attempt ID as a hint; revalidate it against `auth.uid()` and protected server metadata before rendering; verify no live mutation or identifier appears. |
| Reset or replay | Broad storage deletion removes another attempt, or stale fixture mutations carry forward. | Delete only the exact attempt namespace; rebuild from immutable fixtures; assign replay a new attempt ID. Never use `localStorage.clear()` or wildcard deletion. |
| Attempted URL manipulation | Query/path values expose Game Master, White Cell, SME, Observer, or another live route. | Allowlist the 12 semantic profiles after parsing; reject operator/SME/compatibility values; return to the training picker without rendering or importing a live controller. |
| Accidental live persistence | A practice action, RFI, communication, note, or completion receipt reaches Supabase, Realtime, a live store, an RPC, or export evidence. | Training adapter exposes no live write method; tests fail on `fetch`, Supabase/RPC, database, realtime, or live-store calls; Content Security Policy/network instrumentation may add defense in depth. |
| Plugin crossover | Intercom or Session Recorder mounts, requests microphone permission, or records a learner. | Do not import or mount the White Cell plugin registry. Training narration/media is a separate local instructional capability and never records. |
| Fixture misrepresentation | A learner mistakes canned White Cell text or a completion state for a live/deterministic result. | Prefix fixture messages and reviews with `TRAINING FIXTURE`; use outcome-free completion language; repeat the non-adjudication boundary in the mastery check and receipt. |
| Shared-device residue | A later learner sees the prior learner's profile, answers, or completion. | Keep mutable attempts in `sessionStorage`, provide a precise reset, avoid names and credentials, and clear the current attempt when the tab/session is intentionally ended. |

## Material mismatch register

The dispositions below reconcile both briefing prototypes and the current
onboarding copy with the executable role behavior. No prototype behavior is
adopted merely because it exists in a prototype.

| Source mismatch | Material difference | Frozen disposition |
| --- | --- | --- |
| `SSG_Training_Plan.html` separates `tutorial2026` from lowercase `training2026`; `fractured-order-training.html` hardcodes `tutorial2026`. | Neither prototype presents the required authoritative access statement. | The training code label is `TRAINING2026`; it is code-restricted, not identity-verified. No second learner code is in scope. |
| The interactive prototype plays the welcome modal before code entry. | Required journey begins at code entry. | Code entry → video → profile selection → walkthrough → mastery → completion. |
| The plan describes four one-hour facilitated sessions; the interactive prototype promises “the next few minutes.” | Neither duration matches an independent role path. | Each role path targets 15–25 minutes; individual steps generally stay below 90 seconds. |
| The plan includes White Cell/Game Master operations and PLI adjudication; the interactive picker exposes only team learners. | The shipped executable matrix contains operator and SME profiles, but this curriculum is for learners. | Exactly 12 public learner profiles; all operator, SME, Observer, and White Cell Support routes are excluded. |
| Both prototypes use semantic role labels without acknowledging compatibility identifiers. | Current filenames/controllers invert Scribe and Facilitator. | Learners see semantic labels; the route/controller inversion is documented and contained at the adapter boundary. |
| The plan makes Blue and Industry orientations selection-only and Red/Green largely forecast-only; the interactive prototype gives similarly simplified one-field variants. | Current version 2 orientations require the ordered team-specific catalogue and narrative fields. | Teach every field in the four workflows in this contract; never infer a narrative from a selection. |
| The plan calls Red's artifact an Action, while the interactive prototype and stale executable capability called it a Move Response. | The current visible Red create flow uses the shared multi-page action wizard and E2E rehearses Red actions. | Red authors an Action through the current shared action workflow. Legacy Move Response records are compatibility-only. |
| Prototype actions/proposals are single text areas or abbreviated fields. | Current Blue/Red action and Green/Industry proposal forms have distinct required field groups and conditional validation. | Use the current taxonomy and required-field groups in this contract; samples may prefill but may not bypass validation. |
| The interactive Scribe path creates RFIs and sends communications. | Current Scribe capability is read-only RFI/update/timeline/journal plus quick capture; the Facilitator owns RFI and direct White Cell communication writes. | Remove Scribe write controls; teach RFI and direct communication lifecycle only in Facilitator paths. |
| The plan calls Notetaker a global dashboard and says it can view all submitted/accepted moves. | Current Notetaker is team- and seat-scoped for notes, with shared appended captures plus inbox and read-only action/timeline review. | Teach seat isolation, shared append semantics, and team-scoped review; never promise global access. |
| The interactive Facilitator path covers only deck, one submit, communications, and timeline. | Current Facilitator has four restorable workspaces, RFI revision lifecycle, proposal threads, durable alerts, projection, and finalization. | All current Facilitator capability groups receive practice and measurable evidence. |
| Prototype White Cell messages immediately acknowledge, accept, return, or “rule” on learner input. | Such canned text is not a live or deterministic decision. | Every response is a labelled instructional fixture; current completion is outcome-free. |
| The interactive prototype completes after navigating gated steps. | It has no independent mastery decision or evidence boundary. | Completion requires task evidence, 4/5 mastery, and all critical items. |
| The interactive prototype keeps state only in a page object; current follow-along stores guide state in legacy-keyed `localStorage`. | Neither provides isolated attempt, refresh, reset, replay, or anonymous completion semantics. | Use semantic-profile, attempt-scoped `sessionStorage`; never reuse live follow-along storage keys. |
| The current Scribe onboarding copy in `src/roles/facilitator.js` says the Scribe can ask White Cell and contains Red/proposal wording that can imply direct White Cell submission. | Executable capability ownership makes Scribe RFI history read-only and requires Facilitator final submission. | Training copy follows the executable ownership boundary; the existing onboarding copy is documented drift, not curriculum authority. |
| The current Notetaker onboarding highlights capture, dynamics, and inbox but omits its full read-only action/timeline review capability. | A learner could complete the tour without seeing the complete role boundary. | Training includes action and timeline review evidence. |
| The interactive mobile CSS hides the navigation rail without an equivalent replacement. | Role panels become unreachable on narrow screens. | Mobile navigation equivalence is a blocking acceptance item. |
| The prototype has partial focus, captions, speech synthesis, and reduced-motion handling, but no complete dialog trap, guaranteed transcript, or degraded-media contract. | Media or assistive-technology failure can block or confuse completion. | Apply the full acceptance checklist above; text-first instruction remains authoritative. |
| `src/features/plugins/registry.js` contains operator-only Intercom and Session Recorder plugins. | Importing them would risk live communication, recording, or permission crossover. | Training never imports or mounts either plugin; instructional playback is separate and non-recording. |

## Implemented runtime spine (Prompt 03)

The initial runtime uses a distinct session-experience plugin registry. The
locked `ssg-training` plugin is not stored in `game_state.plugin_state` and is
not visible to White Cell controls. Code recognition selects the training RPC
before bootstrap; after that call, no code comparison can activate training.
Activation requires all three server-returned facts:

- `session_classification = training_template`;
- `is_protected = true`; and
- `experience_plugin_id = ssg-training`.

The returned attempt ID, curriculum version, semantic role, team, and
`trainingMode: true` form the only bounded training context in `sessionStore`.
On a multi-page navigation or refresh, the stored context is untrusted until
`get_training_attempt_bootstrap(attempt_id)` confirms both `auth.uid()`
ownership and the same protected metadata. Query parameters, URL paths, a
standalone `training_mode` flag, and browser storage cannot activate training.

Routing resolves semantic roles through the documented compatibility inversion:
semantic Scribe uses the `facilitator.html` surface, semantic Facilitator uses
`scribe.html`, and Notetaker uses `notetaker.html`. The selected context must
match both the semantic controller and the page's team. Operator, SME,
Observer, White Cell, and mismatched team/role URLs clear the training hint and
return to code entry without initializing the requested live controller.

While a training hint exists, the database service permits only start/resume,
owner revalidation, and bounded progress RPCs. Every other database method
throws the visible safe-recovery message before Supabase is called. Sync,
Realtime store hydration, game-state creation/subscription, heartbeat, seat
claim, participant disconnect, and Session Recorder notices are independently
guarded and remain inactive.

The Prompt 03 vertical slice hydrates one immutable Blue Scribe Action fixture
in memory and renders it inside the real Blue Scribe compatibility page. The
persistent `Training sandbox` banner labels the context and provides native
Exit training and reserved disabled Reset buttons. It uses shared design
tokens, remains stacked on narrow screens, exposes text in addition to color,
and adds no motion. Reset behavior and broader curriculum interaction remain
reserved for Prompt 10.

## Versioned curriculum and fixture catalog (Prompt 04)

Curriculum version `1.0` is declared in
`src/features/training/content/curriculum.js`. It is keyed first by semantic
role and then by team; compatibility controller names never appear in progress
or curriculum IDs. Import-time validation rejects a missing profile, reordered
or incomplete stage sequence, missing narration/mastery/selector metadata,
unsupported role or team, duplicate ID, missing fixture reference, or selector
without an accessible fallback. A protected bootstrap whose curriculum version
does not match the bundled catalog fails closed before a role path is mounted.

Every profile contains the ordered stages **Orient, Show, Guide, Practice,
Respond, Retrieve, and Reflect**. Stable module IDs use
`training.v1.<semantic-role>.<team>` and step IDs add the lowercase stage. The
following matrix is the complete version `1.0` catalog:

| Profile | Built role surface | Strategic Orientation emphasis | Practice artifact or record | Deterministic response fixtures |
| --- | --- | --- | --- | --- |
| `blue.scribe` | `teams/blue/facilitator.html` | Blue choice, Red forecast, expected Red action | Structured Blue Action through the shared action workflow | Facilitator handoff and simulated White Cell return |
| `red.scribe` | `teams/red/facilitator.html` | Red rationale plus Blue and two Green forecasts | Move Response with strategy, actions, pressure points, channel, and effect | Facilitator handoff and simulated White Cell return |
| `green.scribe` | `teams/green/facilitator.html` | Blue forecast, Green choice, strategy narrative | Green multi-partner proposal with sector and supply-chain conditions | Facilitator handoff, proposal approval/thread, and simulated return |
| `industry.scribe` | `teams/industry/facilitator.html` | Blue forecast, Industry choice, strategy narrative | Industry proposal with industry, country, and proposed-activity fields | Facilitator handoff, proposal approval/thread, and simulated return |
| `blue.facilitator` | `teams/blue/scribe.html` | Review the forwarded Blue orientation | Action review, deck state, RFI, communication, projection, and final-submission boundary | Returned RFI, answer, direct message, and durable alert |
| `red.facilitator` | `teams/red/scribe.html` | Review the forwarded Red orientation | Move Response review, deck state, RFI, communication, projection, and final-submission boundary | Returned RFI, answer, direct message, and durable alert |
| `green.facilitator` | `teams/green/scribe.html` | Review the forwarded Green orientation | Proposal review, deck state, RFI, communication, projection, and final-submission boundary | RFI answer, proposal thread, direct message, and durable alert |
| `industry.facilitator` | `teams/industry/scribe.html` | Review the forwarded Industry orientation | Proposal review, deck state, RFI, communication, projection, and final-submission boundary | RFI answer, proposal thread, direct message, and durable alert |
| `blue.notetaker` | `teams/blue/notetaker.html` | Read Blue context without editing it | Seat-scoped observations, dynamics, alliances, action review, and timeline | Simulated inbox guidance and supply-disruption inject |
| `red.notetaker` | `teams/red/notetaker.html` | Read Red context without editing it | Seat-scoped observations, dynamics, alliances, action review, and timeline | Simulated inbox guidance and supply-disruption inject |
| `green.notetaker` | `teams/green/notetaker.html` | Read Green context without editing it | Seat-scoped observations, dynamics, alliances, action review, and timeline | Simulated inbox guidance and supply-disruption inject |
| `industry.notetaker` | `teams/industry/notetaker.html` | Read Industry context without editing it | Seat-scoped observations, dynamics, alliances, action review, and timeline | Simulated inbox guidance and supply-disruption inject |

The immutable fixture catalog is built by
`src/features/training/content/fixtures.js` through the current Strategic
Orientation, Blue Action, Move Response, proposal, recipient-thread,
communication-targeting, durable-notification, deck, and seat-scoped Notetaker
helpers. It contains bounded collections for orientations, four team artifacts,
Facilitator handoffs, simulated White Cell returns/answers/approvals,
communications, injects, notifications, isolated proposal rounds, deck state,
timeline entries, and Notetaker records. All synthetic identifiers begin with
`training-fixture:` and visible artifact labels begin with `TRAINING FIXTURE`.
Timestamps are fixed; the catalog contains no random source, current-time call,
network request, or AI generation. Red's Move Response has no invented handoff
field: the catalog uses its current serializer and represents instructional
handoff separately through existing workflow state and a counterpart fixture.

Each target is checked against all four corresponding built HTML surfaces.
Every step also declares `main` as an accessible fallback target, so missing or
temporarily hidden detail content cannot make instruction unreachable.

## Video-first onboarding (Prompt 05)

After the protected attempt is revalidated on its exact role surface, the
runtime opens `TrainingIntroModal.js`. The dialog uses the shared modal and
button system, traps focus through the shared modal boundary, makes background
siblings inert, restores focus when dismissed, and pauses media on close,
page-hide, or hidden-document navigation. It is deliberately closable: Escape,
the close control, or skipping playback continues without making media a
training gate.

The first stage presents the complete local 2:28 `<video>` with native playback
controls, a poster, one default English WebVTT caption track, explicit Play with
sound, Replay, transcript, Retry, and Continue controls. No audible playback
starts without a learner gesture. Playback is not clipped or stopped before the
source ends, and Replay and Continue remain available throughout. Loading
timeout, missing source, decode failure, offline, and captions-unavailable
conditions each show plain-language text. Every degraded state retains the text
transcript, Retry where useful, and an enabled Continue action; it never changes
mastery or calls a live service.

Continue advances within the dialog to a text profile confirmation that names
the semantic team and role. `Change team or role` clears only the current
training context and returns to the landing flow. `Start guided walkthrough`
stores the marker in `sessionStorage` under the exact attempt ID and curriculum
version, then emits `training:intro-complete` as the handoff boundary for the
profile coach introduced by Prompts 07–09. A persistent `Replay intro` training
coach control remains on the sandbox banner even after the first-run marker is
stored.

Media provenance and the delivery checklist live under
`public/training/intro/`. Playback uses only repository-local assets and creates
no tracker, credential, recorder, live participant, or remote-player request.
The product owner selected full playback of the existing 2:28 source, overriding
the earlier 45–60 second target, and confirmed that synchronized open captions
are burned into the video image. The complete visible transcript and independent
WebVTT track are sourced from
`Plenum Briefing/Plenum_Platform_Explainer_Video_Script.md`. That source assigns
narration and scene timings from 0:00 through 1:28; the rendered media continues
to 2:28 without additional scripted narration. Burned-in captions do not replace
the WebVTT track for assistive technology. A media owner must recheck the WebVTT
cues against the approved audio within 0.5 seconds whenever the script or video
changes. Failed caption delivery is not a reason to block a learner at runtime.

## Documentation gate

Repository documentation tests must fail if this contract loses:

- the exact 12 semantic profiles and four-team scope;
- the Scribe/Facilitator compatibility-route inversion;
- Red's current shared action workflow;
- the `TRAINING2026` access wording;
- training-only storage and no-live-persistence boundary;
- the instructional-fixture/non-adjudication statement; or
- the explicit exclusion of all operator, SME, and compatibility routes.

The runtime spine, Blue Scribe smoke slice, version `1.0` declarative
curriculum/fixture catalog, and accessible video-first introduction are
implemented. Media timing approval, interactive walkthrough mounting, mastery
persistence, completion, attempt replay, profile switching after completion,
and reset behavior remain deferred. This document does not claim that any
learner has completed the curriculum.
