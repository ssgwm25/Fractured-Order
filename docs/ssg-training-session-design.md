# TRAINING2026 Learning Contract

**Status:** Authoritative design and curriculum contract  
**Contract version:** 2.0  
**Frozen:** 2026-08-18

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
| 4. Profile-aware walkthrough | 8–14 minutes | Open the selected real role surface with the training persistence adapter and complete six role-specific native actions against deterministic fixtures. |
| 5. Mastery checks | Integrated with walkthrough | Advance only when the active attempt observes the current step's declared native success event. Failed validation, cancellation, visibility, focus, and unrelated clicks never create mastery. |
| 6. Completion | Under 60 seconds | Show the anonymous practice summary, remaining limitations, reset/replay, and role-switch controls. |

### Refresh, reset, replay, and switching

- A refresh uses the current tab's namespaced `sessionStorage` attempt ID only
  as a resume hint, then revalidates ownership and protected-template metadata
  through the training bootstrap RPC. It must not create a new live participant
  or artifact.
- **Reset** compare-and-swaps the exact learner-owned attempt, retires it as
  reset, creates a pristine same-profile attempt, reloads immutable fixtures,
  and leaves every unrelated team/role attempt untouched.
- **Replay intro** reopens the instructional media without changing mastery.
  Reset is the explicit way to start that semantic profile again; prior
  in-memory fixture mutations cannot enter its replacement attempt.
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
4. read move, phase, and timer from the platform header while keeping the
   Scribe-to-Facilitator handoff boundary in the role introduction; and
5. recover from refresh, reset the attempt, replay the path, or switch profiles
   without affecting another learner.

### Scribe objective and evidence contract

The four Scribe paths share the same ownership rules but use the selected
team's orientation and move-artifact branch.

| Measurable objective | Required completion evidence |
| --- | --- |
| Complete every required field in the selected team's ordered Strategic Orientation workflow. | `scribe.orientation.forwarded` is emitted only after native validation and the isolated handoff succeed. |
| Open the deterministic worked Blue Action, Red Action, Green Proposal, or Industry Proposal. | `scribe.artifact.example_opened` is emitted from the native Action details control. |
| Create the team-correct artifact and save one valid draft. | `scribe.artifact.draft_saved` is emitted only after the native form validates and the training adapter saves the draft. |
| Hand the saved artifact to the Facilitator without claiming final submission authority. | `scribe.artifact.forwarded` is emitted after the native handoff succeeds. |
| Correct the returned artifact without changing its identity. | `scribe.artifact.revision_forwarded` is emitted after the same record is revised and forwarded again. |
| Verify the handoff independently from the control that initiated it. | `scribe.handoff.verified` requires the forwarded lifecycle state and its matching timeline receipt. |

### Facilitator objective and evidence contract

| Measurable objective | Required completion evidence |
| --- | --- |
| Review the forwarded team artifact and its Scribe handoff state. | `facilitator.artifact.reviewed` is emitted from Team Action Review after the correct record is opened. |
| Project the reviewed artifact and restore focus after presentation. | `facilitator.artifact.projected` is emitted after Present is entered and exited successfully. |
| Create, correct, and resubmit one Request for Information revision chain. | `facilitator.rfi.resubmitted` retains one stable fixture RFI ID. |
| Read the RFI answer and send one isolated direct communication. | `facilitator.communication.sent` is emitted only after the answer is opened and the native communication succeeds. |
| Submit the artifact after its native prerequisites pass. | `facilitator.artifact.submitted` records delivery to the simulated White Cell fixture. |
| Verify final delivery independently from the submit control. | `facilitator.receipt.verified` requires the submitted lifecycle state and matching receipt or timeline entry. |

#### Superseded Facilitator implementation boundary

The four Facilitator profiles mount `FacilitatorTrainingCoach` inside the real
`src/roles/scribe.js` support-deck workspace after protected training
activation succeeds. The controller hydrates the selected team's forwarded
Strategic Orientation and move artifact, direct communication, informational
team-action notification, deck assignment, RFI template, durable alert, and
timeline from immutable fixtures. It does not start live stores,
subscriptions, RFI history fetches, or database-backed write handlers.

The Prompt 08 coach-owned forms, workspace visit counter, classification task,
and proxy controls are legacy implementation only. They are not current
curriculum evidence and must be removed by the role-controller migration.
Proposal recipient isolation, stable revision identity, Present focus return,
and the no-live-write boundary remain mandatory while the six declared native
events replace those proxy requirements.

### Notetaker objective and evidence contract

| Measurable objective | Required completion evidence |
| --- | --- |
| Record the team decision and its reasoning through native Quick Capture. | `notetaker.observation.saved` confirms one validated append. |
| Preserve a key moment and quote as distinct capture types. | `notetaker.capture.pair_saved` requires one successful append of each type. |
| Save move-scoped dynamics and alliance notes for the current seat. | `notetaker.seat_notes.saved` requires both native saves and proves the comparison seat is unchanged. |
| Read the White Cell inbox update and record its effect on team reasoning. | `notetaker.inbox.followup_saved` keeps inbox history and appends the follow-up observation. |
| Review the official action and chronological timeline without editing either. | `notetaker.readonly.reviewed` requires both native read-only surfaces and no exposed edit control. |
| Verify the explanatory record without turning it into an official action. | `notetaker.record.verified` locates the saved seat note and any shared timeline snapshot. |

#### Superseded Notetaker implementation boundary

All four Notetaker profiles mount `NotetakerTrainingCoach` inside the real
`src/roles/notetaker.js` workspace only after protected activation returns the
same semantic role and team as the route. Training initialization renders the
current team artifact, supply-disruption inbox item, captures, and chronological
timeline through the existing Notetaker renderers. It does not bind the live
forms, start sync, subscribe to stores, or call a live Notetaker mutation.

The Prompt 09 coach-owned observation, capture, notes, inbox, and retrieval
forms are legacy implementation only. They are not current curriculum evidence
and must be replaced with the native Notetaker forms. Move, phase, and timer
remain visible in the platform header; the walkthrough does not reproduce them
inside a context panel.

Dynamics and alliance inputs retain the live two-second autosave rhythm. The
training boundary applies the current participant-scoped ledger merge helper to
the learner's cloned move record. Autosave updates only that record; manual save
also creates separate structured dynamics and alliance snapshot entries using
the production timeline-detail contract. Offline and failed autosaves retain
the unsaved form text, expose a retry control, and do not partially commit the
attempt. A deterministic second-seat fixture has its own record ID and
participant key and is never used as the learner's mutable record.

The simulated inbox clears only its unread marker after opening; its immutable
history remains. Team Action and Official Timeline stay read-only, and the
saved explanatory record remains distinct from both. Native validation,
offline recovery, seat isolation, and deterministic comparison-seat checks
remain mandatory during the controller migration.

### Mastery and completion rule

Curriculum version `2.0` is incompatible with version `1.0`. Each profile has
six ordered native actions. A step becomes mastered only when the active
attempt observes that step's exact `expectedTrainingEvent` after native
validation and isolated persistence succeed. Visibility, focus, arbitrary
clicks, coach controls, cancellations, failed writes, workspace visits, and
knowledge questions cannot create mastery.

Completion requires all six step IDs to have a `mastery_passed` event. It is
summarized in plain language without a numeric/formal score, rank, competitive
comparison, certification claim, or live-session evidence claim. The summary
names practiced capabilities, the Scribe–Facilitator handoff, the role's first
live-session action, and how to reopen training. It contains no access code,
participant credential, live artifact ID, adjudication claim, learner answer,
narration text, transcript, or dummy artifact body.

Progress bootstrap data is a bounded list of completed/mastered step IDs plus
an attempt revision. Idempotent event keys suppress duplicate writes, and every
mutation compares the caller's expected revision under the owner-row lock. A
stale client refetches and preserves the newer server revision; it never
overwrites it. Reset atomically retires only the selected caller-owned attempt
and creates a pristine same-profile attempt while retaining bounded history.
An in-progress version `1.0` attempt reaches the existing explicit
`TRAINING_CURRICULUM_RESTART_REQUIRED` path and must be restarted as a pristine
version `2.0` attempt. Version `1.0` step IDs and mastery events are retained as
historical attempt evidence and are never relabeled, copied, or counted toward
version `2.0` completion.

### Native walkthrough presentation contract

The mounted role coach is a compact in-context dock, not a page section. It is
fixed outside document flow so activating training never pushes the real role
workspace downward or changes the Facilitator workspace from its production
layout. The dock defaults to the side opposite the current target and can be
minimized to one `Show guide` control while the learner works directly in the
platform. At mobile widths it becomes a bottom dock capped at half the viewport
height so the targeted interface remains visible above it.

The expanded dock shows only the role title, `Step n of 6`, one imperative
`actionTitle`, at most one supporting `instruction`, an optional closed
`recoveryHint`, concise feedback, Play/Pause, Mute, and `Hide guide`. Narration
may add one short rationale for the same target and action; it may not introduce
another task. The guide contains no working form, proxy action, quiz, repeated
header or handoff panel, workspace tour, persistent Next control, or generic
stage label.

Every step declares one `targetSelector`, one `expectedTrainingEvent`, and one
`successMessage`. The selector must resolve to the native control the learner
uses. A broad container is allowed only for read-only receipt verification when
no stable, more precise element exists. `main`, `body`, selector lists, and
accessible fallbacks are not valid action targets. An optional bounded
`openAction` may reveal the declared target but never creates mastery.

The guide advances exactly once after the matching event, announces the success
message, and presents the next target. A missing target produces `Target
unavailable` with Retry and cannot mark mastery. A completed step remains
reviewable through quiet history without exposing a mastery bypass.
`prefers-reduced-motion: reduce` removes dock and target animation and uses
immediate scrolling while preserving focus and text-backed state.

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
- [ ] Minimizing the guide leaves an equivalent labelled `Show guide` control;
  no instruction, pathway, or role tool becomes unreachable.
- [ ] The guide never covers the required control. It uses the opposite desktop
  side or scrolls the mobile target above the bottom dock, and minimizing it
  never loses the current step.
- [ ] On-screen keyboards do not hide focused inputs, errors, or Next/Submit
  controls.

### Reduced motion

- [ ] `prefers-reduced-motion: reduce` removes spotlight pulsing, animated
  scrolling, parallax/grid drift, sweeps, and nonessential transitions.
- [ ] Progress and completion remain understandable through text and state, not
  animation.
- [ ] No flashing content exceeds accessibility thresholds.

### Video, captions, audio, and degraded media

- [ ] Video starts from its Play control. Narration begins from the explicit
  role-confirmation click and continues automatically between steps unless
  muted; training never requires sound.
- [ ] The welcome video has synchronized captions plus a complete adjacent
  transcript. The compact coach's visible instruction remains the
  authoritative text equivalent for narration.
- [ ] Welcome-media controls and the compact coach's Play/Pause and Mute
  controls are keyboard and screen-reader operable.
- [ ] Narration preferences persist per browser; step changes, modal close,
  training exit, page hide, and document-hidden transitions stop speech.
- [ ] Only the current and next approved clips are loaded. A missing approved
  file visibly labels Web Speech as a degraded system-voice fallback before it
  speaks; a voice change is never silent.
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
definitions, per-attempt in-memory fixture state, a revalidated `sessionStorage`
activation hint, and learner-owned bounded progress rows. The adapter may call
only the owner-scoped training bootstrap/progress/reset RPCs. Calling a live
database method, realtime, action, RFI, communication, participant, or plugin
adapter from the training runtime is a release blocker.
Training must not import or mount the White Cell plugin registry.

| Threat | Failure to prevent | Required control and acceptance evidence |
| --- | --- | --- |
| Shared access code | Treating knowledge of `TRAINING2026` as authentication or attaching completion to a named person. | State “code-restricted, not identity-verified” at entry and completion; collect no identity; never exchange the code for a live grant. |
| Simultaneous learners | Two learners overwrite, read, or complete one another's fixtures. | The server creates high-entropy owner/profile attempt IDs. Row-level ownership prevents cross-learner reads, while compare-and-swap revisions reconcile tabs belonging to the same learner without overwriting newer progress. |
| Refresh | Refresh creates a second attempt, loses required state unpredictably, or hydrates from live data. | Treat the current namespaced `sessionStorage` attempt ID as a hint; revalidate it against `auth.uid()` and protected server metadata before rendering; verify no live mutation or identifier appears. |
| Reset or replay | Broad storage deletion removes another attempt, or stale fixture mutations carry forward. | Confirm reset, compare-and-swap the selected owner attempt, retain it as reset, create a new attempt ID, and rebuild from immutable fixtures. Never use `localStorage.clear()`, wildcard deletion, or a bulk attempt update. |
| Attempted URL manipulation | Query/path values expose Game Master, White Cell, SME, Observer, or another live route. | Allowlist the 12 semantic profiles after parsing; reject operator/SME/compatibility values; return to the training picker without rendering or importing a live controller. |
| Accidental live persistence | Learner-entered practice content or a completion summary reaches a live table, Realtime, a live store, or export evidence. | The training adapter exposes only bounded attempt-progress RPCs; tests reject live write methods and keep training attempts outside live evidence and exports. Content Security Policy/network instrumentation may add defense in depth. |
| Plugin crossover | Intercom or Session Recorder mounts, requests microphone permission, or records a learner. | Do not import or mount the White Cell plugin registry. Training narration/media is a separate local instructional capability and never records. |
| Fixture misrepresentation | A learner mistakes canned White Cell text or a completion state for a live/deterministic result. | Prefix fixture messages and reviews with `TRAINING FIXTURE`; use outcome-free completion language; repeat the non-adjudication boundary in mastery feedback and the completion summary. |
| Shared-device residue | A later learner sees the prior learner's profile or completion. | Persist no learner answer bodies, provide an exact owner/profile reset, avoid names and credentials, and clear the activation hint when the tab/session is intentionally ended. |

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
| The interactive prototype completes after navigating gated steps. | It has no independent mastery decision or evidence boundary. | Completion requires all six declared native success events; navigation and coach controls never create mastery. |
| The interactive prototype keeps state only in a page object; current follow-along stores guide state in legacy-keyed `localStorage`. | Neither provides isolated attempt, refresh, reset, replay, or anonymous completion semantics. | Persist mastery in the learner-owned backend attempt; keep only its revalidated activation hint in `sessionStorage`, and never reuse live follow-along storage keys. |
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

Curriculum version `2.0` is declared in
`src/features/training/content/curriculum.js`. It is keyed first by semantic
role and then by team; compatibility controller names never appear in progress
or curriculum IDs. Import-time validation rejects a missing profile, missing or
reordered action, missing event, duplicated heading or event, generic label,
excessive visible copy, unsupported role or team, duplicate ID, unbounded
selector, selector list, broad interactive target, or missing fixture.
A protected bootstrap whose curriculum version does not match the bundled
catalog reaches the explicit restart path before a role walkthrough mounts.

Every profile contains six ordered native actions. Stable module IDs use
`training.v2.<semantic-role>.<team>` and step IDs add the action ID. Each step
contains one exact target selector, one imperative action title, one supporting
instruction, one expected training event, and one success message, with only a
bounded recovery hint and programmatic open action optional. The following
matrix is the complete version `2.0` catalog:

| Profile | Built role surface | Strategic Orientation emphasis | Practice artifact or record | Deterministic response fixtures |
| --- | --- | --- | --- | --- |
| `blue.scribe` | `teams/blue/facilitator.html` | Blue choice, Red forecast, expected Red action | Structured Blue Action through the shared action workflow | Facilitator handoff and simulated White Cell return |
| `red.scribe` | `teams/red/facilitator.html` | Red rationale plus Blue and two Green forecasts | Red Action through the current shared action workflow | Facilitator handoff and simulated White Cell return |
| `green.scribe` | `teams/green/facilitator.html` | Blue forecast, Green choice, strategy narrative | Green multi-partner proposal with sector and supply-chain conditions | Facilitator handoff, proposal approval/thread, and simulated return |
| `industry.scribe` | `teams/industry/facilitator.html` | Blue forecast, Industry choice, strategy narrative | Industry proposal with industry, country, and proposed-activity fields | Facilitator handoff, proposal approval/thread, and simulated return |
| `blue.facilitator` | `teams/blue/scribe.html` | Review the forwarded Blue orientation | Action review, deck state, RFI, communication, projection, and final-submission boundary | Returned RFI, answer, direct message, and durable alert |
| `red.facilitator` | `teams/red/scribe.html` | Review the forwarded Red orientation | Red Action review, deck state, RFI, communication, projection, and final-submission boundary | Returned RFI, answer, direct message, and durable alert |
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

Each target is checked against the corresponding built HTML surface and its
native controller-rendered controls. Missing targets fail visibly and remain
incomplete. Broad containers are reserved for read-only receipt verification;
the contract provides no `main` or `body` fallback that could hide a broken
selector.

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

The persistent sandbox banner measures its rendered height and publishes that
value to the shared role-shell offset. Standard content, fixed sidebars, the
Facilitator deck shell, mobile drawers, presentation panels, and alert panels
therefore begin below both the application header and the banner. A resize
observer updates the reservation when controls or text wrap, so browser zoom,
text enlargement, and narrow viewports do not leave interface elements hidden
under the fixed banner. If observation is unavailable, the tokenized desktop
and mobile minimum heights remain as the layout fallback.

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

## Guided narration asset boundary (Prompt 06)

`TrainingAudioController.js` owns narration state, lazy loading, persistent
mute/volume/rate preferences, synchronized caption text, teardown, and the
explicitly labelled Web Speech fallback. The controller never makes a network
TTS call. Confirming a role enables playback for the current clip and automatic
playback for later steps; dismissing the introduction or muting narration does
not start sound. Curriculum step changes replace the current clip and
invalidate older play promises so rapid navigation cannot restart stale speech.
The compact coach exposes only Play/Pause and Mute while keeping its visible
instruction authoritative. The coach added
in Prompts 07–09 must mount the controller's accessible controls and call its
stop/destroy boundary when its modal or surface closes.

The approved narration manifest remains explicitly bound to retired curriculum
version `1.0`; its 84 step clips are historical assets and are not relabeled as
version `2.0`. The native curriculum contains 72 steps. Until the action-aligned
scripts and assets are regenerated under their own version `2.0` provenance,
step narration fails closed to visible instruction rather than playing a
mismatched clip. An entry is playable as an authored file only when its
owner-approved provenance record
contains its exact transcript, duration, byte size, script SHA-256, output
SHA-256, captions, cue timings, and shared provenance ID. Pending, missing, or
partially generated metadata fails closed to the labelled fallback; it is never
treated as approved audio.

The reproducible workflow and approval checklist live under
`scripts/training-audio/`. It pins the Apache-2.0 `kokoro==0.9.4` engine and
Apache-2.0 Kokoro-82M v1.0 model revision
`8542409da2986c0ab5d41b3cf0411f7a58caab38`, uses the candidate `af_heart`
voice, keeps weights and raw/review output outside version control, and masters
final delivery at mono 48 kHz, -18 LUFS, -2 dBTP, LRA 7, and 64 kbps MP3.

Release is currently blocked at the required human voice gate. The owner must
review the intro plus representative Scribe, Facilitator, and Notetaker samples
for voice fit, pronunciation, pacing, clipping, pauses, prosody, transcript
identity, caption sync, and measured media budgets before bulk generation.
Until that approval and generation occur,
`public/training/audio/provenance.json` remains `pending-owner-review`, contains
no fabricated generation date or output checksums, and no generated narration
binary is a release artifact.

## Superseded role-controller implementation

The Prompt 07 Scribe coach still mounts inside the existing `.page-container` only after
`initializeRolePage` has revalidated the protected attempt and returned the
same semantic Scribe/team context as the route. A cached flag, query parameter,
live session, rejected activation, or mismatched team does not mount the coach.
Controller teardown destroys both the coach and its narration controller.

All four paths use the real Strategic Orientation renderer and team profile.
Blue then uses the current structured action wizard; Red uses the structured
Move Response renderer, validator, and serializer; Green and Industry use the
current proposal renderer with distinct conditional branches. Green retains
Originator and Objective, while Industry instead requires Industry of Focus,
Country of Focus, and Proposed Activity. Both proposal paths retain intended
partner, sector, supply-chain, timing, and outcome validation. The coach never
offers RFI creation, direct communication, projection, or final submission.

The legacy practice mutations call a closed training command registry. The registry
accepts only the current attempt's exact `scribe.<team>` orientation, draft,
Facilitator-handoff, and returned-revision commands. It records only bounded
step/result metadata, keeps dummy artifact bodies in memory, requires Draft
before Forward, and requires the returned state before revision. Unknown,
cross-team, direct-to-White-Cell, oversized, and out-of-order commands fail
before progress or local practice state changes. The deterministic Facilitator
receipt and White Cell/Facilitator return are fixture data; neither creates an
`artifact_workflow_reviews` row or any live action, request, communication, or
timeline record.

Those coach-owned forms, proxy buttons, retrieval question, duplicate
completion action, and repeated header or handoff panel are superseded and are
not version `2.0` curriculum evidence. The platform header is the sole
walkthrough source for move, phase, and timer. The role introduction is the
sole walkthrough source for the handoff boundary.

Prompt 13 changes only the design and curriculum contract. The existing role
controllers are intentionally not treated as compliant implementations yet.
Their migration must enable the declared native controls through the isolated
training adapter and emit the exact version `2.0` events only after native
validation succeeds. No legacy coach control, broad section highlight, quiz,
or direct-to-White-Cell Scribe path may be used as substitute evidence.

## Documentation gate

Repository documentation tests must fail if this contract loses:

- the exact 12 semantic profiles and four-team scope;
- the Scribe/Facilitator compatibility-route inversion;
- Red's current shared action workflow;
- the `TRAINING2026` access wording;
- training-only storage and no-live-persistence boundary;
- the instructional-fixture/non-adjudication statement; or
- the explicit exclusion of all operator, SME, and compatibility routes;
- the version `2.0` six-action native walkthrough contract;
- one exact target and one observable success event per step; or
- the explicit restart requirement for incompatible older attempts.

The runtime spine, protected attempt lifecycle, accessible introduction,
revision-safe progress, explicit restart path, and version `2.0` native
curriculum contract are implemented. The role-controller migration and
version `2.0` narration regeneration remain follow-on work; the superseded
coach-owned walkthrough is not release evidence. Completion remains anonymous
isolated practice and never enters live evidence or research exports. This
document does not claim that any learner has completed the curriculum.
