# Live Demo Runbook

Use this runbook before a J7/JFSC or professional military education demonstration. The goal is a stable, serious exercise platform that preserves decision evidence for after-action review.

## Pre-Demo Checks

1. Confirm the latest GitHub Pages deploy succeeded.
2. Confirm hosted source is built output, not raw source.
3. Before deploying the matching frontend, apply and verify the database/RLS migrations in a dedicated rehearsal project. Confirm Supabase anonymous auth, RPCs, RLS checks, and the `intercom-announcements` Storage bucket pass. Follow the exact dated ledger in `docs/supabase-setup.md`, including `data/2026-07-29_industry_submission_permissions.sql` and `data/2026-08-06_proposal_recipient_threads.sql`, through `data/2026-08-17_game_master_session_retirement.sql`; do not omit the proposal repair or the final Game Master session-retirement migration.
4. Confirm the 23-actor role matrix can join and reload: Blue, Red, Green, and Industry Scribes, Facilitators, and both Notetaker seats; White Cell Lead; Game Master; and the Econ, NI/Escalation, Diplomacy & Information, TSJ, and Verba AI SME consoles. White Cell Support and Observer are not landing-page entries in the shipped workflow and are not counted as user-enterable role procedures.
5. Confirm production source maps are not published by default.

Commands:

```powershell
npm test -- --run
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="<anon-key>"; $env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"; npm run build
npm run test:e2e:smoke
npm run test:e2e:live-demo
npm run test:roles
npm run test:operational
```

Pass: unit tests, production build, smoke, the 23-actor role-entry matrix,
the eighteen-actor professional playthrough, focused Realtime recovery gate,
and live-demo role tests complete without failures. The auditable role/capability
contract is documented in `docs/role-capability-test-matrix.md`. The focused
playthrough command and hosted real-backend procedure are documented in
`docs/playthrough-automation.md`.
The complete non-PLI shipped-feature gate, its evidence manifest, and its explicit
PLI exclusions are documented in `docs/operational-rehearsal.md`.
The latest local pass (2026-08-13) covered 74 focused files / 659 tests and five
browser components / 6 tests / 49 actors / 8 sessions, with zero skips, retries,
unexpected browser errors, or gate violations. This is not hosted Supabase/RLS evidence.
The smoke test completes the Blue and Green single-target orientation handoffs
and the Red and Industry multi-target forecast handoffs before exercising the
normal Scribe-to-Facilitator-to-White Cell action lifecycle.

Note: the local E2E static server serves built files even when the build uses
`VITE_PUBLIC_BASE_PATH="/Fractured-Order/"`, so these checks can run in the
same shell after the hosted-source build command.

## Hosted Source Check

```powershell
Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Pass:

- contains `/Fractured-Order/assets/*.js`
- does not contain `./src/main.js`
- does not contain `./src/roles/landing.js`

## Session Setup

1. Open the landing page.
2. Expand Operator Access.
3. Authorize as Game Master.
4. Create an active session with a short uppercase join code.
5. Join once as a participant and confirm the loading screen identifies the resolved session by name before entering the role surface.
6. Keep the Game Master console open for participant monitoring and export.
7. In the Game Master participant roster, select at least two seats, remove them in one confirmation, and confirm each successful removal disappears immediately without a page refresh.
8. If Intercom or Session Recorder is enabled for the selected session, confirm the Game Master plugin mount shows the matching operator controls.

Recommended rehearsal session name:

```text
Fractured Order J7/JFSC Rehearsal
```

## Role Matrix

For each team:

- one Scribe
- one Facilitator
- up to two Notetakers

Operator seats:

- one White Cell Lead
- one Game Master

The retired White Cell Support role may remain on historical records, but it is not claimable from the landing page.

## Core Flow Checks

Scribe:

- before Move 1, complete the exact Strategic Orientation matrix: Blue chooses Blue, forecasts Red, and describes expected Red actions; Red chooses and explains Red, then forecasts Blue, Green (Asian Pacific), and Green (Europe); Green forecasts Blue, chooses Green, and describes its strategy given that forecast; Industry forecasts Blue, chooses Industry, and describes its strategy given that forecast; all four artifacts go to the Facilitator first
- if a Green or Red forecast insert returns a 403 on `actions` or the browser warns that `game_state` is missing, apply `data/2026-06-25_participant_role_resolver_normalization.sql`; if any team's Strategic Orientation create or edit receives `actions_artifact_team_check`, apply `data/2026-08-13_strategic_orientation_team_canonicalization.sql` and deploy the matching frontend—the trigger maps Blue to `strategic_orientation_selection` and Red, Green, and Industry to `strategic_orientation_forecast` before the existing constraint runs; do not drop or broaden the constraint; if an Industry seat receives an RLS error for an orientation, proposal, RFI, forwarded submission, recipient approval, or proposal-thread message, apply the migrations through `data/2026-08-15_proposal_forwarding_integrity.sql`; if an RFI insert returns `record "new" has no field "responded_by"`, apply the August 11 repair without removing the request guard; if White Cell answering a resubmitted RFI reports that it was already completed, apply the RFI answer trigger repair and confirm the answer plus its linked history record commit atomically; pass condition is that same-team Scribe drafts and same-team Facilitator submissions succeed, independently approved recipients receive only their own append-only threads, requested action recipients receive only their own approved action detail, cross-team writes and participant adjudication still fail, and the live tracker loads from the backend
- if accepting an action with requested Green/Industry recipients reports that `operator_complete_action_with_notifications` is missing, apply `data/2026-08-13_action_notification_delivery.sql`; if it reports `communications_type_check`, apply `data/2026-08-13_action_notification_type_contract.sql`, verify the constraint includes `ACTION_NOTIFICATION`, and then retry; do not bypass the atomic path by completing the action first and sending manual messages afterward
- confirm every team button reads `Strategic Orientation` and becomes unavailable after that team records its one pre-Move-1 artifact
- for each modal, confirm sections appear in the matrix order, each catalogue choice has its own fieldset and arrow-key radio group, confirmation stays disabled until all catalogue choices are made, whitespace-only narratives fail with field errors and an accessible error summary, and Cancel/Escape returns focus to the trigger
- return each team artifact once; confirm every own orientation, target forecast, rationale, expected-action description, and strategy description reopens unchanged, and correcting one field does not erase the others
- confirm the header live tracker reads Strategic Orientation / Pre-Move 1 until all required orientation artifacts reach White Cell, then returns to Move 1 / Internal Deliberation
- create a draft action/proposal/response
- in the Blue Team Action modal, confirm the wizard has three pages and page 3 contains Implementation, Focus Countries, and Expected Outcomes in that order; confirm Instrument of Power appears in a full-width section directly below Action Title, is a checkbox group offering `Economic`, `Diplomacy`, `Information`, `Military`, and `Other`, supports multiple selections, and preserves them on save/edit; choosing `Other` must reveal a required free-text input and persist the typed value on save/edit, confirm the modal no longer renders levers or Date of Effect fields while previously recorded dates remain preserved for historical review, confirm choosing sector `Other` reveals its required free-text input directly under Sectors and that it reappears after deselecting and reselecting `Other`; on page 2, confirm the user must answer Yes or No to `Does this action have a supply chain focus?`, that No keeps the dependent controls hidden, and that Yes reveals checkbox groups for Action Angle (`Build resilience for Blue`, `Disrupt Red`) and Supply Chain Area (`Extraction`, `Refinement`, `Distribution`, `Advanced Manufacturing`), with at least one choice required in each group; confirm Focus Countries includes `U.S` and `Other` with a required free-text input that also reappears after deselecting and reselecting `Other`; on page 3, select Green, Industry, and then both under `Teams to inform`, confirm each selection requires a clarifying note and survives save/edit, and confirm this notification metadata remains separate from the Facilitator's Coordinated and Informed/Engaged fields
- in the Red Team Action modal, confirm the Objective hint reads `What you intend this action to achieve in 6 months.`, confirm Instrument of Power is a checkbox group offering `Economic`, `Diplomacy`, `Information`, `Military`, and `Other` and preserves multiple selections on save/edit, confirm the modal does not render Implementation, Legislative Route, or Date of Effect controls, confirm Focus Countries includes `U.S`, `PRC`, and `Other` with the required free-text input for `Other`, confirm Green/Industry notification selections require a clarifying note and survive save/edit, and confirm the rest of the shared action flow still forwards through the Facilitator
- current Green new-entry form fields: confirm the Green proposal form requires Proposal Title, at least one Originator, Objective, Intended Partners, Focus Sectors, a Yes/No supply-chain-focus decision, Timing & Conditions, and Expected Outcome(s) & Duration Assessment; select Blue and Red independently under Intended Partners, select multiple Focus Sectors independently, choose No and confirm Supply Chain Area stays hidden, then choose Yes and confirm Supply Chain Area appears and requires at least one selection; choose sector `Other`, enter a custom value, save/edit, and confirm the value returns
- current Industry new-entry form fields: confirm the separate US Industry proposal form requires Proposal Title, Industry of Focus, Country of Focus, and Proposed Activity instead of the Green Originator and Objective controls; confirm it also requires the shared Intended Partners, Focus Sectors, Yes/No supply-chain-focus decision, conditional Supply Chain Area, Timing & Conditions, and Expected Outcome(s) & Duration Assessment fields; confirm neither new-entry form renders Proposal Category, Delivery, Action Angle, or an Industry Instrument of Power control
- create one dual-recipient proposal and confirm the stored proposal card, Facilitator presentation, White Cell review card, JSON/CSV research rows, HTML report, and LaTeX report retain both intended recipients, all focus sectors, the supply-chain decision and conditional areas, the distinct Green or Industry fields, and revision metadata; after a White Cell return, confirm the edit form identifies the same proposal ID and current revision, displays reviewer notes and revision history, and resubmits as the next revision
- historical export/parser compatibility only: load a historical proposal containing `Category`, `Delivery`, `Recipient Team`, and `Focus Sector`; confirm it still parses and exports without becoming a new-entry requirement, and that rendered/exported legacy values use `Category (historical)` and `Delivery (historical)` labels
- forward completed Strategic Orientation artifacts and actions to the Facilitator; Red now provides actions through the same team action flow as Blue; for Green and Industry proposals, confirm the originating Scribe creates and forwards the draft, then the actual Facilitator submits it to White Cell through the legacy `*_scribe` seat
- review RFI history across category tabs; confirm there is no Scribe-side New RFI control
- confirm White Cell responses are separated by category tabs and forwarded proposals appear
- in the Scribe strategic actions section, confirm each action card is collapsed by default to `Action details`, the action title, and `Objective:` only, and that the full action card expands only after it is clicked
- confirm timeline and quick capture render

White Cell:

- confirm every submission card carries a visible source-team badge, including Strategic Orientation artifacts in the mixed-team queue and Green or Industry proposals; Blue, Red, Green, and Industry badges must use their distinct restrained team tint while retaining the full team name, with no team-colored card border or shadow
- confirm the Move Control sequence shows Strategic Orientation before Move 1, marks it active while the gate is incomplete, and marks it complete when Move 1 becomes active
- confirm Move 1 phase/move advance controls remain blocked until one submitted Strategic Orientation artifact from each of Blue, Green, Red, and Industry reaches White Cell
- confirm the Strategic Orientation queue, returned history, and review dialog show own orientation, every forecast, Red's rationale, Green/Industry strategy, and Blue's expected Red actions without duplication; new records use `Orientation & Forecast`, while version 1 records retain `Selection` or `Forecast`
- set Time Allocations for Strategic Orientation, Move 1, Move 2, and Move 3; confirm reset uses the active state mark allocation
- open Simulation Settings -> Plugins, enable and disable Intercom and Session Recorder, refresh the White Cell page, and confirm the saved enabled/disabled state persists
- with Intercom enabled, record a short announcement from White Cell or the selected-session Game Master console, preview it, send it to Scribes, then discard/reset the local clip
- with Session Recorder enabled, start, pause, resume, and stop a short recording; confirm the local preview/download appears and the participant notice reads `Session recording active` while audio is being captured
- after stopping a Session Recorder capture, export the research archive and confirm `session_recording_artifacts.csv`, `session_recording_artifacts.json`, and the report Session Recordings section reference the downloaded file
- start/pause/reset the Strategic Orientation timer as lead while the pre-Move-1 gate is still incomplete
- advance/regress phase and move after the Strategic Orientation gate clears
- confirm advancing or regressing moves pauses the timer and loads the target move allocation
- review submitted Strategic Orientation artifacts from the Strategic Orientation queue, then Blue actions, proposals, and Red actions from their role-specific queues; confirm action review is titled `Review Action`, action and Strategic Orientation reviews have only `Accept as Complete` and `Send Back for Improvement` decisions with no outcome selector, return notes are required while acceptance notes are optional, and the action review cards show every recorded field including instruments of power, action angles, supply-chain areas, and Red levers; for a Blue action with Green or Industry selected under `Teams to inform`, confirm the persisted `artifact_payload.action` snapshot contains matching `notificationTeams` and `notificationNote` values, both the queue card and `Review Action` modal contain a dedicated `Team notification request` section, and the modal shows a preselected, keyboard-operable approval checkbox for each requested team; accept with both selected and confirm Green and Industry each receive one `ACTION_NOTIFICATION` containing the action and Blue's note, no other team can read either communication, and the completed White Cell card reports `Sent to Green Team, Industry Team`; deselect one requested team in a separate rehearsal and confirm it receives nothing while completion still succeeds; at a short viewport and 200% browser zoom, confirm the Review Action body scrolls while the complete footer, including Cancel, remains visible and keyboard reachable
- request changes on a Green or Industry proposal with reviewer notes; confirm the proposal leaves the pending queue, returns to the submitting team as an editable draft under the same proposal ID with its revision incremented, and appears in `Returned / Revision History` with the returned snapshot and notes
- submit one proposal addressed to both Blue and Red; confirm White Cell shows a separate approval control and lifecycle for each recipient, approve Blue only, and verify Blue receives one round-zero thread while Red remains `Pending approval` with no communication; then approve Red and confirm its thread ID differs from Blue's and neither thread contains the other recipient's messages
- send one Blue action, one Red action, and one Strategic Orientation artifact back for improvement; confirm each submitting team receives its own returned artifact and notes, the White Cell loader, error, success, and timeline language names the submitting team, and no generic control claims a Red or Strategic Orientation return is going to Blue
- open `Returned / Revision History` after the returned artifacts leave their pending queues, then resubmit or complete at least one of them; confirm every return remains visible with the submitting team, returned revision number, return notes, reviewer, timestamp, and the full artifact fields from that returned revision
- reopen the returned proposal from the submitting team, confirm reviewer notes and prior return events are visible in the edit modal, edit it, and resubmit it from the Facilitator presentation; pass condition is that the same proposal ID is resubmitted with the next revision rather than a new unrelated proposal row
- accept an action and a Strategic Orientation artifact as complete with no notes; confirm each moves to `Completed`, `outcome` remains null, and neither the card nor timeline assigns `SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`, or `BACKFIRE`; open the same revision in two White Cell sessions and confirm the second review is rejected as stale after the first review commits
- answer a submitted or resubmitted RFI and confirm it leaves the pending queue, appears as completed history for the requesting team, and creates one response timeline event; with a second White Cell browser holding the same stale pending card, attempt another response and confirm the interface refreshes the queue with an `already completed` warning instead of offering to overwrite the immutable answer
- send direct communications and section updates
- review participant roster filters; select multiple seats, remove them in one confirmation, and confirm each successful removal disappears immediately without a page refresh
- verify facilitator deck assignment status

Facilitator:

- confirm the assigned or default deck remains available in the main viewer and Previous/Next navigation works; the workspace switch exposes `Team Action Review`, `Deck`, `RFIs`, and `Communications` as keyboard-operable tabs, scopes the sidebar to the selected workspace, and restores the last record or support slide viewed in each workspace; incoming communications and RFI lifecycle updates refresh alerts, counts, and history without stealing focus or changing workspaces, while an update received in its already-active workspace may advance the corresponding message or RFI
- on the actual Blue Facilitator surface at `teams/blue/scribe.html`, open `Team Action Review`; also inspect every `teams/*/facilitator.html` Actions section and the White Cell Blue action queue; confirm the horizontal, non-wrapping mark rail exposes Strategic Orientation, Move 1, Move 2, and Move 3, gives every mark a visible count and explicit zero-state, shows the active mark newest-first, supports Left/Right/Home/End tab navigation with focus following selection, and confines narrow-screen horizontal scrolling to the rail rather than the page
- confirm the Proposals section remains visible immediately below Actions, including its zero-state before a proposal arrives; forward proposals from different source teams, open each proposal from the sidebar, and confirm the full proposal can be projected
- for every received proposal, confirm the first-round options are `Accept`, `Not Interested`, and `Negotiate`; Accept and Not Interested require confirmation and Negotiate requires terms; confirm the submission waits in White Cell's proposal queue, opens in the response-specific `Review Proposal Response` modal, and names the proposing team as the forward destination; after White Cell forwards it, confirm the response is appended as round 1 without changing round 0, the proposing Facilitator can answer it as round 2 through the same White Cell gate, later replies remain ordered by round, and either participant can explicitly close the thread without removing prior messages; confirm every committed row shows its thread ID linkage, recipient, round, parent, source proposal/revision, sender team/role, timestamp, message type, and White Cell review request ID in stored metadata
- keep a Blue and a Red thread open from the same proposal in separate sessions; confirm neither team can read or append to the other recipient's thread, a participant joined to another simulation session cannot read or append either thread, and White Cell receives exactly one durable notification for every newly committed round (including a round recovered by Realtime reconciliation) while startup history and duplicate delivery do not notify again; each notice must name the source, proposal thread, and required action, remain until its Dismiss button is activated, and open/focus the matching proposal record from its destination button
- in the Green and Industry Proposals sections, confirm each proposal card is explicitly labelled `PROPOSAL` and preserves the current shared details: Intended Partners, Proposed Recipient Approvals, Focus Sectors, Supply Chain Decision, conditional Supply Chain Areas, Timing & Conditions, Expected Outcomes, and Revision; confirm Green proposal details preserve Proposal Objective and Originators, while Industry proposal details preserve Industry Focus, Country Focus, and Proposed Activity; after forwarding an Industry proposal, open it on the Industry Facilitator presentation surface and confirm those Industry fields and all shared fields remain visible for review and projection; returned proposal cards and edit forms must also show the current revision, reviewer notes, and retained revision history; draft review controls must offer Edit and Forward to White Cell, proposal cards must read `Edit Proposal` and `Delete Proposal`, and no current card or new-entry form may require Proposal Category, Delivery, or Industry Instrument of Power
- confirm action, proposal, Strategic Orientation, and RFI cards use the shared workflow labels on every role surface: handed-off drafts show `Forwarded to Facilitator`, first submissions show `Submitted to White Cell`, active White Cell queues also show `Deliberation Underway`, corrected submissions show `Resubmitted`, returned artifacts show `Returned by White Cell`, and terminal artifacts show `Completed`; proposal recipients independently show `Pending approval`, `Approved / forwarded`, `Response received`, `Negotiation underway`, or `Closed`, and historical `SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`, and `BACKFIRE` values appear only in exports rather than current entity cards
- return a Blue or Red action from White Cell and confirm the Scribe and Facilitator cards display the White Cell notes and incremented revision, expose editing plus `Resubmit to White Cell`, and preserve the Facilitator's Coordinated and Informed/Engaged decisions together with the Green/Industry notification metadata while correcting the action; submit it once and confirm the same revision becomes read-only as `Resubmitted`, cannot be submitted again, and can only become editable after a new White Cell return increments the revision
- load a current proposal envelope containing multiple recipient teams and focus sectors plus the supply-chain decision, conditional supply-chain areas, Industry focus, country focus, proposed activity, and revision metadata; confirm the authoring Facilitator, Scribe, and White Cell views render the recorded routing fields, while Blue/Red recipient views render all proposal substance without `Intended Partners` or the other recipient's identity; separately load a historical envelope using `Category`, `Delivery`, `Recipient Team`, and `Focus Sector`, confirm it opens without an error, and confirm its retired values appear only as `Category (historical)` and `Delivery (historical)`
- open the onboarding guide and confirm the live-tracker step highlights the Move/Phase cluster and timer as separate header elements without the timer visually sitting on top of one oversized highlight
- in the Facilitator strategic actions section, confirm forwarded actions open with their full entity details visible by default; the facilitator may deliberately collapse and reopen an action with the `Action details` control
- confirm Scribe-forwarded Strategic Orientation artifacts appear as distinct, fully visible orientation slides, separate from normal action slide treatment and without a minimized state
- confirm Scribe-forwarded actions appear as review slides while direct communications remain in the dedicated chronological thread rather than entering deck navigation
- open the `RFIs` workspace, submit a category-tagged question using the current question-only form, and confirm White Cell receives it; have White Cell return it with required clarification notes, then edit and resubmit the same RFI ID and confirm its compact detail view retains revision/history context; answer another RFI and confirm it moves from Pending to Answered / History
- open the `Communications` workspace, send direct text to White Cell, and confirm the persisted inbound/outbound messages render as one chronological thread visible only to that Facilitator's team and authorized operators
- send two direct White Cell communications to the Facilitator in immediate succession; confirm two separate durable notices and two unread activity-bell arrivals, with each notice identifying White Cell, the communication artifact, the required action, a keyboard-reachable destination button, and a keyboard-reachable Dismiss button; wait longer than the ordinary toast duration and confirm both notices remain, dismiss one and confirm its unread count remains, then open its destination and confirm only that item clears while focus moves to the matching communication; the Simulation Activity panel must retain both messages newest-first, startup history must stay silent, and reconnect reconciliation must recover a missed communication exactly once
- project each Strategic Orientation artifact; presentation mode must show the own orientation, every forecast, and the applicable rationale, expected actions, or strategy description exactly once, hide lifecycle, sequence, timestamps, and White Cell review details, and show the fixed facilitator toolbar at the bottom; orientation projections keep action-only coordination controls unavailable while Edit restores all values and Forward to White Cell remains available for a forwarded draft
- project a forwarded action and confirm the participant-facing slide shows its title, objective, expected outcome, and every recorded action-detail field, including all instruments, levers, supply-chain decision, action angles, supply-chain areas, sectors, countries, coordination, and informed/engaged selections; the detail cards must form a balanced two-column grid, while timeline, lifecycle, sequence, timestamps, White Cell review details, and notes must not appear on the projected slide
- for a Blue action in presentation mode, use the fixed bottom toolbar to open the established team action editor, record Legislative and Executive Yes/No under the `Coordinated` heading, record Industry and Allies Yes/No under `Informed/Engaged`, and select Forward to White Cell; confirm the Blue toolbar has no duplicate top-level Coordinated Yes/No choice, forwarding stays disabled until all four decisions are complete, and the persisted Coordinated decision is derived as Yes when either Legislative or Executive is Yes and No when both are No; then confirm the committed toolbar reports `Submitted to White Cell.` while its controls remain read-only
- for Green, Red, and Industry presentation toolbars, confirm neither the `Coordinated` nor `Informed/Engaged` group is rendered; the streamlined footer must retain Edit, a visible handoff status, and Forward to White Cell, use the full available width without empty decision-group columns, and submit explicit No parent decisions with empty coordination/engagement selections
- from the Facilitator Team Action Review, click Edit on a forwarded draft for each team; confirm the modal uses the shared styled labels, inputs, selects, checkbox/radio cards, focus rings, field spacing, and responsive two-column layout where applicable
- confirm Facilitator submission succeeds for Scribe-forwarded Strategic Orientation artifacts, proposals, and normal forwarded actions after the legacy Scribe and Industry submission RLS patches are applied
- project forwarded actions, complete the Coordinated and Informed/Engaged controls, and submit actions to White Cell; confirm changed or unchanged live action refreshes do not clear or disable in-progress finalization choices
- confirm deck failure states are visible if an upload/path is invalid

Implementation note: Strategic Orientation artifacts and Red Team actions share
the `actions` table with Blue actions. They intentionally persist
`sector` as an empty string when no sector applies, because the live table keeps
that column non-null; role surfaces should render that as `Not specified`. White
Cell renders Strategic Orientation in its own review queue even though the
underlying persistence remains in `actions`. Contract version 2 adds its fields
inside the existing Strategic Orientation text envelope, so this change requires
no database migration; version 1 selection-only and forecast-only envelopes stay
readable and keep their original labels.

## Intercom Plugin Check

Same-browser two-tab test:

1. Join one tab as White Cell or Game Master and another tab as a Blue, Green, Red, or Industry Scribe.
2. In White Cell, open Simulation Settings -> Plugins and enable Intercom.
3. Record a short announcement from White Cell or the selected-session Game Master console, stop, preview, and select Send to Scribes.

Pass: the Scribe tab shows Incoming announcement, plays automatically if the browser allows it, or shows `Playback blocked - click to play.` without console errors.

Two-device test:

1. Keep White Cell or Game Master on the operator device.
2. Join at least two separate devices as different team Scribes in the same session.
3. Send one Intercom announcement.

Pass: every Scribe device subscribed to the session receives the same announcement indicator and can play the clip.

Autoplay-blocked fallback:

1. Open a fresh Scribe browser/profile and do not click inside the page.
2. Send an Intercom announcement from White Cell or Game Master.

Pass: if the browser blocks playback, the Scribe view shows `Playback blocked - click to play.` and the click-to-play control starts the clip.

Plugin disabled state:

1. Enable Intercom, confirm the White Cell recording controls are visible and the selected-session Game Master controls appear, then disable Intercom.
2. Refresh the Scribe page and watch for Intercom UI or background playback.

Pass: White Cell and Game Master controls hide, any active recording stops, Scribe receiver UI is removed, and no Intercom listener continues running until the plugin is enabled again.

Failure handling:

1. Deny microphone permission when prompted.
2. Temporarily use a Supabase project without the `intercom-announcements` bucket or block Storage upload in devtools, then record a clip long enough to exceed the inline threshold.
3. Temporarily block Realtime WebSocket traffic and try sending a clip.

Pass: the operator control surface shows clear microphone, Storage upload, or Realtime broadcast failure text; Scribe clients do not receive malformed or silent announcements.

## Session Recorder Plugin Check

Same-browser notice test:

1. Join one tab as White Cell or Game Master and another tab as any participant role in the same session.
2. In White Cell, open Simulation Settings -> Plugins and enable Session Recorder.
3. Start recording from White Cell or the selected-session Game Master console.

Pass: participants see `Session recording active` and `Audio is being captured for post-game review` while recording is active. Pausing changes the notice to paused copy. Stopping or disabling the plugin clears the notice.

Recording lifecycle test:

1. Start recording, wait at least five seconds, pause, resume, then stop.
2. Preview the generated audio, select Download file, and keep the downloaded audio with the post-game archive.
3. Select Discard/reset only after confirming the file is no longer needed.

Pass: elapsed time updates, invalid pause/resume controls stay disabled, microphone tracks release after stop, and the downloaded file uses the selected browser-supported audio extension.

Export reference test:

1. Stop a Session Recorder capture.
2. Export the research archive from Game Master.
3. Inspect `session_recording_artifacts.csv`, `session_recording_artifacts.json`, `report.html`, and `report.tex`.

Pass: the artifact rows include session ID, recording ID, UTC start/stop, duration, MIME type, file size, operator role/user, plugin ID, filename, storage reference, object URL lifecycle, requested constraints, selected MIME type, and requested/used bitrate. The report indicates that the audio file remains a local browser download and is not embedded in the ZIP.

Research report decision-scope test:

1. Before Move 1, submit the complete Blue, Red, Green, and Industry Strategic Orientation workflows from the matrix above and sample every required narrative in the canonical JSON/CSV projections.
2. During a move, submit an action with supply-chain focus, implementation, legislative, coordination, engagement, and Scribe-handoff choices; have the originating Scribe create a proposal, the actual Facilitator submit it to White Cell, White Cell approve each intended recipient independently, and an approved recipient submit a response that White Cell forwards into its isolated thread.
3. Export the research archive from Game Master and open `report.html`; inspect `report.tex` from the same archive. Exports use schema `1.9.0` / format revision `10`. Confirm Strategic Orientation rows include contract version, own orientation, ordered forecasts, rationale, strategy description, and expected target actions; action rows include workflow/revision, informed Green/Industry audiences and note, and authoritative review history; proposal rows include the current form fields, recipient-specific approvals, and every immutable thread round; RFI rows include return, resubmission, revision, and ordered answer history. `manifest.json` must report a passed contract reconciliation with matching review, thread/round, RFI, Strategic Orientation, and UI workflow counts.

Pass: `Strategic Orientation: Team Workflows` is separate from move actions and shows only persisted session fields plus workflow/revision history. Static orientation catalogue descriptions and characteristics do not appear in either renderer. Action sections show all recorded action and informed-team fields plus authoritative White Cell review transitions. Proposal sections show authored content, intended recipients, recipient-specific approval records, stable revision history, and ordered immutable thread rounds. RFI sections show return notes/reviewer/time, resubmission identity, final answer, and ordered answer history. Any stored pre-contract outcome appears only under `Historical / Legacy Adjudication`; current completed artifacts have no outcome badge or inferred ruling. Executive and team summaries count orientations separately from move actions. `manifest.json` identifies `event_log_source`, the HTML and LaTeX report files, and a passed contract reconciliation. When captured audit events are available, the LaTeX chronology prints each persisted event UUID; when the chronology is reconstructed, the HTML report labels that provenance and the LaTeX report does not print reconstructed rows as captured audit events.

Formal LaTeX PDF check:

1. Extract the research archive and confirm `manifest.json` contains `latex_report_ref: report.tex`, `latex_engine: lualatex`, `latex_build_config_ref: latexmkrc`, `latex_build_readme_ref: LATEX_REPORT_README.md`, `pdf_report_target_ref: report.pdf`, and `pdf_report_included: false`.
2. From the extracted archive directory, run:

```powershell
latexmk -r latexmkrc report.tex
```

3. Open `report.pdf`, compare its session ID, schema version, event-log source, and session checksum with `manifest.json`, and sample Strategic Orientation, action, proposal, response, and RFI entries against their CSV or JSON projections.
4. Inspect the LaTeX log for missing references, missing glyphs, and overfull boxes that obscure content. Run the institution's PDF/A and PDF/UA validators before treating the result as an archival or accessible research publication.

Pass: LuaLaTeX exits successfully, `report.pdf` is created, identifiers and sampled evidence agree with the canonical export files, reconstructed event rows are not represented as captured history, and no compilation issue obscures report content. The generated PDF is a derived publication artifact and is not a replacement for the checksummed archive evidence.

Failure handling:

1. Deny microphone permission.
2. Test in a browser/profile where `MediaRecorder` is unavailable or none of the preferred MIME types are supported.
3. Disable Session Recorder while a recording is active.

Pass: the operator sees permission or unsupported-browser failure text, no silent recording starts, disabling prompts White Cell before stopping an active recording, and the microphone is released after stop or unmount.

Notetaker:

- save dynamics and alliance notes
- append observations
- confirm concurrent notetakers do not overwrite one another

## Larger Exercise Rehearsal

Run the large-record e2e rehearsal before presentation week:

```powershell
npm run test:e2e:rehearsal
```

For the complete non-PLI operational gate, use `npm run test:operational` instead.
That command runs the topology, larger-exercise, realtime-recovery, expanded
18-actor playthrough, and compact operator-controls components after focused non-PLI tests. It deliberately
does not execute PLI or the five SME-console procedures.

The target data shape is:

- 50-150 decisions/actions/proposals/responses
- 20-60 RFIs or inject/communication records
- 100-250 timeline records
- participant history large enough to test roster filtering

Pass:

- Game Master dashboard and participant panel remain usable
- White Cell review queues remain scannable
- team Scribe action lists and Facilitator RFI/response sections remain usable
- timeline views remain bounded and responsive
- no page shows raw JSON, broken controls, or collapsed layouts

Expected bounded rendering:

- White Cell RFIs render the first 50 pending records with a visible count note when more are queued
- Scribe timelines render the first 80 events and Verba AI updates render the first 40 updates
- notetaker timelines render the first 80 events and inboxes render the first 60 communications while badges retain the full count

## Degraded Sync Expectations

If realtime degrades:

- users should see a persistent live-updates warning
- retry should be available for error states
- deterministic writes should still use the existing Supabase/RPC path
- Scribe and White Cell operators should refresh before time-sensitive artifact review; a stale-revision rejection must leave the newer revision unchanged and require the reviewer to refresh

## Training Introduction Media Recovery

The `TRAINING2026` introduction is a local instructional asset. It does not use
a hosted player, tracker, microphone, recorder, Supabase write, or reusable
browser credential. A video failure must not be treated as a failed training
attempt.

If a learner reports a loading, missing-media, decode, offline, or
captions-unavailable message:

1. Ask the learner to open `Show video transcript`; confirm the complete text is
   readable before troubleshooting playback.
2. If the browser reports offline, restore network access and choose `Retry
   video`. The transcript and `Continue to profile confirmation` remain usable
   while offline.
3. For missing or decode errors, choose `Retry video` once. If it fails again,
   continue with the transcript and record the browser name/version plus the
   exact visible message. Do not reset the attempt or move the learner into a
   live session.
4. If captions fail, keep the transcript open and continue. Record the failure
   against `public/training/intro/plenum-onboarding.en.vtt` and the deployed
   public base path. The approved video also carries synchronized open captions
   in the image, but these do not replace the separate text track for assistive
   technology.
5. Confirm `Replay intro` remains keyboard reachable in the Training sandbox
   controls. Replaying must not create a new attempt or clear walkthrough
   progress.

For deployment diagnosis, verify the built application contains the Vite-emitted
MP4 and poster plus
`training/intro/plenum-onboarding.en.vtt`. A missing, stale, or unreviewed media
artifact fails the production media gate. It does not justify removing the
transcript, disabling Continue, weakening attempt isolation, or adding a remote
player. The product owner selected full playback of the 2:28 source and confirmed
that synchronized open captions are burned into the video. The complete visible
transcript and independent WebVTT track are sourced from
`Plenum Briefing/Plenum_Platform_Explainer_Video_Script.md`; its narrated scene
times end at 1:28. If the approved video or script changes, the media owner must
update both text alternatives and re-verify WebVTT timing within 0.5 seconds, as
recorded in `public/training/intro/media-manifest.json`.

## Export/AAR Check

Before closing the demo:

- export session JSON
- export actions, RFIs, timeline, and participant CSVs
- when research capture mode is enabled, export the research archive
- if Session Recorder was used, keep the downloaded audio beside the ZIP and confirm the archive contains `session_recording_artifacts.csv` and `session_recording_artifacts.json`
- inspect `data_quality_summary.json` before using quantitative claims
- after the exports are saved and validated, select Archive from Game Master or White Cell; confirm the session leaves active lists, appears under Archived Sessions in Game Master, participants cannot rejoin, and its latest research audit event is `SESSION_CLOSED`
- from Game Master only, select Delete on the archived session; confirm it leaves the Archived Sessions list, its stored status becomes `deleted`, `deleted_at` is populated, and the immutable event chain retains `SESSION_CLOSED` followed by `SESSION_DELETED`

Archiving and Game Master deletion preserve the session and all dependent
evidence. Delete is an operator-facing tombstone, not a hard database delete.
If Archive reports that
`research_audit_event_log_session_id_fkey` blocks deletion, the Supabase project
is missing `data/2026-08-12_session_archive_transition.sql`; apply that migration
before retrying. If archived sessions are missing or Delete still archives, apply
`data/2026-08-17_game_master_session_retirement.sql` before retrying.

## Stop Conditions

Pause the demo and switch to Scribe narrative if:

- hosted source serves raw source files
- Supabase anonymous auth fails
- role seats cannot be claimed
- White Cell cannot review or return an artifact
- timeline or action lists become unusable under the rehearsal dataset
- export fails for the active session
