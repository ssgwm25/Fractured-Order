# Professional Playthrough Automation

The professional playthrough gate uses nineteen simultaneous browser actors:

- Blue, Red, Green, and Industry: one Scribe, one Facilitator, and two Notetakers per team
- one White Cell Lead
- one White Cell Support
- one Game Master

The Game Master is an active operator but is not a session role-seat row. The
expected selected-session seat count is therefore eighteen while nineteen
browser actors remain open.

## Test Layers

`tests/e2e/live-demo-playthrough.e2e.js` is the end-to-end professional
playthrough. It covers:

- all eighteen selected-session role seats, with concurrent claiming on the
  hosted real backend
- shared UI tokens, duplicate DOM IDs, document overflow, and raw-JSON leakage
- Strategic Orientation from Scribe to Facilitator to White Cell for all teams
- orientation gating of White Cell move controls
- timer synchronization and White Cell Lead/Support permission separation
- multi-actor Blue and Red action submission and White Cell adjudication,
  concurrent on the hosted real backend
- stable Facilitator finalization controls during unchanged live-data refreshes,
  preserving in-progress Coordinated and Informed/Engaged choices
- Green and Industry proposal creation
- White Cell forward, request-changes, and reject decisions
- recipient Accept, Not Interested, and Negotiate decisions
- multi-team RFI submission, White Cell response, and team-only routing,
  concurrent on the hosted real backend
- direct communications, unread counts, ordering, and team isolation
- capture from all eight Notetakers with team isolation, concurrent on the
  hosted real backend
- representative role reload and persisted-state recovery
- selected-session JSON export reconciliation
- uncaught page errors and browser console errors

The supporting suites remain separate because they test different risks:

- `live-demo-realtime.e2e.js`: all six session subscriptions, measured fanout,
  offline/degraded UI, missed-event reconciliation, duplicate-free recovery,
  team isolation, and cross-session isolation
- `live-demo-topology.e2e.js`: seat contention, seat release, and concurrent
  Notetaker state behavior
- `live-demo-role-matrix.e2e.js`: every shipped seat, including both Notetaker
  seats per team, can join and survive reload
- `live-demo-scale.e2e.js`: large pre-existing queues remain bounded and usable
- `session-smoke.e2e.js`: the narrow release smoke path

## Local Deterministic Run

Run the focused playthrough:

```powershell
npm run test:e2e:playthrough
```

Run the complete rehearsal gate:

```powershell
npm run test:e2e:rehearsal
```

The local static server uses the deterministic E2E backend. Because that mock
persists shared state through browser `localStorage`, actor operations that
write shared records are deliberately serialized locally. The mock also places
every state-changing RPC and table write behind an origin-wide browser lock so
background participant heartbeats cannot overwrite a workflow write between
the shared-state read and write. The static server decodes percent-encoded built
asset paths while retaining its root-directory traversal guard. After the
multi-Notetaker capture batch, local actor pages reload from that shared
persisted state before cross-page assertions because the mock does not emulate
Supabase Realtime fanout. Hosted mode keeps the pages live and requires Realtime
convergence without that reload. The local run validates browser orchestration
and workflow contracts, but it is not evidence of hosted Supabase capacity,
write concurrency, or Realtime behavior.

## Focused Realtime Gate

Run the deterministic orchestration version locally:

```powershell
npm test -- --run src/services/realtime.test.js src/services/sync.test.js src/roles/scribe.test.js
npm run test:e2e:realtime
```

The unit layer pins all six session-filtered subscriptions, per-channel retry
state, readiness only after every channel reports `SUBSCRIBED`, reconnect timer
cleanup, full-store reconciliation, and exactly-once recipient notification.
The local browser layer dispatches offline/online transitions against the
shared deterministic backend. It proves the recovery UI and reconciliation
flow, but not Supabase WebSocket behavior.

Run the authoritative Realtime gate against the dedicated rehearsal deployment:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$secureCode = Read-Host "Enter actual deployed operator access code" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential ('operator', $secureCode)
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE = $credential.GetNetworkCredential().Password
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-uppercase-run-id>"
$env:PLAYWRIGHT_REALTIME_SLO_MS="15000"

npm run test:e2e:realtime
```

Pass means:

- participant, timer, action, request, timeline, and communication changes
  converge on the intended live clients
- the White Cell participant assertion uses the Participants tab inside
  Simulation Settings, matching the shipped navigation hierarchy
- every measured fanout sample is at or below the configured SLO (15 seconds
  by default)
- the disconnected client displays `Live updates paused`
- a communication committed during the outage appears after reconnection
  without a reload and produces exactly one recipient alert
- neither another team in the same session nor the same role in another
  session receives the direct communication
- `realtime-diagnostics.json` identifies the hosted backend, both generated
  session codes, the SLO, and each latency sample

After the run, clear the shell values without producing errors when they are
already absent:

```powershell
Remove-Item Env:PLAYWRIGHT_OPERATOR_ACCESS_CODE -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_REHEARSAL_RUN_ID -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_REALTIME_SLO_MS -ErrorAction SilentlyContinue
Remove-Variable secureCode, credential -ErrorAction SilentlyContinue
```

Pass:

- nineteen browser actors remain active for the test
- the selected session contains exactly eighteen active role seats
- every test step completes without retries or skipped tests
- the JSON export contains the expected actions, proposals, RFIs, participants,
  and timeline evidence
- `playthrough-diagnostics.json` reports no page or console errors

## Hosted Real-Backend Run

Use a dedicated rehearsal deployment and Supabase project. Never point this
suite at a production exercise containing real participant data.

```powershell
$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE="<rehearsal-operator-code>"
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-uppercase-run-id>"
npm run test:e2e:playthrough
```

Before a hosted run, confirm the deployment is reachable from the test machine:

```powershell
Invoke-WebRequest -Uri $env:PLAYWRIGHT_BASE_URL -UseBasicParsing -TimeoutSec 60 |
    Select-Object StatusCode
```

Expected: `StatusCode` is `200`. A timeout or non-200 response blocks the
concurrency gate until the deployment or network path is restored.

The hosted run creates an isolated BrowserContext for every actor and executes
multi-actor joins and writes concurrently. This gives
each actor an independent anonymous-auth session, browser storage, and Realtime
subscription. The session name and join code include the run ID so evidence can
be located after the run. Hosted navigation and operator authorization each
allow up to 60 seconds; navigation does not wait for every non-critical asset
to finish loading. A timeout before operator authorization completes is a
deployment, network, or backend-auth preflight failure, not concurrency
evidence.

The Game Master session helper also allows up to 60 seconds for the deployed
shared navigation and controller scripts to finish their server-side grant
check and bind the Sessions and Create Session controls. It retries both an
early Sessions navigation click and an early Create Session click at that
hydration boundary. The helper treats a create-session modal as ready only
while its active state is mounted, and waits for the submitted modal's exit
transition to detach before creating another session. Failure to activate the
section and mount the form within that window is reported as operator
initialization failure, not as a Realtime result.

Pass:

- all eighteen role-seat claims succeed without manual repair
- White Cell Lead and Support receive distinct grants
- every client converges on the orientation gate and timer state
- concurrent writes create no missing, duplicated, or cross-team records
- all proposal and RFI responses reach only the intended surfaces
- the selected-session export reconciles with the UI-created artifacts
- Playwright produces no failure trace, screenshot, or retained failure video

After the command, clear the sensitive operator value from the shell:

```powershell
Remove-Item Env:PLAYWRIGHT_OPERATOR_ACCESS_CODE
```

Do not publish `PLAYWRIGHT_OPERATOR_ACCESS_CODE`, Playwright traces, downloads,
or browser storage artifacts.

## Evidence and Failure Diagnosis

On failure, inspect the standard Playwright trace, screenshot, and retained
video. The test also attaches `playthrough-diagnostics.json`, containing:

- session name and code
- actor and selected-session seat counts
- whether the run used the local mock or hosted real backend
- uncaught page errors
- browser console errors

Treat missing evidence, a partial export, or a stale historical session as a
failed gate. Do not substitute a prior successful run.

An `@import rule was ignored` browser warning means the hosted CSS is stale.
Current app pages load the shared Google Fonts stylesheet explicitly from the
document head, before local component CSS; the shared variables stylesheet
contains no external `@import`. Rebuild and redeploy before accepting a hosted
playthrough gate if that warning is still present.

## Workflow Contract Boundary

The currently shipped Green and Industry proposal path submits from the visible
Scribe surface directly to White Cell review. After White Cell forwards the
proposal, the recipient Facilitator commits Accept, Not Interested, or
Negotiate directly. The automated suite pins that current runtime behavior.

It does **not** claim that proposals currently pass through an originating
Facilitator before White Cell, or that recipient proposal responses pass through
a recipient Scribe and Facilitator handoff. Those additional handoffs require a
separate product change to the workflow, persistence contract, notifications,
tests, and operator documentation before they can be treated as playthrough
requirements.

## Manual Checks That Remain Required

Automation cannot determine whether a professional audience finds the product
intuitive. The rehearsal lead must still assess:

- room-scale legibility and projection quality
- terminology comprehension and repetitive copy
- microphone, speaker, autoplay, and managed-device behavior
- actual venue Wi-Fi contention
- whether notifications attract attention without disrupting deliberation
- whether navigation feels consistent across roles
- whether each Scribe Actions section presents its decision tabs left-to-right
  in one horizontal scroll rail while Proposal entries remain vertically grouped

Record these observations separately from the automated gate result.
