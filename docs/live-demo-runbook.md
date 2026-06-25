# Live Demo Runbook

Use this runbook before a J7/JFSC or professional military education demonstration. The goal is a stable, serious exercise platform that preserves decision evidence for after-action review.

## Pre-Demo Checks

1. Confirm the latest GitHub Pages deploy succeeded.
2. Confirm hosted source is built output, not raw source.
3. Confirm Supabase anonymous auth, RPCs, and RLS checks pass. For existing Supabase projects, apply `data/2026-06-25_industry_team_role_contract.sql` and `data/2026-06-25_scribe_action_submit_policy.sql` before testing Industry seats or Scribe-to-White Cell submissions.
4. Confirm the role matrix can join: Blue, Red, Green, and Industry facilitators; scribes; notetakers; White Cell Lead; White Cell Support; Game Master.
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

Recommended rehearsal session name:

```text
Fractured Order J7/JFSC Rehearsal
```

## Role Matrix

For each team:

- one Facilitator
- one Scribe
- up to two Notetakers

Operator seats:

- one White Cell Lead
- one White Cell Support
- one Game Master

White Cell Support should be able to monitor and communicate but not perform lead-only controls such as starting the timer or recording deliberation.

## Core Flow Checks

Facilitator:

- before Move 1, Blue completes Strategic Orientation and Green/Red complete forecasts of Blue orientation; all three go to the Scribe first
- confirm the Strategic Orientation button disappears after the team records its selection or forecast; it is a one-time pre-Move-1 input
- confirm the header live tracker reads Strategic Orientation / Pre-Move 1 until all required orientation artifacts reach White Cell, then returns to Move 1 / Internal Deliberation
- create a draft action/proposal/response
- forward completed Strategic Orientation artifacts and actions to the Scribe; normal proposals and move responses still enter White Cell review from their role-specific flows
- submit RFIs across multiple category tabs
- confirm White Cell responses are separated by category tabs and forwarded proposals appear
- confirm timeline and quick capture render

White Cell:

- confirm Move 1 start/advance controls remain blocked until Blue selection plus Green and Red forecasts arrive from Scribe
- confirm the Strategic Orientation queue shows Blue selection plus Green/Red forecasts after Scribe submission
- advance/regress phase and move after the Strategic Orientation gate clears
- start/pause/reset timer as lead after the Strategic Orientation gate clears
- deliberate submitted Strategic Orientation artifacts from the Strategic Orientation queue, then actions/proposals/responses from their role-specific queues
- answer RFIs
- send direct communications and section updates
- review participant roster filters
- verify scribe deck assignment status

Scribe:

- confirm default deck loads
- confirm facilitator-forwarded Strategic Orientation artifacts appear as distinct orientation slides, separate from normal action slide treatment
- confirm facilitator-forwarded actions and live communications appear as slides
- project each Strategic Orientation selection/forecast for the team, then use the visible handoff control to submit it to White Cell
- confirm Scribe submission succeeds for facilitator-forwarded Strategic Orientation artifacts and normal forwarded actions after the Scribe RLS policy patch is applied
- project forwarded actions, complete the Coordinated and Informed/Engaged controls, and submit actions to White Cell
- confirm deck failure states are visible if an upload/path is invalid

Implementation note: Strategic Orientation artifacts and Red move responses share
the `actions` table with normal Blue actions. They intentionally persist
`sector` as an empty string when no sector applies, because the live table keeps
that column non-null; role surfaces should render that as `Not specified`. White
Cell renders Strategic Orientation in its own review queue even though the
underlying persistence remains in `actions`.

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
- team facilitator action/RFI/response lists remain usable
- timeline views remain bounded and responsive
- no page shows raw JSON, broken controls, or collapsed layouts

Expected bounded rendering:

- White Cell RFIs render the first 50 pending records with a visible count note when more are queued
- facilitator timelines render the first 80 events and Verba AI updates render the first 40 updates
- notetaker timelines render the first 80 events and inboxes render the first 60 communications while badges retain the full count

## Degraded Sync Expectations

If realtime degrades:

- users should see a persistent live-updates warning
- retry should be available for error states
- deterministic writes should still use the existing Supabase/RPC path
- facilitator and White Cell operators should refresh before time-sensitive adjudication

## Export/AAR Check

Before closing the demo:

- export session JSON
- export actions, RFIs, timeline, and participant CSVs
- when research capture mode is enabled, export the research archive
- inspect `data_quality_summary.json` before using quantitative claims

## Stop Conditions

Pause the demo and switch to facilitator narrative if:

- hosted source serves raw source files
- Supabase anonymous auth fails
- role seats cannot be claimed
- White Cell cannot record deliberation
- timeline or action lists become unusable under the rehearsal dataset
- export fails for the active session
