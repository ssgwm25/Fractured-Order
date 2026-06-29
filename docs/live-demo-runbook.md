# Live Demo Runbook

Use this runbook before a J7/JFSC or professional military education demonstration. The goal is a stable, serious exercise platform that preserves decision evidence for after-action review.

## Pre-Demo Checks

1. Confirm the latest GitHub Pages deploy succeeded.
2. Confirm hosted source is built output, not raw source.
3. Confirm Supabase anonymous auth, RPCs, RLS checks, and the `intercom-announcements` Storage bucket pass. For existing Supabase projects, apply `data/2026-06-25_industry_team_role_contract.sql`, `data/2026-06-25_scribe_action_submit_policy.sql`, `data/2026-06-25_participant_role_resolver_normalization.sql`, `data/2026-06-25_timer_allocations_game_state.sql`, `data/2026-06-28_white_cell_plugins_game_state.sql`, and `data/2026-06-28_intercom_storage_bucket.sql` in that order before testing Industry seats, Strategic Orientation forecasts, Facilitator-to-White Cell submissions through the legacy `*_scribe` seat, White Cell time allocations, White Cell plugin toggles, or Intercom voice announcements.
4. Confirm the role matrix can join: Blue, Red, Green, and Industry scribes; facilitators; notetakers; White Cell Lead; White Cell Support; Game Master.
5. Confirm production source maps are not published by default.

Commands:

```powershell
npm test -- --run
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="<anon-key>"; $env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"; npm run build
npm run test:e2e:smoke
npm run test:e2e:live-demo
```

Pass: unit tests, production build, smoke, and live-demo role tests complete without failures.

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
5. Keep the Game Master console open for participant monitoring and export.
6. If Intercom or Session Recorder is enabled for the selected session, confirm the Game Master plugin mount shows the matching operator controls.

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
- one White Cell Support
- one Game Master

White Cell Support should be able to monitor and communicate but not perform lead-only controls such as starting the timer or recording deliberation.

## Core Flow Checks

Scribe:

- before Move 1, Blue completes Strategic Orientation and Green, Red, and Industry complete forecasts of Blue orientation; all four go to the Facilitator first
- if a Green, Red, or Industry forecast insert returns a 403 on `actions` or the browser warns that `game_state` is missing, apply `data/2026-06-25_participant_role_resolver_normalization.sql`; pass condition is that the same-team Scribe can forward the Strategic Orientation forecast, cross-team writes still fail, and the live tracker loads from the backend
- confirm the Strategic Orientation button disappears after the team records its selection or forecast; it is a one-time pre-Move-1 input
- confirm the header live tracker reads Strategic Orientation / Pre-Move 1 until all required orientation artifacts reach White Cell, then returns to Move 1 / Internal Deliberation
- create a draft action/proposal/response
- forward completed Strategic Orientation artifacts and actions to the Facilitator; normal proposals and move responses still enter White Cell review from their role-specific flows
- submit RFIs across multiple category tabs
- confirm White Cell responses are separated by category tabs and forwarded proposals appear
- confirm timeline and quick capture render

White Cell:

- confirm the Move Control sequence shows Strategic Orientation before Move 1, marks it active while the gate is incomplete, and marks it complete when Move 1 becomes active
- confirm Move 1 phase/move advance controls remain blocked until Blue selection plus Green, Red, and Industry forecasts arrive from the Facilitator
- confirm the Strategic Orientation queue shows Blue selection plus Green, Red, and Industry forecasts after Facilitator submission
- set Time Allocations for Strategic Orientation, Move 1, Move 2, and Move 3; confirm reset uses the active state mark allocation
- open Simulation Settings -> Plugins, enable and disable Intercom and Session Recorder, refresh the White Cell page, and confirm the saved enabled/disabled state persists
- with Intercom enabled, record a short announcement from White Cell or the selected-session Game Master console, preview it, send it to Scribes, then discard/reset the local clip
- with Session Recorder enabled, start, pause, resume, and stop a short recording; confirm the local preview/download appears and the participant notice reads `Session recording active` while audio is being captured
- after stopping a Session Recorder capture, export the research archive and confirm `session_recording_artifacts.csv`, `session_recording_artifacts.json`, and the report Session Recordings section reference the downloaded file
- start/pause/reset the Strategic Orientation timer as lead while the pre-Move-1 gate is still incomplete
- advance/regress phase and move after the Strategic Orientation gate clears
- confirm advancing or regressing moves pauses the timer and loads the target move allocation
- deliberate submitted Strategic Orientation artifacts from the Strategic Orientation queue, then actions/proposals/responses from their role-specific queues
- answer RFIs
- send direct communications and section updates
- review participant roster filters
- verify facilitator deck assignment status

Facilitator:

- confirm default deck loads
- confirm Scribe-forwarded Strategic Orientation artifacts appear as distinct orientation slides, separate from normal action slide treatment
- confirm Scribe-forwarded actions and live communications appear as slides
- project each Strategic Orientation selection/forecast for the team, then use the visible handoff control to submit it to White Cell
- confirm Facilitator submission succeeds for Scribe-forwarded Strategic Orientation artifacts and normal forwarded actions after the legacy Scribe RLS policy patch is applied
- project forwarded actions, complete the Coordinated and Informed/Engaged controls, and submit actions to White Cell
- confirm deck failure states are visible if an upload/path is invalid

Implementation note: Strategic Orientation artifacts and Red move responses share
the `actions` table with normal Blue actions. They intentionally persist
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
3. Inspect `session_recording_artifacts.csv`, `session_recording_artifacts.json`, and `report.html`.

Pass: the artifact rows include session ID, recording ID, UTC start/stop, duration, MIME type, file size, operator role/user, plugin ID, filename, storage reference, object URL lifecycle, requested constraints, selected MIME type, and requested/used bitrate. The report indicates that the audio file remains a local browser download and is not embedded in the ZIP.

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
- team Scribe action/RFI/response lists remain usable
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
- Scribe and White Cell operators should refresh before time-sensitive adjudication

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
- White Cell cannot record deliberation
- timeline or action lists become unusable under the rehearsal dataset
- export fails for the active session
