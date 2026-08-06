# Live Demo Runbook

Use this runbook before a J7/JFSC or professional military education demonstration. The goal is a stable, serious exercise platform that preserves decision evidence for after-action review.

## Pre-Demo Checks

1. Confirm the latest GitHub Pages deploy succeeded.
2. Confirm hosted source is built output, not raw source.
3. Confirm Supabase anonymous auth, RPCs, RLS checks, and the `intercom-announcements` Storage bucket pass. For existing Supabase projects, apply `data/2026-06-25_industry_team_role_contract.sql`, `data/2026-06-25_scribe_action_submit_policy.sql`, `data/2026-06-25_participant_role_resolver_normalization.sql`, `data/2026-06-25_timer_allocations_game_state.sql`, `data/2026-06-28_white_cell_plugins_game_state.sql`, `data/2026-06-28_intercom_storage_bucket.sql`, `data/2026-07-14_action_artifact_workflow_integrity.sql`, `data/2026-07-17_pli_adjudications.sql`, `data/2026-07-21_scribe_proposal_submit_policy.sql`, `data/2026-07-29_industry_submission_permissions.sql`, `data/2026-07-29_return_action_to_blue.sql`, `data/2026-08-05_team_neutral_artifact_review.sql`, and `data/2026-08-06_facilitator_rfi_communications.sql` in that order before testing Industry seats, Strategic Orientation forecasts, proposals, Facilitator-owned RFIs and direct text, team-neutral White Cell returns, Facilitator-to-White Cell submissions through the legacy `*_scribe` seat, White Cell time allocations, White Cell plugin toggles, or Intercom voice announcements. Existing projects that applied the July and August workflow files before the multi-field proposal update must reapply `data/2026-07-14_action_artifact_workflow_integrity.sql`, then `data/2026-08-05_team_neutral_artifact_review.sql`, then `data/2026-08-06_facilitator_rfi_communications.sql`.
4. Confirm the role matrix can join: Blue, Red, Green, and Industry Scribes, Facilitators, and Notetakers; White Cell Lead; and Game Master. White Cell Support is not a landing-page entry in the shipped SME workflow.
5. Confirm production source maps are not published by default.

Commands:

```powershell
npm test -- --run
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="<anon-key>"; $env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"; npm run build
npm run test:e2e:smoke
npm run test:e2e:live-demo
```

Pass: unit tests, production build, smoke, the eighteen-actor professional
playthrough, focused Realtime recovery gate, and live-demo role tests complete
without failures. The focused
playthrough command and hosted real-backend procedure are documented in
`docs/playthrough-automation.md`.
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

- before Move 1, Blue completes Strategic Orientation, Green completes a forecast of Blue orientation, and Red plus Industry each complete forecasts for Blue, Green (Asian Pacific), and Green (Europe) with one shared team rationale; all four artifacts go to the Facilitator first
- if a Green or Red forecast insert returns a 403 on `actions` or the browser warns that `game_state` is missing, apply `data/2026-06-25_participant_role_resolver_normalization.sql`; if an Industry seat receives an RLS error for an orientation, proposal, RFI, or forwarded submission, apply the migrations through `data/2026-08-06_facilitator_rfi_communications.sql`; pass condition is that same-team Scribe drafts and same-team Facilitator submissions succeed, cross-team writes and participant adjudication still fail, and the live tracker loads from the backend
- confirm the Strategic Orientation button disappears after the team records its selection or forecast; it is a one-time pre-Move-1 input
- confirm the header live tracker reads Strategic Orientation / Pre-Move 1 until all required orientation artifacts reach White Cell, then returns to Move 1 / Internal Deliberation
- create a draft action/proposal/response
- in the Blue Team Action modal, confirm the wizard has three pages and page 3 contains Implementation, Focus Countries, and Expected Outcomes in that order; confirm Instrument of Power appears in a full-width section directly below Action Title, is a checkbox group offering `Economic`, `Diplomacy`, `Information`, `Military`, and `Other`, supports multiple selections, and preserves them on save/edit; choosing `Other` must reveal a required free-text input and persist the typed value on save/edit, confirm the modal no longer renders levers or Date of Effect fields while previously recorded dates remain preserved for historical review, confirm choosing sector `Other` reveals its required free-text input directly under Sectors and that it reappears after deselecting and reselecting `Other`; on page 2, confirm the user must answer Yes or No to `Does this action have a supply chain focus?`, that No keeps the dependent controls hidden, and that Yes reveals checkbox groups for Action Angle (`Build resilience for Blue`, `Disrupt Red`) and Supply Chain Area (`Extraction`, `Refinement`, `Distribution`, `Advanced Manufacturing`), with at least one choice required in each group; confirm Focus Countries includes `U.S` and `Other` with a required free-text input that also reappears after deselecting and reselecting `Other`; on page 3, select Green, Industry, and then both under `Teams to inform`, confirm each selection requires a clarifying note and survives save/edit, and confirm this notification metadata remains separate from the Facilitator's Coordinated and Informed/Engaged fields
- in the Red Team Action modal, confirm the Objective hint reads `What you intend this action to achieve in 6 months.`, confirm Instrument of Power is a checkbox group offering `Economic`, `Diplomacy`, `Information`, `Military`, and `Other` and preserves multiple selections on save/edit, confirm the modal does not render Implementation, Legislative Route, or Date of Effect controls, confirm Focus Countries includes `U.S`, `PRC`, and `Other` with the required free-text input for `Other`, confirm Green/Industry notification selections require a clarifying note and survive save/edit, and confirm the rest of the shared action flow still forwards through the Facilitator
- in a new Green proposal, confirm there are no Proposal Category, Delivery, or Action Angle controls; select Blue and Red independently under Intended Partners, select multiple Focus Sectors independently, choose No for supply-chain focus and confirm the dependent Supply Chain Area controls stay hidden, then choose Yes and confirm the Supply Chain Area checkbox group appears and requires at least one selection; choose sector `Other`, enter a custom value, save/edit, and confirm the custom value returns
- in a new Industry proposal, confirm the modal title and form identify a US Industry proposal and render required Industry of Focus, Country of Focus, and Proposed Activity fields instead of the Green Originator/Objective layout; confirm it uses the same independent partner, sector, supply-chain-focus, and conditional Supply Chain Area controls, has no Action Angle controls, and has no Proposal Category or Delivery controls
- create one dual-recipient proposal and confirm the stored proposal card, Facilitator presentation, White Cell review card, JSON/CSV research rows, HTML report, and LaTeX report retain both intended recipients, all sectors, supply-chain selections, and any Industry-specific fields; historical records with Category or Delivery must still render those fields with a historical label
- forward completed Strategic Orientation artifacts and actions to the Facilitator; Red now provides actions through the same team action flow as Blue, while proposals still enter White Cell review from their role-specific flow
- review RFI history across category tabs; confirm there is no Scribe-side New RFI control
- confirm White Cell responses are separated by category tabs and forwarded proposals appear
- in the Scribe strategic actions section, confirm each action card is collapsed by default to `Action details`, the action title, and `Objective:` only, and that the full action card expands only after it is clicked
- confirm timeline and quick capture render

White Cell:

- confirm every submission card carries a visible source-team badge, including Strategic Orientation artifacts in the mixed-team queue and Green or Industry proposals; Blue, Red, Green, and Industry badges must use their distinct restrained team tint while retaining the full team name, with no team-colored card border or shadow
- confirm the Move Control sequence shows Strategic Orientation before Move 1, marks it active while the gate is incomplete, and marks it complete when Move 1 becomes active
- confirm Move 1 phase/move advance controls remain blocked until Blue selection plus Green, Red, and Industry forecasts arrive from the Facilitator
- confirm the Strategic Orientation queue shows the Blue selection plus Green, Red, and Industry forecasts after Facilitator submission; the Blue card and review dialog must be headed `Blue Team Strategic Orientation Selection: <orientation>` so White Cell can identify its source and artifact type as readily as the forecast entries
- set Time Allocations for Strategic Orientation, Move 1, Move 2, and Move 3; confirm reset uses the active state mark allocation
- open Simulation Settings -> Plugins, enable and disable Intercom and Session Recorder, refresh the White Cell page, and confirm the saved enabled/disabled state persists
- with Intercom enabled, record a short announcement from White Cell or the selected-session Game Master console, preview it, send it to Scribes, then discard/reset the local clip
- with Session Recorder enabled, start, pause, resume, and stop a short recording; confirm the local preview/download appears and the participant notice reads `Session recording active` while audio is being captured
- after stopping a Session Recorder capture, export the research archive and confirm `session_recording_artifacts.csv`, `session_recording_artifacts.json`, and the report Session Recordings section reference the downloaded file
- start/pause/reset the Strategic Orientation timer as lead while the pre-Move-1 gate is still incomplete
- advance/regress phase and move after the Strategic Orientation gate clears
- confirm advancing or regressing moves pauses the timer and loads the target move allocation
- review submitted Strategic Orientation artifacts from the Strategic Orientation queue, then Blue actions, proposals, and Red actions from their role-specific queues; confirm action review is titled `Review Action`, action and Strategic Orientation reviews have only `Accept as Complete` and `Send Back for Improvement` decisions with no outcome selector, return notes are required while acceptance notes are optional, and the action review cards show every recorded field including instruments of power, action angles, supply-chain areas, and Red levers; for a Blue action with Green or Industry selected under `Teams to inform`, confirm the persisted `artifact_payload.action` snapshot contains matching `notificationTeams` and `notificationNote` values and that both the queue card and `Review Action` modal contain a dedicated `Team notification request` section showing every selected team and the Blue clarifying note; at a short viewport and 200% browser zoom, confirm the Review Action body scrolls while the complete footer, including Cancel, remains visible and keyboard reachable
- request changes on a Green or Industry proposal with reviewer notes; confirm the proposal leaves the pending queue, returns to the submitting team as an editable draft under the same proposal ID with its revision incremented, and appears in `Returned / Revision History` with the returned snapshot and notes
- send one Blue action, one Red action, and one Strategic Orientation artifact back for improvement; confirm each submitting team receives its own returned artifact and notes, the White Cell loader, error, success, and timeline language names the submitting team, and no generic control claims a Red or Strategic Orientation return is going to Blue
- open `Returned / Revision History` after the returned artifacts leave their pending queues, then resubmit or complete at least one of them; confirm every return remains visible with the submitting team, returned revision number, return notes, reviewer, timestamp, and the full artifact fields from that returned revision
- reopen the returned proposal from the submitting team, confirm reviewer notes and prior return events are visible in the edit modal, edit it, and resubmit it from the Facilitator presentation; pass condition is that the same proposal ID is resubmitted with the next revision rather than a new unrelated proposal row
- accept an action and a Strategic Orientation artifact as complete with no notes; confirm each moves to `Completed`, `outcome` remains null, and neither the card nor timeline assigns `SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`, or `BACKFIRE`; open the same revision in two White Cell sessions and confirm the second review is rejected as stale after the first review commits
- answer a submitted or resubmitted RFI and confirm it leaves the pending queue, appears as completed history for the requesting team, and creates one response timeline event; with a second White Cell browser holding the same stale pending card, attempt another response and confirm the interface refreshes the queue with an `already completed` warning instead of offering to overwrite the immutable answer
- send direct communications and section updates
- review participant roster filters; select multiple seats, remove them in one confirmation, and confirm each successful removal disappears immediately without a page refresh
- verify facilitator deck assignment status

Facilitator:

- confirm the assigned or default deck remains available in the main viewer and Previous/Next navigation works; the workspace switch exposes `Team Action Review`, `Deck`, `RFIs`, and `Communications` as keyboard-operable tabs, scopes the sidebar to the selected workspace, and restores the last record or support slide viewed in each workspace
- on every `teams/*/scribe.html` Facilitator support interface, open `Team Action Review` and confirm Actions is a vertical stack ordered Strategic Orientation, Move 1, Move 2, and Move 3; all four headings remain visible together, each heading has a count and explicit zero-state, and its newest records appear directly beneath it without tab selection or horizontally scrolling mark controls
- confirm the Proposals section remains visible immediately below Actions, including its zero-state before a proposal arrives; forward proposals from different source teams, open each proposal from the sidebar, and confirm the full proposal can be projected
- for every received proposal, confirm the only response options are `Accept`, `Not Interested`, and `Negotiate`; Accept and Not Interested require confirmation, Negotiate requires terms, and the committed response becomes read-only and visible to White Cell and the proposing team; on the proposing Green or Industry Facilitator surface, keep the originating proposal open and confirm its `Proposal process` panel moves from White Cell review to awaiting recipient response, then to `Accepted`, `Declined`, or `Negotiation requested` without a refresh, with negotiation terms shown in full; when a decision arrives, confirm the Facilitator activity bell and toast identify the decision and link back to the originating proposal exactly once, while decisions already present at startup remain visible but do not replay notifications
- in the Green and Industry Proposals sections, confirm each proposal card is explicitly labelled `PROPOSAL` and shows Proposal Objective, Originators, Intended Partners, Focus Sector, Delivery, Timing & Conditions, and Expected Outcomes; Green proposals retain Category, while Industry proposals show Instrument of Power; in the Industry proposal modal, confirm Instrument of Power replaces Proposal Category, offers the same multi-select `Economic`, `Diplomacy`, `Information`, `Military`, and `Other` options as the Blue Team action modal, preserves all selections on save/edit, and requires a custom value when `Other` is selected; after forwarding an Industry proposal, open it on the Industry Facilitator presentation surface and confirm the full Scribe record is visible for review and projection: title, objective, every originator, every Instrument of Power including a custom `Other` value, intended partners, focus sectors, delivery, timing and conditions, Expected Outcome(s) & Duration Assessment, and intended recipient; draft review controls must offer Edit and Forward to White Cell; proposal cards must read `Edit Proposal` and `Delete Proposal`, with no generic action fields or generic `Forward to Facilitator` control, while Strategic Orientation remains a separate artifact
- confirm action, proposal, Strategic Orientation, and RFI cards use the shared workflow labels on every role surface: handed-off drafts show `Forwarded to Facilitator`, first submissions show `Submitted to White Cell`, active White Cell queues also show `Deliberation Underway`, corrected submissions show `Resubmitted`, returned artifacts show `Returned by White Cell`, and terminal artifacts show `Completed`; recipient proposal responses remain separate chips, and historical `SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`, and `BACKFIRE` values appear only in exports rather than current entity cards
- return a Blue or Red action from White Cell and confirm the Scribe and Facilitator cards display the White Cell notes and incremented revision, expose editing plus `Resubmit to White Cell`, and preserve the Green/Industry notification metadata while correcting the action; submit it once and confirm the same revision becomes read-only as `Resubmitted`, cannot be submitted again, and can only become editable after a new White Cell return increments the revision
- load a proposal envelope containing multiple recipient teams and focus sectors plus supply-chain decision, action angles, supply-chain areas, Industry focus, country focus, proposed activity, and revision metadata; confirm the Facilitator, Scribe, and White Cell views render the same recorded fields, while a historical envelope using `Category`, `Delivery`, `Recipient Team`, and `Focus Sector` still opens without an error
- in every `teams/*/facilitator.html` Actions section and the White Cell Blue action queue, confirm the same horizontal, non-wrapping mark rail exposes Strategic Orientation, Move 1, Move 2, and Move 3; at narrow widths the rail must scroll horizontally instead of stacking vertically, every mark has a visible count and explicit zero-state, keyboard navigation follows the tab pattern, and the selected mark shows the newest record first
- open the onboarding guide and confirm the live-tracker step highlights the Move/Phase cluster and timer as separate header elements without the timer visually sitting on top of one oversized highlight
- in the Facilitator strategic actions section, confirm forwarded actions open with their full entity details visible by default; the facilitator may deliberately collapse and reopen an action with the `Action details` control
- confirm Scribe-forwarded Strategic Orientation artifacts appear as distinct, fully visible orientation slides, separate from normal action slide treatment and without a minimized state
- confirm Scribe-forwarded actions appear as review slides while direct communications remain in the dedicated chronological thread rather than entering deck navigation
- open the `RFIs` workspace, submit a category-tagged question with no Priority field, and confirm White Cell receives it; have White Cell return it with required clarification notes, then edit and resubmit the same RFI ID and confirm its compact detail view retains revision/history context; answer another RFI and confirm it moves from Pending to Answered / History
- open the `Communications` workspace, send direct text to White Cell, and confirm the persisted inbound/outbound messages render as one chronological thread visible only to that Facilitator's team and authorized operators
- send two direct White Cell communications to the Facilitator in immediate succession; confirm the activity bell shows two unread arrivals and the Simulation Activity panel retains both messages in newest-first order, including when the Facilitator surface is still completing live-sync startup
- project each Strategic Orientation selection/forecast and its recorded team rationale for the team; presentation mode must use the full viewer width, show every selected orientation component once, hide lifecycle, sequence, priority/outcome, timestamps, and White Cell review details, and show the fixed facilitator toolbar at the bottom; orientation projections keep the action-only coordination controls visibly unavailable while Edit opens the Strategic Orientation editor and Forward to White Cell remains available for a forwarded draft
- project a forwarded action and confirm the participant-facing slide shows its title, objective, expected outcome, and every recorded action-detail field, including all instruments, levers, supply-chain decision, action angles, supply-chain areas, sectors, countries, coordination, and informed/engaged selections; the detail cards must form a balanced two-column grid, while timeline, lifecycle, sequence, priority/outcome, timestamps, White Cell review details, and notes must not appear on the projected slide
- for a Blue action in presentation mode, use the fixed bottom toolbar to open the established team action editor, record Legislative and Executive Yes/No under the `Coordinated` heading, record Industry and Allies Yes/No under `Informed/Engaged`, and select Forward to White Cell; confirm the Blue toolbar has no duplicate top-level Coordinated Yes/No choice, forwarding stays disabled until all four decisions are complete, and the persisted Coordinated decision is derived as Yes when either Legislative or Executive is Yes and No when both are No; then confirm the committed toolbar reports `Submitted to White Cell.` while its controls remain read-only
- for Green, Red, and Industry presentation toolbars, confirm neither the `Coordinated` nor `Informed/Engaged` group is rendered; the streamlined footer must retain Edit, a visible handoff status, and Forward to White Cell, use the full available width without empty decision-group columns, and submit explicit No parent decisions with empty coordination/engagement selections
- from the Facilitator Team Action Review, click Edit on a forwarded draft for each team; confirm the modal uses the shared styled labels, inputs, selects, checkbox/radio cards, focus rings, field spacing, and responsive two-column layout where applicable
- confirm Facilitator submission succeeds for Scribe-forwarded Strategic Orientation artifacts, proposals, and normal forwarded actions after the legacy Scribe and Industry submission RLS patches are applied
- project forwarded actions, complete the Coordinated and Informed/Engaged controls, and submit actions to White Cell; confirm unrelated live session refreshes do not clear or disable in-progress finalization choices
- confirm deck failure states are visible if an upload/path is invalid

Implementation note: Strategic Orientation artifacts and Red Team actions share
the `actions` table with Blue actions. They intentionally persist
`sector` as an empty string when no sector applies, because the live table keeps
that column non-null; role surfaces should render that as `Not specified`. White
Cell renders Strategic Orientation in its own review queue even though the
underlying persistence remains in `actions`.

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

1. Before Move 1, submit a Blue Strategic Orientation selection, a Green forecast, and Red or Industry forecasts for Blue, Green (Asian Pacific), and Green (Europe).
2. During a move, submit an action with supply-chain focus, implementation, legislative, coordination, engagement, and Scribe-handoff choices; submit and route a proposal through recipient response.
3. Export the research archive from Game Master and open `report.html`; inspect `report.tex` from the same archive. Proposal exports use schema `1.7.0` / format revision `8` and include intended-recipient approval states, multi-sector and conditional supply-chain fields, Industry-specific fields, the stable logical proposal revision, and White Cell return history with reviewer notes.

Pass: `Strategic Orientation: Selections And Forecasts` is separate from move actions and shows only persisted session fields: selection/forecast type, every forecast target, orientation and tag, posture, rationale, primary levers, accepted costs, Scribe handoff, and White Cell review. Static orientation catalogue descriptions and characteristics do not appear in either renderer. `Actions And Adjudications` shows all action decision fields and ruling effects. `Proposals: Content And Review` shows authored proposal content, all intended and forwarded recipients, recipient approval states, review reason, revision history, reviewer notes, and final recipient state. Executive and team summaries count orientations separately from move actions. `manifest.json` identifies `event_log_source` as either `captured_audit_log` or `reconstructed_from_session_records` and identifies the HTML and LaTeX report files. When captured audit events are available, the LaTeX chronology prints each persisted event UUID; when the chronology is reconstructed, the HTML report labels that provenance and the LaTeX report does not print reconstructed rows as captured audit events.

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

## Export/AAR Check

Before closing the demo:

- export session JSON
- export actions, RFIs, timeline, and participant CSVs
- when research capture mode is enabled, export the research archive
- if Session Recorder was used, keep the downloaded audio beside the ZIP and confirm the archive contains `session_recording_artifacts.csv` and `session_recording_artifacts.json`
- inspect `data_quality_summary.json` before using quantitative claims

## Stop Conditions

Pause the demo and switch to Scribe narrative if:

- hosted source serves raw source files
- Supabase anonymous auth fails
- role seats cannot be claimed
- White Cell cannot review or return an artifact
- timeline or action lists become unusable under the rehearsal dataset
- export fails for the active session
