# GC-07 evidence collection

This is a verification-tooling extension to GC-07, requested after the human
supplied 104 GC-07, 102 GC-05 and 169 GC-06 passing SQL assertions and four
passing GC-07 SQL-contract tests. Those reports retain their original scope.
The commands below have **not** been executed by the agent. No migration,
participant permissions, represented roster, PLI scoring or GC-08 screen changes
are included. This is not the cross-stage GC-12 release package.
The local browser follow-up also requires the narrowly scoped PLI trigger CORS
correction documented below; its deployment is a separate human-run action.

## Current disposition — September 21, 2026

The human has now supplied the 71-test tooling regression pass and a successful
normal-mode run, `d98bef3e-cb77-483e-b1bf-8b60983418bb`, against the hosted backend
with local frontend assets. SQL rollback and manual-fixture archive receipts are
also present. The [implementation handoff](gc07-implementation-handoff.md) records
these receipts and the distinction between GC-08 implementation prerequisites
and the still-incomplete release/manual evidence package.

The following sections retain reproduction and historical troubleshooting
procedures, not a request to repeat completed checks. No further timeout
comparison or full runner execution is needed solely for this documentation
update. A future execution after source changes still requires prepare/build/seal;
do not rewrite old source digests. The connection-close comparison remains
diagnostic only, and the normal pass does not prove the earlier timeout's cause.
The original migration receipt and skipped manual observations remain open;
the strict manual validator is unchanged.

## Prerequisites and credentials

Use the existing rehearsal Supabase project with migrations through
`data/2026-09-28_gc07_regional_messaging.sql` already installed. Follow the ordered
ledger in `../supabase-setup.md`. Do not rerun the migration to obtain a receipt.
Use the existing `.env.local` values `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`; the latter must be a public anon/publishable key.
Hosted anonymous Auth must already be available. Auth/CAPTCHA/rate-limit errors
stop the run; do not disable controls to get a pass.

Run from the repository root. These variables belong only to the operator CLI;
none is a new browser config or Vite secret:

```powershell
$env:GC07_EVIDENCE_OPERATOR = Read-Host 'Evidence operator name or initials'
```

SQL and hosted commands prompt for a Supabase personal access token without
echoing it. An existing process-level `SUPABASE_ACCESS_TOKEN` is also supported.
Never paste the token into a command argument, source file, transcript or browser.
The runner keeps Auth tokens in memory, redacts JSON reports, signs users out,
and leaves synthetic Auth accounts and archived history intact.

## Fresh SQL and rollback receipt

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs sql
if ($LASTEXITCODE -ne 0) { throw 'GC07 SQL evidence failed; retain the output directory.' }
```

Expected: `GC07 SQL PASS`. The printed unique directory under
`output/release-evidence/gc07/` contains exact submitted SQL, source hashes and
working-tree state, the migration source, project reference, request IDs,
server timestamps, function definitions/ACLs, policies, trigger definitions and
retry indexes. The receipt requires 104 distinct checks and verifies absence
of fixture sessions, rosters, participants, grants, seats, RFIs, messages, reviews
and timeline rows **after** deliberately rolling back the fixture subtransaction.
It compares schema snapshots before and after. No migration is applied.

If the original application receipt exists, retain its sanitized text verbatim:

```powershell
$env:GC07_MIGRATION_RECEIPT = Read-Host 'Full path to the existing sanitized migration application receipt'
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs sql
if ($LASTEXITCODE -ne 0) { throw 'GC07 SQL evidence failed.' }
Remove-Item Env:GC07_MIGRATION_RECEIPT
```

The optional attachment is hashed and copied; its presence does not validate its
claims. The operator must reconcile its original target, source and application
time with the environment ledger. A fresh installed-schema snapshot cannot
recover a lost historical COMMIT timestamp. If the original receipt is missing,
the report says `not supplied`; historical installation provenance stays open.
Fixture rollback is distinct from application rollback. Once regional records
exist, use frontend containment and a forward fix as described in
`../supabase-rollback.md`; never drop columns or erase history.

## Hosted Auth, compatibility and connection contention

Prepare/build/seal records bind the exact source tree to freshly built assets.
The commands intentionally separate building from verification; the CLI never
builds or deploys automatically.

```powershell
$env:GC07_BASE_URL = Read-Host 'Already served candidate app directory URL, ending / or /Fractured-Order/'
$gc07PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    $env:VITE_PUBLIC_BASE_PATH = ([uri]$env:GC07_BASE_URL).AbsolutePath
    node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs prepare
    if ($LASTEXITCODE -ne 0) { throw 'GC07 build preparation failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'GC07 candidate build failed.' }
    node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs seal
    if ($LASTEXITCODE -ne 0) { throw 'GC07 build seal failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc07PreviousBase
}
```

For a hosted HTTPS candidate, publish only through the separately authorized
deployment process, then run:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'GC07 hosted verification failed; retain its report.' }
```

Alternatively, set `GC07_BASE_URL` to
`http://127.0.0.1:4174/Fractured-Order/` before prepare/build/seal. In a second
terminal at the repository root, explicitly set the matching server base path:

```powershell
$env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
npm run serve:test
```

Leave that server running on port 4174. Environment variables are local to each
terminal; the server defaults to `/` without this setting and prefixed asset
requests fail. Back in the first terminal, run:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs --local
if ($LASTEXITCODE -ne 0) { throw 'GC07 local-frontend/hosted-backend verification failed.' }
```

Local mode still calls the real hosted Auth/RPC backend. It cannot establish
deployed frontend evidence. Before creating any users, both modes require byte
parity for served HTML/JS/CSS/JSON and a bundle identifying the same Supabase
project. A mismatch stops before fixture setup. Keep each run directory under
`test-results/gc07-live/`; do not edit the source or dist during a run.

Expected: `GC07 runner PASS`, with `workflowPassed`, `racesPassed`,
`cleanupPassed` and all Auth sign-outs true. The run creates three new synthetic
sessions (shared, paired, unified), using 18 distinct hosted Auth identities for
the existing Green workflow roles, White Cell and Blue/Red recipients. These are
test identities, not additional represented participants or exercise approval.
Only fixture setup/lease expiry/revocation/archive use Management SQL. Participant
workflow checks use actual Auth tokens over PostgREST.

Coverage includes the unchanged GC-06 proposal/recipient-thread and GC-05
orientation workflow runner, regional RFI creation/retry/return/correction/answer,
Scribe isolation, private direct messages, all four audiences, journal/deck
notice routing, stale/revoked shared-seat denial, and legacy unified RFI behavior.
Two explicitly synthetic submitted Blue/Red action fixtures per session test
unauthorized/unrequested notification rejection and atomic White Cell approval
with both-region delivery. Their creation is fixture setup, not participant
authorship or PLI adjudication. These inputs also appear in the manual sessions.
The reused GC-06 final direct-table denials remain applicable under GC-07's
RPC-only policy; its old diagnostic text is not a denial of the new scoped RPCs.

Three races cover independent regions, duplicate creation, and competing White
Cell returns. Each requires distinct matching PostgreSQL backend IDs, server
observation of blocking, measurable wait, and an independent committed read.
Race SQL simulates claims of the recorded hosted users; it is labeled separately
from the real-token HTTP checks. The runner settles both requests before cleanup.
This is not hosted browser interaction, WebSocket recovery or screen-reader proof.

The competing-return receipt records the losing connection's SQLSTATE and message.
The installed review function validates submitted state before comparing revisions:
after one return commits, the loser can receive `23514` with exactly
`Only submitted RFIs can be returned for clarification.` instead of `PT409`.
The harness accepts that specific rejection or the terminal revision conflict,
and still requires observed blocking, a single revision increment, returned state,
and independent committed readback. Other check violations remain failures.

Run `c9959837-58f3-42fb-ab35-94c80e8c7976` recorded successful workflows and
region/retry races but failed when the old harness expected only `PT409` for the
competing return. Cleanup archived all three fixtures and retained history.
Keep that failed report unchanged. After this harness correction, run the narrow
regressions below, then prepare/build/seal again and collect a new run; source
changes invalidate the previous build receipt. No migration is needed. A fresh
complete hosted-backend result remains required.

Runs `9bf15829-def7-44dd-aa4f-90a814f5380d` and
`4739bcec-c91a-4802-82eb-f4d702be34ce` timed out after 30 seconds renewing the
unified White Cell seat at different workflow steps. Both archived their fixtures
and signed out all 18 identities. Neither supplied an HTTP response for the stalled
request; these receipts cannot establish whether the cause was a database wait or
a transport failure. Do not treat a timeout as an authorization denial or a pass.

The participant transport now records whether it was waiting for headers, reading
the body, or parsing JSON, plus elapsed time, available request/edge IDs and safe
error codes. A seat claim still pending at 20 seconds triggers one read-only
Management SQL snapshot with `read_only: true` and an eight-second HTTP
limit. It records at most 20 candidate claim backends, their wait events and blocker
IDs/states, never query text, client addresses or JWTs. Candidates are selected by
RPC name in the same database; they are not conclusively linked to the HTTP request.
An empty snapshot alone does not prove a network failure. Correlate its server time
and available request IDs with project logs. No sessions are cancelled and no
permissions, seat duration, participant deadline or retry policy are changed.
An already-started diagnostic settles before cleanup; its failure cannot replace
the original request error. This is diagnostic tooling, not a timeout repair.

### Connection diagnostics for a stalled participant request

The subsequent `5e9a38fa-d9bf-484b-87fe-ae3bf6c616af` run renewed the same
unified Green seat successfully five times before a sixth claim waited 30 seconds
for response headers. The supplied Supabase summary export contains a likely
matching HTTP 200, but no upstream duration or response-delivery details. Its
empty `logs` array cannot locate the fault. The database snapshot found no active
candidate claim query at that instant. These facts do not prove a root cause;
the failed run and its cleanup receipts remain unchanged.

`scripts/gc07-live-transport.mjs` now observes the existing Node fetch through
[Undici diagnostic channels](https://undici.nodejs.org/api/DiagnosticsChannel).
It adds `requests[].transport.connection` with Node/bundled Undici versions,
`requestEventsObserved`, and at most 32 timed events per HTTP call. Additional
events increment `droppedEvents`. No dependency, new HTTP client, dispatcher,
retry, timeout increase, database policy or participant workflow is introduced.

| Event | What it establishes |
| --- | --- |
| `request_created` | Undici created an outgoing request in this call's async context. |
| `connection_attempt`, `connection_established`, `connection_error` | Connection activity in that context, **not** proof of which request used that connection. |
| `socket_selected` | This exact request reached a socket and is about to write headers; it does not prove the server received them. |
| `request_body_sent` | Undici reports the request body fully sent; it does not prove server processing or commit. |
| `response_headers` | Undici received response headers, including the recorded status and available request/edge IDs, even if fetch has not resolved yet. |
| `response_complete` | Undici received the complete response; JSON parsing is still tracked separately. |
| `request_error` | A bounded error code for this exact request, without its message or stack. |

Request events use object identity after binding `request_created` to the async
call, so simultaneous same-URL requests stay separate. `requestNumber` is only
an ordinal within that call, not a Supabase request ID. Connection events are
explicitly labelled `connection_context_only`; pooled connections may emit none.
No events, or `requestEventsObserved: false`, means unavailable/unobserved
instrumentation, not proof that nothing was sent. These experimental channels
may differ between Node versions. They do not separately time DNS, TCP and TLS.

Inspect the last exact-request event alongside `transport.stage`, error codes
and the existing database snapshot. A body-sent event without response headers
narrows the wait to after client transmission; it does not distinguish network
loss from a gateway or server delay. Diagnostic response headers while fetch
still awaits headers identify a different boundary to investigate. Neither
observation turns a failed request into a pass.

Listeners copy only event names, elapsed milliseconds, correlation labels,
request ordinals, socket-observation booleans, numeric status, bounded error codes and allowlisted response
identifiers (`sb-request-id`, `x-request-id`, `cf-ray`). They retain no request
headers, bodies, socket objects, addresses or connection parameters. Observer
exceptions increment `observerErrors` and cannot replace the HTTP outcome.
Listeners are removed on success, failure and timeout, before awaiting the
already-started database probe. The 20-second snapshot copies its event list so
later events cannot rewrite what was observed at that time.

First, the human runs the network-free regressions and artifact check:

```powershell
npm test -- tests/unit/gc07-live-transport.test.js tests/unit/gc07-evidence.test.js tests/unit/gc07-sql-contract.test.js tests/unit/gc06-live-check.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC07 transport or compatibility regression failed.' }
npm run verify:repo-artifacts
if ($LASTEXITCODE -ne 0) { throw 'Repository artifact verification failed.' }
```

Expected: every selected test passes without skips, including synthetic channel
coverage of event ordering, secret exclusion, concurrent request isolation,
connection errors, absent events, bounded output, observer errors, listener
cleanup and the unchanged deadline. No tests or hosted execution were performed
by the agent. Live diagnostic availability and the original timeout's root cause
remain unverified. This is additional evidence collection, not a claimed repair.

### Explicit connection-close comparison

The human supplied 65 passing selected tests and successful prepare/build/seal
before run `bafc173b-50a1-43e7-bc00-c4a76205cfd6`. That run still failed on a
unified seat renewal: socket selection at 0 ms, request body sent at 1 ms, no
response-header event, and timeout at 30,001 ms. Its 20-second database snapshot
had no candidate claim query. All three fixtures were archived and all 18 Auth
sign-outs succeeded. This identifies the observed wait after client transmission;
it does not establish which system lost or delayed the response.

The explicitly selected `--connection-close` mode adds `Connection: close` only
to calls through the participant request wrapper (including its identity reads).
It uses the same Node fetch, JWTs, payloads, default TLS validation, 30-second
deadline, no-retry behavior, workflow assertions and cleanup. Auth SDK signup and
sign-out, Management SQL and asset verification retain their existing transports.
It does not install a different HTTP client or dependency, or change normal runs.
The transport policy is recorded at report and request level.

The header requests closure after a response; it does **not** prove the first
request used a new connection, nor drain unrelated Auth SDK connections. Each
`socket_selected` event therefore also records:

- `connectionEstablishedDuringCall`: an observed `client:connected` event used
  the identical socket object during this call's observation window.
- `previouslySelectedInProcess`: an earlier instrumented request selected the
  identical socket. False alone does not prove freshness.

These booleans use weak references in memory and write no socket objects or
addresses to evidence. Connection events outside a request's async context are
not attributed to it unless an exact socket match later establishes that link.
For the unified claims, inspect every `socket_selected` event: freshness is
supported by `connectionEstablishedDuringCall: true` and
`previouslySelectedInProcess: false`. Missing events/booleans, dropped events or
observer errors leave freshness unverified. Do not infer it from the CLI flag.

Necessary scope extension: the runner has a diagnostic-only CLI/report outcome,
and the manual evidence validator rejects that outcome. Even a completed
comparison keeps `passed: false`, with `diagnosticOnly: true`,
`diagnosticCompleted: true` and `runCompleted: true`. It prints
`GC07 connection-close diagnostic COMPLETE (not acceptance)` and exits zero only
if workflows, races, cleanup and all 18 sign-outs completed without interruption
or error. Failure prints `FAIL` and exits nonzero. Normal runs retain their
`GC07 runner PASS/FAIL` output. Comparison completion cannot supply a manual
acceptance template or upgrade an earlier failed report.

First run the network-free test block above again for this new change. Six new
tests cover explicit option parsing, header-only changes and input preservation,
socket identity matching/reuse, unchanged timeout/no retry, diagnostic outcome
separation, manual evidence rejection and incomplete cleanup/interruption.
The preceding 65-test report does not verify these new tests.

After those pass, use the existing prepare/build/seal instructions with
`GC07_BASE_URL=http://127.0.0.1:4174/Fractured-Order/` and keep the matching static
server running. Then the human runs the comparison once:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs --local --connection-close
if ($LASTEXITCODE -ne 0) { throw 'Connection-close comparison failed. Retain its evidence directory; do not retry.' }
```

This still creates the documented 18 synthetic Auth identities and three new
fixture sessions; respect the existing Auth rate limits. It is not a read-only
probe or an automatic retry of the failed seat claim. Keep Node, project, source
and environment fixed when comparing results. Existing baseline runs precede
this tooling change, so any comparison with them is historical, not a matched
same-source A/B experiment.

If the timeout recurs with a positively observed fresh socket, reuse of an old
socket cannot explain that particular request. If the run completes with fresh
sockets, that supports investigating connection reuse but does not establish
causation: request timing and remote conditions also change. If freshness cannot
be observed, the comparison is inconclusive on that question even when execution
completes. No old failures are suppressed, no deadlines are relaxed, and no
acceptance result is inferred. Retain the whole run directory, including
`results.json` and any `slow-seat-claim-*.sql`. No new tests or hosted comparison
have been executed by the agent; live comparison evidence remains required.

Cleanup archives only guarded fixture IDs, revokes their grants and closes seats.
It independently compares actions, RFIs, messages, timeline, review and research
history before/after, permitting the expected session-closure audit event. On a
failed/interrupted run, retain its failed report and retry cleanup without
rewriting it:

```powershell
$gc07Run = Read-Host 'Exact run UUID printed by the failed runner'
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs cleanup $gc07Run
if ($LASTEXITCODE -ne 0) { throw 'GC07 cleanup remains unresolved; retain the error.' }
```

## Manual browser and accessibility evidence

### White Cell join and heartbeat regression

The manual shared-session rehearsal exposed `GC03_SEAT_REJOIN_REQUIRED` (403)
immediately after joining White Cell. The browser reported seat
`b555c468-2a54-4d45-a6c6-5c139c9431a0` in session
`2b8473ee-6013-4387-b90c-a191c71b0209`. Its console receipt is retained as
`manual-whitecell-heartbeat-failure.md` alongside the pending observations for
automated baseline `3a485400-c4b5-4c5e-9b06-b5eb6e039b8d`. This is a reported
failure, not a completed manual acceptance check.

Source inspection found a navigation race: White Cell initialized sync on the
landing page without confirming the claimed seat. Its pagehide handler could
disconnect that seat during navigation, and `whitecell.html` skipped server seat
restoration before the next heartbeat. The console alone does not prove the
server's disconnect timing. The repair validates and confirms the White Cell
claim, defers sync until the workspace, and makes both application and White Cell
controller startup await the same existing `restore_session_seat_context` RPC.
The existing server-side operator-grant check still runs. Invalid, revoked or
mismatched seats stop startup behind the accessible retry/join gate. Confirmed
regional White Cell seats now use the existing regional navigation, heartbeat
rejoin and reconnect behavior; unified seats retain the legacy server contract.

This is a necessary GC-07 White Cell lifecycle dependency in `src/roles/landing.js`,
`src/services/seatBootstrap.js` and `src/roles/whitecell.js`. It adds no migration,
role, roster member, scoring change, approval bypass or GC-08 creation surface.
Verification for this repair has not been executed by the agent.

### SME operator-seat lifecycle parity

The SME console used the same claimed-seat heartbeat contract but did not share
the repaired White Cell startup lifecycle. It started sync on the landing page
without confirming the SME claim, so the landing-page `pagehide` handler could
disconnect the seat during navigation. `sme.html` then skipped
`restore_session_seat_context`; its first heartbeat correctly failed with
`403 / GC03_SEAT_REJOIN_REQUIRED` and could not enter the regional reclaim path.

The parity repair validates and confirms the SME claim before navigation, defers
sync to the destination workspace, and makes both application and SME-controller
startup await the existing fail-closed seat restoration gate. No RPC, RLS,
operator-grant, role-capacity, or rejoin semantics are relaxed. A missing or
RLS-hidden `game_state` row continues to use local read-only defaults. Restore
the seat first; only a row that remains absent after successful validation is an
independent backend backfill blocker under the documented migration ledger.
Verification for this repair has not been executed by the agent.

Run the narrow regressions first:

```powershell
npm test -- src/roles/landing.join.test.js src/roles/whitecell.test.js src/services/seatBootstrap.test.js src/services/seatBootstrap.deck-cleanup.test.js src/stores/participants.gc04-context.test.js src/stores/participants.test.js
if ($LASTEXITCODE -ne 0) { throw 'White Cell seat lifecycle regression failed.' }
npm test -- src/roles/landing.join.test.js src/roles/sme.test.js src/services/seatBootstrap.test.js src/services/database.game-state.test.js src/stores/gameState.test.js src/stores/participants.gc04-context.test.js
if ($LASTEXITCODE -ne 0) { throw 'SME seat lifecycle regression failed.' }
npm run verify:repo-artifacts
if ($LASTEXITCODE -ne 0) { throw 'Repository artifact verification failed.' }
```

Expected: every selected test passes without skips, including all three seat
models, both app base paths, claim mismatch/revocation, concurrent startup,
denied-seat gating, White Cell navigation and server-authorized lease recovery.
Artifact verification must pass. These are unit checks, not hosted evidence.

Retest the existing GC-05/06 adapter and authorization contracts:

```powershell
npm test -- src/services/database.gc05-orientations.test.js src/services/database.gc06-proposals.test.js src/services/database.shared-green.test.js src/services/database.regional-security.test.js src/services/database.privileged.test.js src/services/supabaseMock.test.js src/features/actions/proposalRecipientState.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05/06 or legacy compatibility regression failed.' }
```

Expected: all selected tests pass without skips; no hosted calls or SQL execution.

After they pass, prepare/build/seal the changed candidate using the preceding
hosted procedure. Keep the existing Chrome profiles and original evidence; do
not edit source digests or mark the old pending form complete. A fresh complete
hosted runner report is required for this source. Generate the next manual form
from that new successful run. Existing distinct browser Auth identities may be
reused if still signed in; read their actual IDs again and record them by role.
Use the new form's fresh session IDs and setup SQL. Preserve and archive the old
manual fixtures through their guarded cleanup, retaining its printed receipt:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs cleanup 14034733-ef25-4dad-bb7a-753a6955f673
if ($LASTEXITCODE -ne 0) { throw 'Original manual fixture cleanup remains unresolved; retain its report.' }
```

Cleanup must archive only that synthetic run and preserve its history. In the
fresh rehearsal, capture White Cell join and reload for shared, pairs and unified
sessions. Verify successful server restoration before workspace heartbeat, no
landing-page disconnect race, continued heartbeats and normal White Cell review.
Retain failures; a denied or revoked seat must remain blocked. Complete the
21 actual manual observations and cleanup receipts below before requesting
full manual acceptance. This is separate from the scoped implementation handoff
recorded above. Historical migration provenance and deployed-asset evidence remain
separate from local-frontend verification against hosted Supabase.

### PLI trigger CORS during local action review

After the human confirmed approval-gated Blue and Red notifications reached both
Scribes, the browser reported a failed preflight for `trigger-pli-adjudication`:
the allowed origin was `https://ssgwm25.github.io`, while the browser origin was
`http://127.0.0.1:4174`. The source allowlist included ports 5173 and 4173 but
omitted the documented `serve:test` port 4174. The action-completion RPC and its
notifications finish before `handleArtifactReview` attempts this separate
asynchronous PLI trigger. The trigger failure does not undo completion or those
notifications. No successful PLI dispatch or backup job is established by this
observation.

Necessary GC-07 follow-up scope expansion: add only `http://127.0.0.1:4174` to
`supabase/functions/trigger-pli-adjudication/index.ts`. No wildcard, alternate
host origin, authorization bypass, scoring change or migration is introduced.
The existing audited server-derived authorization remains mandatory before
GitHub dispatch. `pli-report-narrative` is not changed by this correction.

First run the narrow, network-free tests:

```powershell
npm test -- tests/unit/gc07-pli-cors.test.js tests/unit/gc03-edge-dispatch.test.js src/services/database.trigger-pli.test.js
if ($LASTEXITCODE -ne 0) { throw 'PLI trigger CORS or authorization regression failed.' }
npm run verify:repo-artifacts
if ($LASTEXITCODE -ne 0) { throw 'Repository artifact verification failed.' }
```

Expected: all tests pass without skips. Coverage exercises the actual handler's
rehearsal and production preflight, rejection of unlisted origins, CORS headers
on 401/403 responses, denied session authority without dispatch, and authorized
dispatch with mocked network responses. These tests do not deploy or invoke the
hosted function.

After tests pass, the human can deploy this single function to the existing
project using the established authenticated Supabase CLI. This deploys the local
entrypoint and its shared authorization dependency; it does not apply migrations:

```powershell
npx supabase functions deploy trigger-pli-adjudication --project-ref gsromgrxgrwwfywaoyme
if ($LASTEXITCODE -ne 0) { throw 'PLI trigger deployment failed; retain its output.' }
```

Retain the deployment output and deployed version/source provenance. Do not
disable JWT verification or server authorization to address a CORS error.
Verify the exact origin with a preflight only, without a JWT or a scoring job:

```powershell
$gc07Preflight = Invoke-WebRequest -UseBasicParsing -Method Options `
    -Uri 'https://gsromgrxgrwwfywaoyme.supabase.co/functions/v1/trigger-pli-adjudication' `
    -Headers @{
        Origin = 'http://127.0.0.1:4174'
        'Access-Control-Request-Method' = 'POST'
        'Access-Control-Request-Headers' = 'authorization,x-client-info,apikey,content-type'
    }
if ($gc07Preflight.StatusCode -ne 200 -or
    $gc07Preflight.Headers['Access-Control-Allow-Origin'] -ne 'http://127.0.0.1:4174') {
    throw 'Hosted PLI trigger preflight still does not permit the rehearsal origin.'
}
$gc07Preflight | Select-Object StatusCode, Headers
```

Expected: HTTP 200 with the exact rehearsal origin and POST/required headers
allowed. This proves preflight behavior only, not a successful PLI run. Do not
reapprove completed fixtures or invent new participant actions to retest dispatch.
No tests, deployments or preflights have been run by the agent for this change.
The existing browser bundle does not need rebuilding to receive a deployed Edge
header change. However, the collector hashes repository source including Edge
files and documentation: any later source-bound hosted evidence run requires
fresh prepare/build/seal. Preserve the prior reports and observations.

### Collect observations

Use actual browser/OS/screen-reader versions and human observations. The checklist
covers seven cases for each of the three models (21 total): keyboard/focus,
screen-reader labels and announcements, mobile/200% zoom, reduced motion,
offline/reconnect/read-state retention, audience/approval flows, and removal.
Pending, failed, skipped, duplicate, missing, future-dated or unreferenced results
cannot validate. Automated screenshots or mock tests do not fill observations.

```powershell
$gc07Run = Read-Host 'Exact successful hosted runner UUID'
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs manual-template $gc07Run
if ($LASTEXITCODE -ne 0) { throw 'Manual template creation failed.' }
$gc07FormPath = Join-Path "test-results/gc07-live/$gc07Run" 'manual-observations.json'
```

The template generates separate session IDs/codes. Do not reuse the archived API
fixtures. Open the tested app in isolated browser profiles for each listed role,
using normal hosted Auth. Record each **distinct** browser Auth user ID in the
form. This read-only browser-console expression reveals IDs without tokens:

```javascript
(() => {
    const auth = JSON.parse(sessionStorage.getItem('esg-simulation-auth') || 'null');
    const seat = JSON.parse(sessionStorage.getItem('esg_session_data') || 'null');
    return { authUserId: auth?.user?.id, seatId: seat?.participantSessionId,
        sessionId: seat?.id, role: seat?.role };
})()
```

If the app has not established Auth yet, complete its normal authentication flow
first. Do not manufacture user IDs, JWT claims or seat state. After all browser
Auth IDs are recorded, generate guarded setup SQL (this command does not execute it):

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs manual-prepare $gc07Run
if ($LASTEXITCODE -ne 0) { throw 'Manual fixture preparation failed.' }
$gc07Form = Get-Content -Raw -Encoding UTF8 $gc07FormPath | ConvertFrom-Json
Get-Content -Raw -Encoding UTF8 "test-results/gc07-live/$($gc07Form.manualRun)/setup.sql" | Set-Clipboard
```

Run the entire generated setup file in that project's SQL Editor as postgres.
Expected: three fresh sessions, configured through existing topology RPCs before
any joins, unchanged synthetic roster membership, two submitted synthetic
Blue/Red notification inputs per session, and only session-bound White
Cell grants. Join using each generated code and normal role controls. Record the
server-confirmed seat IDs; the synthetic artifacts may already have frozen the
correctly configured topology. This is expected and must not be undone. The
selected role alone is not evidence that its seat was
claimed. Keep original setup output with the evidence. No creation screens are added.

Follow every instruction in `manual-observations.json`. Test both Scribes, the
shared Facilitator, White Cell and the applicable paired/unified roles; use only
synthetic action content. For Blue/Red notification requests, record no delivery
before White Cell approval, then both-region delivery after approval. Check
individual-role privacy and proposal recipient isolation separately. Record
actual contrast/focus problems as failures. Use the two submitted synthetic
notification fixtures for approval checks; do not create exercise decisions.
For screen-reader checks record the
spoken role, region, revision and error/notification text. Record viewport/zoom
and reduced-motion settings in the observations. Capture sanitized notes or
screenshots as files directly inside this run's directory, and list their names
in `evidenceFiles`. Never include tokens, browser storage dumps or participant data.

After all manual work, archive the generated browser fixtures and capture the
independent cleanup receipt:

```powershell
$gc07Form = Get-Content -Raw -Encoding UTF8 $gc07FormPath | ConvertFrom-Json
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs cleanup $gc07Form.manualRun
if ($LASTEXITCODE -ne 0) { throw 'Manual fixture cleanup failed.' }
$gc07CleanupPath = Read-Host 'Full path to the cleanup-retry JSON printed by that command'
if (Test-Path "test-results/gc07-live/$gc07Run/manual-cleanup.json") { throw 'Keep the existing receipt; use a new filename and record it in the form.' }
Copy-Item -LiteralPath $gc07CleanupPath -Destination "test-results/gc07-live/$gc07Run/manual-cleanup.json"
```

Set each session's `cleanupReceipt` to `manual-cleanup.json`, fill the actual
observations/timestamps and environment fields, and validate:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc07-live-check.mjs manual-verify $gc07Run
if ($LASTEXITCODE -ne 0) { throw 'Manual evidence incomplete; inspect the new validation report.' }
```

Expected: `COMPLETE FOR REVIEW`, with a new immutable validation report. It binds
the original hosted report, exact current source/served assets, 21 human-attested
checks, distinct user/seat IDs, nonempty evidence files with hashes, and a matching
verified archive receipt. It cannot independently judge what a screen reader
said or certify that observations are true. Human review and acceptance remain
required. Failed validations are retained under unique filenames.

For unified sessions the generated instructions retain the original role mapping
and parent Green audience; they never require a regional selector or relabeling.

## Narrow regressions and remaining limits

```powershell
npm test -- tests/unit/gc07-live-transport.test.js tests/unit/gc07-evidence.test.js tests/unit/gc07-sql-contract.test.js tests/unit/gc06-live-check.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC07 evidence tooling or GC06 compatibility regression failed.' }
npm run verify:repo-artifacts
if ($LASTEXITCODE -ne 0) { throw 'Repository artifact verification failed.' }
```

Expected: all selected tests pass without skips; artifact verification passes.
The new tests exercise fixture/session bindings, cleanup preservation, actual
contention requirements, committed readback, rollback receipt completeness,
legacy routing and incomplete manual evidence. They perform no hosted SQL/Auth.

Retain whole evidence directories outside Git under the
[repository artifact policy](../repository-artifact-policy.md). New test results,
successful collector runs, original installation provenance (if recoverable),
candidate deployment, actual manual observations and human sign-off remain
required for their respective full manual/deployment acceptance claims. Consult
the current handoff before rerunning anything: the human's newer tooling and
normal hosted-backend results are already recorded there. Historical results
retain their original source and environment; they are not current-head release
evidence after later implementation changes.
