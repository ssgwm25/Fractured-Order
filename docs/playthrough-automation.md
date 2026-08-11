# Professional Playthrough Automation

The professional playthrough gate uses eighteen simultaneous browser actors:

- Blue, Red, Green, and Industry: one Scribe, one Facilitator, and two Notetakers per team
- one White Cell Lead
- one Game Master

The Game Master is an active operator but is not a session role-seat row. The
expected selected-session seat count is therefore seventeen while eighteen
browser actors remain open.

## Test Layers

`tests/e2e/live-demo-playthrough.e2e.js` is the end-to-end professional
playthrough. It covers:

- all seventeen selected-session role seats, with concurrent claiming on the
  hosted real backend
- shared UI tokens, duplicate DOM IDs, document overflow, and raw-JSON leakage
- Strategic Orientation from Scribe to Facilitator to White Cell for all teams,
  including a Blue return, edit, resubmission, and outcome-free completion
- orientation gating of White Cell move controls
- timer synchronization through White Cell Lead controls
- the existing normal Blue and Red completions plus integrated Blue and Red
  return/edit/resubmit lifecycles, outcome-free White Cell completion, and
  every populated action-detail field in the review modal, concurrent on the
  hosted real backend
- stable Facilitator finalization controls during unchanged live-data refreshes,
  preserving in-progress Coordinated and Informed/Engaged choices
- distinct proposal entry contracts: Green requires Proposal Title, Originator,
  and Objective, while Industry requires Proposal Title, Industry of Focus,
  Country of Focus, and Proposed Activity
- both proposal forms require one or both Intended Partners, one or more Focus
  Sectors, a Yes/No supply-chain-focus decision, conditional Supply Chain Areas
  only when Yes is selected, Timing & Conditions, and Expected Outcome(s) &
  Duration Assessment; neither form uses Proposal Category, Delivery, Action
  Angle, or an Industry Instrument of Power control
- proposal persistence and review preserve every selected partner and sector,
  the supply-chain decision and conditional areas, the distinct Industry
  fields, and revision identity/history across return, edit, and resubmission
- the originating Scribe creates each proposal and hands it to the actual
  Facilitator, who submits it to White Cell
- historical export/parser fixtures remain compatibility-only: `Category`,
  `Delivery`, `Recipient Team`, and `Focus Sector` are accepted from old rows
  and rendered or exported only as explicitly historical fields, including
  `Category (historical)` and `Delivery (historical)`
- White Cell request-changes review and independent approval of each intended
  recipient, including Blue approval while Red remains pending
- recipient Accept, Not Interested, and Negotiate decisions appended to
  isolated threads; the same dual-recipient proposal creates independent Blue
  and Red round-zero, response, and proposing-Facilitator follow-up rounds
  without overwriting or cross-team disclosure
- multi-team RFI submission from each Facilitator, White Cell response, and
  team-only routing, plus returned-RFI edit/resubmit and retention of both
  return and answer history, concurrent on the hosted real backend
- Facilitator-to-White Cell direct text plus White Cell replies, unread counts,
  ordering, and team/session isolation
- capture from all eight Notetakers with team isolation, concurrent on the
  hosted real backend
- persistent notification dismissal and representative role reload/reconnect
  recovery without replaying or duplicating any inbound event family:
  artifact submission/return, RFI submission/return/answer, proposal
  response/follow-up, or direct communication
- selected-session JSON/CSV/HTML/LaTeX research-archive reconciliation for
  workflow states, revisions, return notes/reviewers/timestamps, recipient
  approvals, both immutable proposal threads and all rounds, notification
  metadata, and RFI return/resubmission/answer history
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
the shared-state read and write. It initializes the PLI adjudication table even
when hydrating state saved by an older mock build, so an empty White Cell PLI
queue renders as an empty state instead of a missing-table error. Pending PLI
rows remain restricted to White Cell and Game Master operators, matching the
live RLS boundary. The static server decodes percent-encoded built asset paths
while retaining its root-directory traversal guard. After the
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

The Realtime suite exercises the `actions` subscription through the Blue
Strategic Orientation handoff while the session remains in its required
pre-move state. The four-team orientation gate and the subsequent normal-action
lifecycle are covered by the professional playthrough. The focused Realtime
gate does not bypass or weaken that workflow precondition.

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

- eighteen browser actors remain active for the test
- the selected session contains exactly seventeen active role seats
- every test step completes without retries or skipped tests
- the schema `1.8.0` / format revision `9` research archive reconciles every
  workflow/revision review, both proposal threads and rounds, notification
  metadata, and returned/answered RFI history across JSON, CSV, HTML, and LaTeX
- no current action, Strategic Orientation, or proposal surface exposes a
  `SUCCESS`, `PARTIAL_SUCCESS`, `FAIL`, or `BACKFIRE` badge
- dismissed notifications stay dismissed, and startup/reconnect recovery adds
  no duplicate durable notification IDs for any inbound event family
- `playthrough-diagnostics.json` reports no page or console errors

## Hosted Real-Backend Run

Use a dedicated rehearsal deployment and Supabase project. Never point this
suite at a production exercise containing real participant data.

```powershell
$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE="<rehearsal-operator-code>"
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-uppercase-run-id>"
$env:PLAYWRIGHT_DEPLOYED_COMMIT=(git rev-parse HEAD).Trim()
$env:PLAYWRIGHT_MIGRATION_STATE="2026-08-11_requests_responded_by_schema_repair"
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

The playthrough fails before creating a session unless
`PLAYWRIGHT_DEPLOYED_COMMIT` equals the checked-out source commit and
`PLAYWRIGHT_MIGRATION_STATE` equals the required final migration identifier.
These declarations must come from deployment and migration records; do not set
them from an old successful run.

Pass:

- all seventeen role-seat claims succeed without manual repair
- White Cell Lead receives the selected-session operator grant and appears in
  the roster under its system-owned `White Cell Lead` display name
- every client converges on the orientation gate and timer state
- concurrent writes create no missing, duplicated, or cross-team records
- all proposal and RFI responses reach only the intended surfaces
- the selected-session export reconciles with the UI-created artifacts
- Playwright produces no failure trace, screenshot, or retained failure video

After the command, clear the sensitive operator value from the shell:

```powershell
Remove-Item Env:PLAYWRIGHT_OPERATOR_ACCESS_CODE
Remove-Item Env:PLAYWRIGHT_DEPLOYED_COMMIT -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_MIGRATION_STATE -ErrorAction SilentlyContinue
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

For a release candidate, run the complete matrix twice from the same clean
commit. First run the deterministic mock with hosted environment variables
cleared, then deploy that commit only after the dedicated rehearsal project is
at the recorded final migration and run the live leg:

```powershell
$candidateCommit = (git rev-parse HEAD).Trim()
$worktreeChanges = git status --porcelain
if ($worktreeChanges) { throw 'Current-head release evidence requires a clean worktree.' }

Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_OPERATOR_ACCESS_CODE -ErrorAction SilentlyContinue
npm run test:e2e:rehearsal

$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE="<rehearsal-operator-code>"
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-uppercase-run-id>"
$env:PLAYWRIGHT_DEPLOYED_COMMIT=$candidateCommit
$env:PLAYWRIGHT_MIGRATION_STATE="2026-08-11_requests_responded_by_schema_repair"
npm run test:e2e:rehearsal
```

Retain both Playwright reports, both diagnostics attachments, the live research
archive, deployment evidence, migration record, run ID, and UTC timestamps as
one current-head evidence bundle. A dirty-worktree mock run remains development
verification and cannot be promoted into that bundle.

An `@import rule was ignored` browser warning means the hosted CSS is stale.
Current app pages load the shared Google Fonts stylesheet explicitly from the
document head, before local component CSS; the shared variables stylesheet
contains no external `@import`. Rebuild and redeploy before accepting a hosted
playthrough gate if that warning is still present.

## Workflow Contract Boundary

The shipped Green and Industry proposal route is Scribe to Facilitator to White
Cell: the originating Scribe creates the proposal and hands it to the actual
Facilitator, and that Facilitator submits it to White Cell. White Cell approves
each intended recipient independently. Approving one recipient creates only
that recipient's round-zero message and isolated, append-only response thread;
it does not approve another recipient or expose either recipient's messages to
the other thread.

The approved recipient's actual Facilitator appends the first response as round
1 using Accept, Not Interested, or Negotiate. The proposing Facilitator may
append round 2, and later replies continue in order without updating or deleting
prior messages. The professional playthrough pins sequential approval of a
dual-recipient proposal, then exercises independent Blue and Red responses and
separate proposing-Facilitator follow-ups. The resulting schema `1.8.0` / format
revision `9` archive must report a passed manifest reconciliation and expose
the same review, recipient, thread/round, notification, and RFI history in
JSON, CSV, HTML, and LaTeX. Full dual-thread verification is part of both the
deterministic and live staged rehearsal gates.

## Manual Checks That Remain Required

Automation cannot determine whether a professional audience finds the product
intuitive. The rehearsal lead must still assess:

- room-scale legibility and projection quality
- terminology comprehension and repetitive copy
- microphone, speaker, autoplay, and managed-device behavior
- actual venue Wi-Fi contention
- whether notifications attract attention without disrupting deliberation
- whether navigation feels consistent across roles
- whether each Facilitator Team Action Review exposes Strategic Orientation and
  Moves 1-3 in one keyboard-operable horizontal mark rail with per-mark counts,
  explicit zero states, newest-first records, and rail-scoped mobile overflow;
  Proposal entries remain a separate grouped workspace

Record these observations separately from the automated gate result.
