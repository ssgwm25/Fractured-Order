# GC-08 session administration and recovery

Implementation supplied, verification pending. No tests, npm commands, migrations,
deployments or hosted exercises were executed by the agent. The human owns prompt
status after fresh verification. GC-07's historical receipts remain historical;
they do not establish acceptance of this change.

## Setup contract

Game Master → Session Management → New Session defaults to **Unified Green**.
Choose **Regional Green** for Asia-Pacific Scribe, Europe Scribe and one Shared
Green Facilitator. Existing regional Notetakers remain unchanged. The selected
arrangement and roster version appear before submission. Session details and cards
display the server-confirmed model. There is still one game-state row: one global
move, phase and timer, with GC-05's five-subject regional orientation gate.

`list_approved_green_rosters()` requires the authenticated Game Master grant. It
reads the immutable existing registry; browser roles and supplied identifiers are
not authority. It excludes empty regional membership or source-reference arrays.
The form cannot register, amend or approve a roster. No available approval means
regional creation is blocked; Unified Green remains available. The GC-01 contract
fixture and empty synthetic foundation rosters are not exercise approval.

`create_configured_live_session(name, code, description, configuration, roster,
request_key)` rechecks Game Master authority, validates the selected roster,
inserts a session, composes GC-04A's
`configure_session_green_shared_facilitator` inside the same transaction, then
initializes game state and writes an immutable private receipt. No other
transaction can observe an intermediate unified session. Configuration precedes
seats and evidence. Failed setup rolls everything back. Retry keys are UUIDs
scoped to `auth.uid()` and serialized with a transaction advisory lock; changed
intent with the same key conflicts. A retry returns the current authoritative
session, including archived status, without reactivation.

The existing `create_live_demo_session(TEXT,TEXT,TEXT)` and
`database.createSession` signatures remain unified. Existing configure adapters
remain available for evidence-free legacy-created sessions. New UI-created
sessions retain their creation receipt as setup evidence; the existing
`green_session_has_evidence` guard therefore also prevents changing their model
or roster after creation. No historical NULL/v1 or paired model is rewritten.
The independent model is `shared_facilitator_v1`, topology remains 2 and the
existing capacity-one shared-seat index remains authoritative.

GC-05/06/07 operations are reused without broadening capabilities. Scribes hand
off their own proposals to the same shared Facilitator, which submits each
separately. White Cell reviews and returns retain owner/revision. RFI routing and
recipient-isolated proposal threads retain the persisted source owner. Regional
operator filters affect the view, never the authenticated seat or server scope.
Names are rendered from retained session-role snapshots when available.

## Operator recovery

1. Select configuration and an approved version using native keyboard controls.
   Loading, no approval and permission failures appear beside the roster control.
   Reload approved rosters after restoring access or connectivity.
2. Submit once. Double submission shares the pending operation. Do not distribute
   the code until server confirmation and session details are shown.
3. On an uncertain response, keep the tab and retry Create Session. Inputs remain
   locked to the saved intent. Reloading and reopening New Session restores it.
   The same UUID returns the original session; there is no unified fallback.
4. Name/code/setup validation errors that definitively rolled back unlock the
   form. A duplicate code requires checking the session list first. Permission
   failures retain intent: restore the same operator identity, then retry.
5. If the tab or storage is lost, inspect Session Management using the original
   code and its confirmed configuration. Do not generate another code to bypass
   uncertain creation. If the request cannot be resolved, retain the original
   code/time and have a database operator inspect its receipt; do not clear it.
   Unavailable or malformed recovery storage blocks submission before any RPC;
   restore storage only after resolving any earlier uncertain creation.
6. Seat contention: confirm the single shared seat in the roster. Remove only the
   intended seat through existing operator controls. Removal retains tombstones,
   names and delegation; a revoked identity cannot reclaim its old regional seat.
   Never add a regional Facilitator to a shared session to bypass contention.
7. After missed events, reconnect restores the authenticated seat and reconciles
   protected snapshots. Failure is not shown as synced. Removed/archived seats
   clear stores, stop subscriptions and require normal rejoin/permission recovery.
   Regional view switching does not change clocks or authority.

Diagnostics use four bounded reasons: `invalid_scope`, `scope_rejected`,
`seat_contention`, `reconciliation_missed`, at most one warning per reason per
minute per browser module. They include no proposal bodies, names, roster contents
or free-text errors. For scope rejection, restore the active seat and reopen the
record; for a stale review, reload its revision; for missed reconciliation, retry
connectivity and inspect the server authorization result. SQL errors preserve
their existing codes. Never weaken RLS or replay older helper definitions.

## Files and necessary dependencies

Runtime changes: `master.html`; `src/roles/gamemaster.js`, `whitecell.js`;
`src/components/ui/Badge.js`; `src/features/participants/ParticipantList.js` and
new `regionalView.js`; `src/services/database.js`, `supabaseMock.js`, `realtime.js`,
`sync.js`, new `sessionCreation.js` and `regionalDiagnostics.js`;
`src/stores/actions.js`, `requests.js`, `communications.js`, `timeline.js`,
`participants.js`, `gameState.js`;
and new `data/2026-09-29_gc08_session_administration.sql`.

The timeline, participant and game-state read guards are necessary dependencies
beyond the prompt's read list: an outstanding request must not repopulate cleared
state or restart presence after teardown. The two
new service modules isolate creation recovery and bounded diagnostics. The view
helper is shared presentation code, not a permission service. No framework, roster,
PLI scoring, historical artifact or prompt handbook was changed.

New tests: `src/services/sessionCreation.test.js` (coalescing, reload recovery,
definitive rollback, denied/uncertain responses, unavailable storage, compatibility);
`src/services/database.gc08-administration.test.js` (approved discovery, denied
RPC/table access, atomic failure, duplicate creates, exact snapshot, setup/join
ordering, lookup/three claims, separate handoffs/submissions, cross-Scribe denial,
freeze and archive); `src/features/participants/regionalView.test.js` (attribution
and view semantics); `src/services/regionalDiagnostics.test.js` (bounded safe logs);
`tests/sql/gc08-session-administration-editor.sql`; and
`tests/e2e/gc08-administration.e2e.js` with `playwright.gc08.config.js`.

Extended regression files: `src/roles/gamemaster.test.js`,
`src/services/database.green-storage.test.js`, `src/services/database.gc05-orientations.test.js`, `src/services/realtime.test.js`,
`src/services/sync.test.js`, `src/stores/workflowReconciliation.test.js`,
`src/stores/gameState.test.js`, `src/stores/participants.test.js` and
`src/features/participants/ParticipantList.test.js`.

## Exact human-run verification

The first human-reported focused run returned 172 passing and five failing tests.
All five failures were in the administration fixture: it omitted persisted
`sessions` and `game_state` arrays, while denied mock mutations correctly left
storage untouched. The fixture now seeds those arrays and the receipt table;
denial cases also assert that persisted storage remains byte-for-byte unchanged.
The human-reported rerun at 12:41:18 passed all nine tests in this file
(Vitest 1.6.1, duration 787 ms), using:

```powershell
npm test -- src/services/database.gc08-administration.test.js
```

The subsequent human-reported full focused run at 12:42:12 passed all 16 files
and 177 tests (Vitest 1.6.1, duration 10.70 s), with no skipped tests shown.
Its stderr includes a PLI badge fetch warning (`fetch is not defined`), as well
as logs from timeout, stale-review and completed-RFI cases. The warning did not
fail the suite and is not evidence of deployed PLI functionality or a missing
database migration. No PLI behavior was changed in response.

The human-reported GC-04A through GC-07 compatibility run at 12:43:37 passed all
14 files and 372 tests (Vitest 1.6.1, duration 10.43 s), with no skipped tests
shown. Its deck warnings/errors appear under the fallback and unavailable-deck
test cases, which passed. The pasted command includes the exit-code failure
guard and shows no guard failure.

The supplied outputs do not include a source SHA or a separate numeric exit-code
capture. After the instruction to apply the GC-08 migration in rehearsal, the
human reported `Success. No rows returned`. This records reported migration
completion, not a SQL regression result or independent project/ledger verification.
The human then supplied `gc08_result` with `result=PASS`, `assertions=24`, and
24 named checks from the rollback-only GC-08 SQL suite. Those checks include
authorized roster discovery, approval/snapshot binding, rejection without a
session, retry identity, model/seat boundaries, one clock, frozen setup and
archive preservation. The supplied result does not independently prove hosted
Auth issuance, two-connection races, or the actual exercise roster approval.
The subsequent human-supplied GC-04A compatibility result contains four PASS
rows: boundary 22, Asia-Pacific Scribe 9, Europe Scribe 9 and Shared Facilitator
9 (49 assertions total). This is the reported rerun after GC-08 migration, not
reuse of the earlier GC-04A evidence. The subsequent GC-04 four-seat context
result also reports four PASS rows, nine assertions each (36 total), covering
both regional Scribes and both regional Facilitators. The subsequent complete
human-supplied GC-05 table contains 102 assertion rows, all PASS, including paired
and shared orientation workflows, return/revision handling, completion gates,
Scribe isolation, revoked/stale seat denial and unified completion. The subsequent
complete human-supplied GC-06 table contains 169 assertion rows, all PASS,
including owner/recipient isolation, forged thread-field denial, review and
revision boundaries, retry handling and preservation of unified identities.
The subsequent human-supplied GC-07 JSON reports PASS with 104 assertions and
104 distinct named checks, covering scoped RFI/message routing, isolation,
return/revision handling, stale/revoked authority denial, unified identity and
retained GC-05/06 guards. Next run the local browser checks at both base paths
below. Hosted Auth, concurrency and exercise approval evidence remain separate;
GC-08 acceptance remains pending.

The first human-run browser attempt built the root-base bundle successfully
(8.29 s) but both GC-08 cases stopped before operator authorization: the local
config assigned `PLAYWRIGHT_BASE_URL`, which the shared harness intentionally
treats as hosted mode. The loop stopped there; neither the compatibility browser
suite nor the project-base iteration ran. Build output also reported mixed
static/dynamic imports and a chunk-size warning; those are not browser results.

The correction removes that hosted flag from `playwright.gc08.config.js` and
rejects an explicitly configured hosted target for this mock-only runner. The
necessary shared-helper dependency, `tests/e2e/support/rehearsalRuntime.js`, now
uses the existing `VITE_PUBLIC_BASE_PATH` for local navigation while preserving
explicit hosted URL precedence and operator-code requirements. No hosted code
is needed for these mock tests. Four new cases in
`tests/unit/gc08-browser-config.test.js` cover both local bases and explicit
remote/loopback hosted targets. The human-reported run at 13:00:33 passed both
files and all 16 tests (12 runtime helpers, four configuration cases; Vitest
1.6.1, duration 1.54 s), with no skipped tests shown, using:

```powershell
npm test -- tests/unit/gc08-browser-config.test.js tests/e2e/support/rehearsalRuntime.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC08 browser configuration regressions failed.' }
```

The next human-run root-base build succeeded (9.18 s). The no-approval/unified
browser case passed; the regional case reached all three joins but timed out
waiting for `.follow-along` on the Shared Facilitator. Its runtime deliberately
defers that guide to GC-09. The GC-08 browser test now retains the guide check for
both Scribes and checks the Shared Facilitator's ready deck, enabled two-region
selector and absence of the deferred guide. This changes only the regression
test; it does not add GC-09 UI or skip any creation/handoff/RFI assertions.

The subsequent root-base rerun again passed the no-approval/unified case, and
the regional case passed shared-workspace readiness but timed out opening its
proposal form. Inspection found the normal Strategic Orientation gate: the test
had not supplied the five prerequisite submissions. The E2E correction now first
asserts that a proposal is blocked, then records and submits both regional Green
orientations plus the existing Blue, Red and Industry orientations through normal
Scribe/Facilitator UI. Six supporting seats join the same UI-created session for
those existing teams; the represented roster is not expanded. Inputs are clearly
synthetic test data. The test reads back all five submitted owners before creating
the proposals. It does not seed completion, bypass the gate or change the clock.
Only the E2E test and these notes changed for that correction. Its subsequent
human-run root check returned one pass and one failure (55.9 s): the first
regional orientation saved, but its follow-up timeline insert was denied. The
UI reported that the update was saved but the activity record failed; the helper
then timed out waiting for the forwarding success notification. This is not a
passing browser gate.

The necessary dependency correction is in `src/services/supabaseMock.js`:
regional timeline inserts now resolve and validate persisted source ownership
before evaluating the authenticated active seat, matching the existing
`capture_green_timeline_scope` BEFORE trigger and subsequent authorization/RLS.
Previously the mock checked the unnormalized browser payload, which has no
`owner_team` or `delegation_id`, and rejected a legitimate Scribe's own record.
Supplied conflicting scope, missing/cross-session evidence and invalid thread or
review links are rejected before any row or counter is persisted. Seat checks
still reject another region, the shared Facilitator's direct write and revoked
authors. Production SQL, RPCs and controller behavior are unchanged.

Five added cases in `src/services/database.gc05-orientations.test.js` cover
derived scope for shared and paired sessions, isolated reads, non-Green ownership,
atomic rejection of malformed batches and active-seat denials. The human-reported
rerun at 13:18:44 passed all five listed files and 63 tests (920 ms). The root build
then succeeded in 8.12 s, with mixed-import and chunk-size warnings. The browser
run returned one pass and one failure (58.0 s): orientation authoring and submission
now succeeded, but the helper expected the legacy `.scribe-presentation-toolbar-status`
element, which the regional orientation toolbar does not render. The supplied
screenshot shows the Asia-Pacific record's Submitted to White Cell badge.

The next necessary test dependency correction is in
`tests/e2e/support/liveDemoHarness.js`: the orientation submission helper checks
the visible lifecycle badge on the same action ID, preserving its sidebar status
and submission-panel removal assertions. This works with the existing regional
and legacy markup. `tests/e2e/gc08-administration.e2e.js` additionally reads back
each submitted regional orientation by that exact ID and verifies session, owner,
revision, handoff revision and shared-Facilitator submitter. No application code
or SQL changed for that correction. The next human-run root check advanced through
all five orientation submissions, then returned one pass and one failure (3.3 min).
The proposal helper timed out after capturing the successful regional notification
`Proposal handed to the Facilitator.` because it expected the legacy wording
`Proposal forwarded to Facilitator`.

The proposal helper now accepts those two explicit handoff messages through
`tests/e2e/support/workflowToastCapture.js` and `liveDemoHarness.js`. Existing
single-message callers retain their behavior. Four added cases in
`tests/e2e/support/workflowToastCapture.test.js` cover both messages, reject a
draft-save notification, preserve error reporting and ignore empty expectations.
The GC-08 browser test additionally reads both proposal records back before shared
submission, requiring the correct owner, title, draft status, forwarded workflow
and matching revision-one handoff. This is a test dependency correction; no UI,
authorization policy, timeout or database behavior changed. The human-reported
rerun at 13:29:33 passed all eight notification tests (731 ms), followed by both
root-path GC-08 browser cases (1.6 min). The local root `results.json` records
two expected results, zero unexpected, zero skipped and zero flaky results for
the run starting `2026-09-21T17:29:35.393Z`. This establishes the local root
workflow result, not hosted acceptance or overall GC-08 closure.

The following commands reproduce that successful narrow/root check:

```powershell
npm test -- tests/e2e/support/workflowToastCapture.test.js
if ($LASTEXITCODE -ne 0) { throw 'Workflow notification regressions failed.' }
$gc08PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    $env:VITE_PUBLIC_BASE_PATH = '/'
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc08.config.js
    if ($LASTEXITCODE -ne 0) { throw 'GC08 browser checks failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc08PreviousBase
}
```

Expected: eight notification unit tests and both GC-08 browser cases pass with no
skips. The root build was reused because these changes only affected the test
runner. Subsequent project-base and compatibility results are recorded below;
hosted evidence requirements remain outstanding.

The following sequence was then human-run: six GC-05/06/07 compatibility browser
cases on the existing root build, followed by a project-path build and both
browser suites. Reproduction commands, with `PLAYWRIGHT_BASE_URL` unset:

```powershell
$gc08PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    $env:VITE_PUBLIC_BASE_PATH = '/'
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc07.config.js
    if ($LASTEXITCODE -ne 0) { throw 'Root compatibility browser checks failed.' }

    $env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Project-path build failed.' }
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc08.config.js
    if ($LASTEXITCODE -ne 0) { throw 'Project-path GC08 browser checks failed.' }
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc07.config.js
    if ($LASTEXITCODE -ne 0) { throw 'Project-path compatibility browser checks failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc08PreviousBase
}
```

Expected: six passing root compatibility cases, a successful project-path build,
two passing project-path GC-08 cases and six passing project-path compatibility
cases, without skips. Keep each report in its existing base-specific output
directory. This command leaves `dist` built for `/Fractured-Order/`; restoring the
environment variable does not rebuild it.

The supplied output reports six root compatibility passes (38.8 s), a successful
project-path build (12.01 s), two project-path GC-08 passes (1.7 min), and six
project-path compatibility passes (37.6 s). The build still reports mixed-import
and chunk-size warnings. Read-only inspection of all four JSON reports confirms:

| Report | Start (UTC, 2026-09-21) | Passed | Unexpected / skipped / flaky |
| --- | --- | --- | --- |
| `test-results/gc08-browser/root/results.json` | 17:29:35.393 | 2 | 0 / 0 / 0 |
| `test-results/gc07-browser/root/results.json` | 17:32:45.001 | 6 | 0 / 0 / 0 |
| `test-results/gc08-browser/project-base/results.json` | 17:33:41.311 | 2 | 0 / 0 / 0 |
| `test-results/gc07-browser/project-base/results.json` | 17:35:27.033 | 6 | 0 / 0 / 0 |

These 16 local browser cases passed on the tested implementation. No source code
or tests changed while recording these receipts. This does not establish hosted
GC-08 acceptance, deployed source/build identity, exercise roster approval or
independent-connection creation/recovery behavior. The next task is a current-source,
target-bound hosted GC-08 rehearsal: identify the candidate build and rehearsal
project, confirm the installed administration migration and approved roster, then
create through the real Game Master UI and retain the three-role workflow and
recovery evidence listed below. The existing GC-07 prepare/build/seal and hosted
workflow in [the GC-07 evidence runbook](gc07-evidence-follow-up.md) is supporting
verification only; it does not test GC-08 creation/retry RPCs or substitute for
the GC-08 setup/join contention checks. Do not reuse its historical receipts as
current-source GC-08 evidence or rerun migrations merely to obtain a receipt.

The following commands reproduce the preceding unit/build checks. Rebuilding was
required for the mock change because the browser configuration serves `dist`.
For the current test-only correction, the existing root build from that successful
run can be reused: run just the root Playwright command inside the same environment
save/restore block below, omitting the unit and build commands.

For this correction, run from the repository root with `PLAYWRIGHT_BASE_URL` unset:

```powershell
npm test -- src/services/database.gc05-orientations.test.js src/services/database.regional-security.test.js src/services/database.gc07-messaging.test.js src/services/supabaseMock.test.js src/services/database.gc08-administration.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC08 timeline dependency regressions failed.' }
$gc08PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    $env:VITE_PUBLIC_BASE_PATH = '/'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'GC08 root build failed.' }
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc08.config.js
    if ($LASTEXITCODE -ne 0) { throw 'GC08 browser checks failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc08PreviousBase
}
```

Expected: all five listed unit files pass without skips, build succeeds, and both
GC-08 browser cases pass. The subsequent compatibility and project-base browser
results are recorded above. No additional migration was needed for the mock-only
correction.

Run the browser loop below with
`PLAYWRIGHT_BASE_URL` unset. Do not supply a hosted operator code to work around
the earlier local-run error.

The first GC-04 rerun attempt reported SQLSTATE `42601` at
`\set ON_ERROR_STOP on`. That line belongs to the psql wrapper
`tests/sql/gc04-session-context.sql`; Supabase SQL Editor requires the full
`tests/sql/gc04-session-context-editor.sql` instead. Replace the entire query
with that file, whose first line is `-- Paste this ENTIRE file into Supabase SQL
Editor and run as postgres.` Do not merely remove the wrapper's backslash lines:
the wrapper contains no assertions. The corrected Editor run produced the
36-assertion passing result recorded above.

From the repository root in PowerShell:

```powershell
npm test -- src/services/sessionCreation.test.js src/services/database.gc08-administration.test.js src/services/database.green-storage.test.js src/services/regionalDiagnostics.test.js src/roles/gamemaster.test.js src/roles/whitecell.test.js src/components/ui/Badge.test.js src/features/participants/ParticipantList.test.js src/features/participants/regionalView.test.js src/services/realtime.test.js src/services/sync.test.js src/stores/workflowReconciliation.test.js src/stores/requests.test.js src/stores/communications.test.js src/stores/gameState.test.js src/stores/participants.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC08 focused regressions failed.' }
npm test -- src/services/database.gc05-orientations.test.js src/services/database.gc06-proposals.test.js src/services/database.gc07-messaging.test.js src/services/database.shared-green.test.js src/services/database.regional-security.test.js src/services/database.privileged.test.js src/services/database.join.test.js src/services/supabaseMock.test.js src/roles/landing.join.test.js src/roles/scribe.test.js src/roles/facilitator.test.js src/services/seatBootstrap.test.js src/stores/participants.gc04-context.test.js tests/unit/green-regional-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC04A through GC07 compatibility failed.' }
```

Expected: every listed test passes with no skipped GC-08 assertions. These are
local contracts, not deployed database or real concurrent-connection evidence.

In the rehearsal project, first verify the migration ledger through September 28.
Copy and run the entire September 29 migration **once**, then the complete SQL
suite as postgres with RLS enabled:

```powershell
Get-Content -Raw -Encoding UTF8 'data/2026-09-29_gc08_session_administration.sql' | Set-Clipboard
# Paste into Supabase SQL Editor and run the entire file; retain the receipt.
Get-Content -Raw -Encoding UTF8 'tests/sql/gc08-session-administration-editor.sql' | Set-Clipboard
# Paste into a new SQL Editor query and run the entire file.
```

Expected: migration commits without error; suite returns `gc08_result.result=PASS`
with nonzero assertions and named checks, followed by rollback. Any error or absent
report fails. The suite creates its own synthetic approval and uses simulated JWT
claims; it does not establish hosted authentication or concurrency. Retest the
unchanged GC-04, GC-04A, GC-05, GC-06 and GC-07 SQL Editor suites on the installed
schema, retaining every report and rollback receipt.

Local browser checks require existing Chromium and free port 4174:

```powershell
$gc08PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    foreach ($gc08Base in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc08Base
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed for $gc08Base" }
        node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc08.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC08 browser checks failed for $gc08Base" }
        node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc07.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC05 through GC07 browser checks failed for $gc08Base" }
    }
} finally { $env:VITE_PUBLIC_BASE_PATH = $gc08PreviousBase }
```

Expected: two GC-08 cases pass at each base plus the existing GC-05/06/07 browser
cases, with no skips. GC-08 creates through the normal form, looks up the created
code, joins all three roles, creates both proposals through Scribe forms and submits
both through the shared workspace to White Cell, then routes separate regional
RFIs into the White Cell queue and checks its view filter. Only the approval registry is
seeded; it is clearly synthetic. Reports are written under
`test-results/gc08-browser/{root,project-base}/results.json`. Both passing reports
are recorded above alongside the compatibility reports.

## Evidence still required and activation blockers

- Actual exercise approval registry entry with human provenance. Nothing here
  registers it or establishes that it exists in the target project.
- Fresh unit/build/SQL/browser receipts bound to the exact source and migration
  definitions/ACLs. Keyboard, screen-reader, 200% zoom and mobile observations.
- Fresh hosted Auth/RLS checks for all three models, startup, reconnect, seat
  revocation and archive closure, including recipient-isolated threads, separate
  RFIs, concurrent regional submissions and stale White Cell reviews. Reuse the
  GC-07 normal hosted workflow in its runbook; it does not replace GC-08 creation
  verification.
- Real two-connection creation/retry and setup/join contention evidence: identical
  operator/key requests must commit exactly one session/clock/receipt; different
  intent with that key must conflict; before commit, code lookup must never expose
  the temporary row. For existing evidence-free setup versus join, retain both
  orderings: setup wins and the unified claim fails, or claim wins and setup fails.
  Capture independent backend PIDs, observed blocking and committed readback.
  The new mock ordering test and single-transaction SQL suite do **not** prove this.
- A newly UI-created hosted session must complete the same three joins, both
  Scribe handoffs, shared submissions, White Cell returns and separate RFIs. Retain
  snapshot equality, cross-Scribe read/write denials and recovery receipts. Local
  browser fixtures alone do not establish hosted acceptance.

Do not mark GC-08 passed until the required fresh evidence is reviewed. Do not
rename historical evidence or change the prompt handbook as implementation output.
