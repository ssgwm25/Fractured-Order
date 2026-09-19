# GC-05 regional Strategic Orientation

Implementation and human-run automated verification are supplied below. The human
accepted GC05 with this scope:

> Accept GC05 for the tested local frontend and hosted Supabase scope, retaining
> the documented evidence limitations. Deployment verification and operational
> roster/creation approval remain separate.

The prompt status table remains untouched. No tests, builds, migrations or
deployments were executed by the agent. The requested evidence follow-up now has
[separate collectors and exact human-run commands](gc05-evidence-follow-up.md)
for fresh SQL metadata/rollback proof, a new root-browser JSON and deployed
route/asset verification. Fresh SQL and root-browser results are now recorded;
deployed verification remains pending.

## Runtime contract

Each regional Green Scribe forecasts Blue, selects its own existing catalogue
orientation and supplies the required strategy narrative. The v2 envelope,
catalogue IDs/labels/tags, compatibility artifact types, legacy role inversion
and Red's separate regional forecasts are retained. This does not adopt the
briefing deck's align/hedge/defect vocabulary or change PLI scoring.

The Scribe's form calls `handoff_regional_orientation` with a session, delegation,
persisted artifact ID, expected revision and expected row version. New artifacts
have no ID or expected versions. The server derives the active Scribe seat,
checks the staffing model and ownership, validates the Green envelope, and writes
only the orientation fields. The new nullable `orientation_handoff_revision`
records which revision the Scribe forwarded. Historical rows are not backfilled.

The shared Facilitator calls `submit_regional_orientation` independently for
each persisted orientation. The RPC accepts no actor role, artifact type or
content fields. It locks and validates the stored session, delegation, type,
state, revision, row version and handoff. Only submission bookkeeping may change.
Paired regional Facilitators use the same RPC for their own region. An already
forwarded, revision-one paired artifact without a marker can still be submitted;
this compatibility exception does not apply to shared seats or returned revisions.
Unified sessions keep their existing workflow.

White Cell uses the existing `operator_review_artifact` RPC. Return preserves
the originating delegation, increments revision and clears the handoff marker.
The originating Scribe sees the returned record and review, corrects it, and
forwards the new revision. The Facilitator can then resubmit. A stale form must
refresh before retrying; the client does not silently retry with newer versions.
White Cell review titles identify the persisted region. Shared controls show
review notes and the waiting-for-Scribe state, with no generic content editing.

Shared reads extend only to returned/resubmitted orientations and their linked
review/revision records. Reviews must match the orientation's session, owner,
type and revision history. Unrelated unforwarded drafts, returned proposals,
private notes and recipient threads remain inaccessible. Generic shared action
writes, proposal submissions/replies, RFI creation and direct messages remain
denied. Workspace guidance continues to name those deferred capabilities.
Existing server action/research audit triggers record regional submissions
atomically; shared browser timeline writes are not enabled.

## Completion and mutation boundary

Qualifying status remains `submitted` or `adjudicated`; White Cell approval is
not a new requirement. Deleted records and other sessions do not qualify.
Ownership comes from the persisted row, never its narrative envelope.

| Session topology | Required submission subjects |
| --- | --- |
| Unified, including historical NULL | Blue, Green, Red, Industry |
| Regional paired or shared | Blue, Green Asia-Pacific, Green Europe, Red, Industry |

Duplicate Asia-Pacific artifacts cannot fill Europe's requirement. The shared
seat count does not change the number of required submissions. The authenticated
`get_orientation_completion` RPC returns subject keys and completion only, so a
Scribe need not read another delegation's private artifacts to know the gate.
Missing regional subjects are `green:asian_pacific` and `green:europe`.

`gc05_game_state_gate` checks every INSERT or move/phase/session-changing UPDATE
on `game_state`, including direct SQL and definer RPCs. Initialization/reset to
1/1 and timer-only changes remain possible. Every other move/phase change requires
current completion, including after a White Cell return. Session-row locks
serialize gate checks with artifact writes. The store also checks fresh server
completion before mutations and displays the server's missing-subject error.
The trigger is authoritative if the UI is stale or bypassed.

The migration patches the latest GC-04A ownership, authority and read helpers
in place, aborting on unexpected definition drift. It retains the September
20/21 repairs, existing ACLs and unrelated branches. Its restrictive policy
forces regional Green orientation browser writes through the version-bound
RPCs. GC-06/07 replacements of shared helpers must preserve these positive
orientation paths, scoped review reads, the five-submission gate and still-closed
capabilities. Do not reinstall an earlier blanket-denial function over GC-05.

## Scope and prerequisites

Required additions outside the initially cited runtime files are the additive
migration, focused test/config files, this runbook, migration ledger/containment
guidance and the versioned contract documentation. These are dependencies of
GC-05 verification and installation; no proposal, RFI or creation UI is added.
Contract version 1.2.0 records the orientation permission stage and retains the
historical foundation permission profile.

The previously inspected foundation report
`test-results/gc04-live/1006e48d-9617-4c27-a119-8b8f97fb9857/results.json`
reports `stage: GC-04A-foundation`, `passed`, `automatedPassed`, `cleanupPassed`
and `race.passed` as true. It records source revision
`8b29a62609c653b09cf35f807d299d8f3a26c794` and completion time
`2026-09-19T02:13:30.285Z`. This is prior-stage evidence only: its source hashes
and deployed prerequisite state have not been revalidated for GC-05. Preserve
that report with its original labels. The file was not present at this path on
the subsequent verification follow-up; its previously recorded summary cannot
substitute for fresh accessible evidence. Fresh GC-04A prerequisite validation and
GC-05 results are required before acceptance; do not rename old evidence.

Fresh foundation follow-up is now supplied: run
`ae278290-b531-440e-9b90-7626e79de255` against project `gsromgrxgrwwfywaoyme`,
with local frontend `http://127.0.0.1:4174/Fractured-Order/`. Its saved
`test-results/gc04-live/ae278290-b531-440e-9b90-7626e79de255/results.json` reports
all 16 browser checkpoints, `automatedPassed`, `cleanupPassed`, `race.passed`
and `passed` true, no browser errors, and completion at
`2026-09-19T03:53:08.200Z`. The shared-seat race records distinct matching PIDs
1101355/1101356, a 1099.316 ms wait and an independently verified committed winner.
Both synthetic sessions were archived. Source revision remains
`8b29a62609c653b09cf35f807d299d8f3a26c794`, with working-tree/source hashes and
fetched local asset hashes in the report. This verifies the foundation against
the real backend and that local build; it does not verify deployed routing or the
GC-05 orientation return/progression race. Manual screen-reader checks remain
excluded, not passed. The original foundation stage label is retained.

The SQL fixture creates synthetic shared, four-seat and unified sessions inside
one rolled-back transaction. Its temporary empty-roster records exist solely to
exercise the activation contract and are not roster approval or participant
decisions. They establish no operational creation path. GC-08 creation UI and
GC-06 proposal permissions are not GC-05 acceptance prerequisites. Exercise-owner
roster approval remains unresolved for operational use.

## Human-run verification

The first human-run focused suite reported 315 passing tests and one failure
across nine files. The revoked White Cell seat test exposed a misplaced mock
guard: it had been added to `operatorAdjudicateAction`, where `kind` was undefined,
instead of `operatorReviewArtifact`. The correction moves the check into the
orientation review path before mutation. Expanded regressions cover revoked,
expired and inactive seats for both return and completion, unchanged action and
review records after denial, and the legacy adjudication handler. This correction
changes only `src/services/supabaseMock.js`,
`src/services/database.gc05-orientations.test.js` and this document. No migration
change is needed for this mock repair.

The human supplied the subsequent Vitest 1.6.1 rerun: both affected files passed,
with 12 GC-05 orientation tests and 3 shared-Green foundation tests (15 total,
none reported skipped). The supplied output records start time `23:11:19` and
duration `840ms`; no calendar date, source hash or hosted database result was
supplied with it. This verifies the focused mock correction for that local run.
That focused rerun alone was not combined-suite or SQL/RLS/browser evidence;
subsequent results are recorded below.

The human subsequently ran the combined ten-file regression command, including
`tests/unit/gc05-sql-runner.test.js`: **322 tests passed across 10 files**, none
reported skipped, using Vitest 1.6.1. The supplied output records start time
`23:37:05` and duration `15.98s`; emitted log timestamps are on `2026-09-19` UTC.
This includes all three SQL harness structure checks and the corrected mock
review guard. Preserve the earlier failed result as history. The transcript also
contains deck fallback/timeout and stale-review diagnostics, plus a White Cell
PLI badge warning (`fetch is not defined`); these did not fail the reported suite
and do not establish a missing deployed migration. No source hash accompanied
this result. The combined regressions are no longer awaiting a passing run.

The human subsequently supplied a Supabase SQL Editor screenshot showing the
GC-05 migration's final grants, schema reload notification and `COMMIT`, with
`Success. No rows returned`. Record this as user-supplied successful migration
execution evidence; the screenshot does not expose the project identifier,
execution timestamp or complete script hash. Do not reapply the migration.
The subsequent RPC/RLS rehearsal and local browser results for both base paths
are recorded below; hosted browser evidence remains pending.

The first reported SQL-suite attempt failed with PostgreSQL `42P01`,
`relation "gc05_sessions" does not exist`. The human confirmed that the entire
file ran in one execution and that the editor supplied no additional context.
No SQL/RLS gate passed in that attempt; the message alone does not establish
the cause or the rollback outcome.

The rehearsal now creates and consumes its temporary fixtures inside a single
server-side `DO` block, with explicit `pg_temp` references. This removes fixture
relations from the surrounding batch's statements. The result query reads a
transaction-local JSON report; the final `ROLLBACK` clears both fixtures and
report. Unexpected errors preserve SQLSTATE and include the stage and stacked
SQL context directly in the error message. A missing report returns `FAIL`.
The authenticated role switches, RPC/RLS assertions and installed migration
remain unchanged. This is a harness/diagnostic correction, not a verified
diagnosis of an editor defect. See PostgreSQL's [DO documentation](https://www.postgresql.org/docs/current/sql-do.html)
for the server-side block execution model.

The human subsequently supplied the complete GC05 result table: **102 assertions,
all PASS**. This is fresh user-supplied real RPC/RLS rehearsal evidence for the
shared and paired regional handoff/submission/return/correction cycles, exact
missing-delegation gates, direct mutation denials, scoped review/revision reads,
unrelated-write denials, stale/revoked seats and unified four-team completion.
Retain the earlier failed attempt as history. The supplied table does not include
the database target, execution timestamp, source hashes or a separate rollback
confirmation. The suite uses synthetic JWT claims; this result does not establish
hosted Auth-token, browser or concurrency evidence, or close the overall GC-05 gate.

To reproduce the SQL result, copy `tests/sql/gc05-regional-orientations-editor.sql` into a new
SQL Editor query, choose the default `postgres` role, retain RLS, set the result
limit to **No limit**, and execute the entire file once. Expected: a result table
with every assertion marked `PASS`, followed by rollback. If it fails, retain
the full `GC05 stage=... SQLSTATE=...` message. Do not reapply the migration.
The agent has not executed the harness or tests. To reproduce the three structure
regressions included in the passing combined run:

```powershell
npm test -- tests/unit/gc05-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 SQL harness structure checks failed.' }
```

Expected: all three structure tests pass without skips. They check fixture
containment, diagnostic reporting and fail-closed report rendering; they do
not replace the real SQL rehearsal.

To reproduce the affected mock-suite rerun:

```powershell
npm test -- src/services/database.gc05-orientations.test.js src/services/database.shared-green.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 mock review correction failed.' }
```

Expected: both files pass without skips; denied reviews preserve action/review
state, active-seat return/resubmission remains successful, and legacy adjudication
does not throw. Retain the earlier failed result as historical evidence.

Run from the repository root. The following commands are instructions, not
recorded results. Use a provisioned rehearsal database with the verified ledger
through September 24 and its later repairs. If unavailable, record that blocker;
do not silently target another project or reconstruct a base schema.

```powershell
npm test -- src/services/database.gc05-orientations.test.js src/services/database.action-write.test.js src/services/database.shared-green.test.js src/features/actions/strategicOrientationDetails.test.js src/stores/gameState.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/whitecell.test.js tests/unit/green-regional-contract.test.js tests/unit/gc05-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 focused regressions failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed.' }
```

Expected: all selected tests pass, none skipped. The new mock/RPC tests cover
two independent Scribe handoffs in shared and paired models, duplicate attempts,
missing Europe, return/correction/resubmission, persisted ownership, legacy
completion/forwarded handoffs, scope/type/version denials and expired/revoked
seats. Controller tests cover shared controls, waiting state, region labels,
deferred notices and the store's fresh gate on mutation paths. Existing catalogue,
Red forecast, foundation isolation and unified controller tests must still pass.
Mock results alone are not authorization evidence.

Apply the additive migration **once**, only when absent from the verified
migration record, then run the SQL suite. Supply the rehearsal connection through
the shell environment; do not put credentials in source or evidence output.

```powershell
if (-not $env:GC05_DATABASE_URL) { throw 'Set GC05_DATABASE_URL to the verified rehearsal database.' }
psql -X -v ON_ERROR_STOP=1 --dbname "$env:GC05_DATABASE_URL" --file data/2026-09-25_gc05_regional_orientations.sql
if ($LASTEXITCODE -ne 0) { throw 'GC05 migration failed; retain output and inspect definition drift.' }
psql -X -v ON_ERROR_STOP=1 --dbname "$env:GC05_DATABASE_URL" --file tests/sql/gc05-regional-orientations-editor.sql
if ($LASTEXITCODE -ne 0) { throw 'GC05 real RPC/RLS rehearsal failed.' }
```

Alternatively paste each entire file into the verified project's Supabase SQL
Editor, migration first and test second. Never run selected fragments. Expected:
migration commits without drift errors; suite emits its assertion table with
every label `PASS`, no exception, then `ROLLBACK`. Retain full output, database
target, UTC time and source hashes. The suite switches to `authenticated` and
simulates JWT claims against real RPCs/RLS. It covers both regional owners through
shared and paired cycles; direct phase/move jumps; unified completion; invalid
session, region, revision, row version and type; private draft/RFI reads;
proposal/RFI/thread/direct-message writes; and stale/revoked shared and Scribe
seats. Simulated claims do not establish hosted Auth-token or browser evidence.

For local browser controls, build and run both supported base paths:

```powershell
$gc05PriorBase = $env:VITE_PUBLIC_BASE_PATH
try {
    foreach ($gc05Base in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc05Base
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "GC05 build failed for $gc05Base" }
        node --preserve-symlinks --preserve-symlinks-main ./node_modules/@playwright/test/cli.js test --config playwright.gc05.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC05 browser checks failed for $gc05Base" }
        $gc05BaseLabel = if ($gc05Base -eq '/') { 'root' } else { 'project' }
        Copy-Item -LiteralPath test-results/gc05-browser/results.json -Destination "test-results/gc05-browser/results-$gc05BaseLabel.json"
    }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc05PriorBase
}
```

Expected: two tests pass per base, without skips. Both regional buttons submit
independently with keyboard activation; returned notes and waiting controls
render; a corrected handoff enables resubmission; deferred proposal/RFI/message
guidance stays visible. These browser fixtures seed the separately tested Scribe
handoff and review state: they do not claim an end-to-end hosted three-seat cycle.
The human supplied the root-path (`/`) browser result: **2 passed in 16.5s**.
The previously inspected `test-results/gc05-browser/results-root.json` recorded start time
`2026-09-19T03:33:25.866Z`, two expected results, zero skipped, unexpected or
flaky results, and no runner errors. Both independent submissions/deferred notices
and returned-note/waiting/corrected-resubmission controls passed in that local
synthetic run. Earlier attempts stopped before tests because port 4174 was
occupied; the human stopped the identified static test server before this rerun.
The root build had succeeded in the earlier supplied output. That JSON file was
absent at the latest evidence review; the supplied transcript and this historical
summary remain, but no replacement report has been generated.

The human subsequently supplied a successful project-path (`/Fractured-Order/`)
build (7.98s) and browser result: **2 passed in 15.2s**. The retained
`test-results/gc05-browser/results-project.json` records start time
`2026-09-19T03:35:36.300Z`, two expected results, zero skipped, unexpected or flaky
results, and no runner errors. Both supported base paths now have supplied local
browser pass evidence. These synthetic runs do not establish hosted
authentication, concurrency or source-hash provenance.

Evidence preservation required one additional configuration correction:
`playwright.gc05.config.js` now sets `outputDir` to
`test-results/gc05-browser/artifacts`. The installed Playwright defaults to
`test-results` and removes its output directory before a run. Leaving that
default could erase saved foundation/hosted reports and the other base-path
report. The new location keeps those retained reports outside GC05 browser
cleanup. This explains a deletion risk, not a verified history of the missing
root report. Other runners' cleanup settings are outside this correction.

The narrow regression in `tests/unit/gc05-browser-config.test.js` imports only
the configuration and checks that disposable output cannot contain retained
reports. The human supplied a successful Vitest 1.6.1 run: **1 test passed**,
none reported skipped, start `00:32:00`, duration `1.21s` (test duration `570ms`).
The transcript supplies no calendar date or source hash. This verifies the
configuration containment check; it does not recover the missing historical
root-browser JSON. No additional behavior check is pending for this correction.
To reproduce:

```powershell
npm test -- tests/unit/gc05-browser-config.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 browser evidence containment check failed.' }
```

Expected: one test passes without skips; no browser, server or SQL is started.
This configuration/test change does not alter any of the 20 source files hashed
by the successful hosted report below and does not require repeating that
hosted rehearsal or reapplying the migration.

### Next prerequisite rehearsal without manual session setup

The human confirmed there is no existing synthetic session. That is expected
after the rollback-only SQL suite. The local runner configuration supplies project
reference `gsromgrxgrwwfywaoyme`; this identifies the configured target, not proof
of which SQL Editor project was used for the earlier 102-PASS result.

The existing GC-04A runner can revalidate the foundation against the current
local frontend and real Supabase. It creates and archives its own synthetic
sessions and identities, reads the project/public key from existing configuration,
and requests a Supabase personal access token through its hidden terminal prompt.
Do not paste that token into chat. It does not build, migrate or deploy. Its
proposal/RFI denial probes remain applicable after the GC-05 orientation exception.

The last supplied build used `/Fractured-Order/`. With that unchanged build,
start the static server in terminal 1 and leave it running:

```powershell
$env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174
```

In a second terminal at the repository root:

```powershell
$gc05PreviousFoundationUrl = $env:GC04A_BASE_URL
try {
    $env:GC04A_BASE_URL = 'http://127.0.0.1:4174/Fractured-Order/'
    node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --shared --local
    if ($LASTEXITCODE -ne 0) { throw 'GC04A foundation rehearsal failed; retain its report and cleanup instructions.' }
} finally {
    $env:GC04A_BASE_URL = $gc05PreviousFoundationUrl
}
```

Expected: 16 browser checkpoints, observed two-connection shared-seat contention,
and both synthetic sessions archived. Retain the printed `results.json` and
cleanup command if interrupted; stop terminal 1's server with Ctrl+C afterward.
This is fresh foundation evidence if successful, not the GC-05 hosted orientation
cycle or orientation-return/progression race. Those have separate results below.
No execution of these commands by the agent is recorded.

### GC-05 hosted authentication and orientation contention runner

Necessary verification dependencies added after the foundation follow-up:
`scripts/gc05-live-check.mjs`, `scripts/gc05-live-contract.mjs` and
`tests/unit/gc05-live-check.test.js`. No production code, migration or existing
foundation runner is changed by this addition. The agent has not executed these
tools. The first human results and subsequent repair are recorded below.

The runner reads the same project/public key configuration and hidden personal
access token prompt as the foundation tool. No session ID, manually created
session, browser server, rebuild or deployment is required. It generates four
distinct hosted anonymous Auth identities, claims both regional Scribe seats,
one shared Facilitator seat and an active White Cell seat, and exercises the real
PostgREST RPC/RLS boundary. It seeds only synthetic other-team qualification,
private proposal/RFI and thread-denial fixtures. The reused foundation manifest
is nested under the GC-05 manifest, with its original fixture-format stage;
GC-05 reports have `stage: GC-05-orientations`, `target: hosted-auth-rpc`, and
their own `test-results/gc05-live/<run-id>/` directory. Reusing that fixture
format does not import a foundation pass or relabel historical evidence.

Both Scribes hand off; the shared Facilitator submits each independently; each
White Cell return removes exactly its region from completion; only its Scribe
corrects and forwards the new revision. Review/audit reads, direct-write gates,
duplicate/version/session/region/type denials, unrelated shared writes and
expired/revoked Scribe, Facilitator and White Cell seats are checked. RPC status,
error code, request IDs when available, source hashes and synthetic revision
checkpoints are retained without credentials.

The contention check uses two actual database connections with explicitly labelled
simulated claims for the already-authenticated White Cell identity. One returns
Europe's submitted orientation while the other attempts move progression. It
requires observed blocking, matching distinct backend PIDs, at least 500 ms of
waiting, rejection naming Europe and a separate committed-state check that
progression stayed at 1/1 and Europe remains returned at the new revision. Both
requests settle before archival. A final corrected handoff/resubmission restores
completion and verifies that progression becomes possible.

Fixture setup/cleanup reuse the existing guarded session identity and scoped
operator-grant lifecycle. Cleanup attempts to archive both sessions even after
assertion failure, preserving revisions, reviews, audit history and synthetic roster
provenance. Auth sessions are signed out; historical identity rows are not deleted.
An interrupted run prints its exact `cleanup RUN_ID` command; retrying archival
does not rewrite the original failed report. No existing exercise is converted,
approved, claimed or deleted.

The first human-run tooling suite passed all **22 tests**, Vitest 1.6.1, start
`00:06:12`, duration `707ms`. The subsequent hosted attempt
`0de8662a-9ad9-41e7-bbd0-ec701342bb82` failed: both `setup` and `cleanup-presence`
received HTTP 401 with `JWT could not be decoded` from the management SQL
endpoint. Its saved report runs from `2026-09-19T04:06:21.597Z` to
`2026-09-19T04:06:22.284Z` and has every acceptance flag false. No orientation
checkpoint passed. The setup request appears to have been rejected before SQL
execution, but fixture absence was not verified because its query also received
401. Preserve this failed report; it is not an RLS denial or cleanup pass.

The runner now performs a recorded read-only management probe before creating
an Auth identity or SQL fixture. A credential rejection stops there. Cleanup
retry first checks the manifest's exact session IDs: verified absence succeeds
without an archive call; a complete set goes through the existing guarded archive;
a partial, malformed or unauthorized result fails closed. Cleanup retry receipts
are saved separately and never rewrite the original failed run. Narrow tests
were added for these paths. This improves error
handling; it does not repair or establish the validity of a rejected credential.

The subsequent human-run tooling suite passed **30 tests**, no skips reported,
Vitest 1.6.1, start `00:15:56`, duration `1.62s`. The cleanup retry receipt
`test-results/gc05-live/0de8662a-9ad9-41e7-bbd0-ec701342bb82/cleanup-retry-a047158f-73a9-4726-b596-679ba8d9d79d.json`
records project `gsromgrxgrwwfywaoyme`, time `2026-09-19T04:16:07.879Z`, HTTP 201,
an empty exact-session presence result, `outcome: absent` and `passed: true`.
No fixture sessions exist for the failed run; no archival was needed. This
verifies management access for that retry and resolves its cleanup uncertainty.
The original failed rehearsal remains unchanged; the hosted orientation workflow
and concurrency checks still require a successful new run.

For reference, the cleanup command used for that failed run was:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc05-live-check.mjs cleanup 0de8662a-9ad9-41e7-bbd0-ec701342bb82
if ($LASTEXITCODE -ne 0) { throw 'Fixture presence/cleanup remains unverified; retain the retry receipt.' }
```

Expected: verified absence of both fixture sessions, or verified archival if
they exist. If 401 repeats, management authentication remains unresolved; do
not change RLS or reapply migrations. Tokens belong only in the hidden terminal
prompt. Once presence/cleanup is verified, rerun the hosted rehearsal below.

The next hosted attempt, `5a6bb724-f3dc-4471-86d3-59b838f8a818`, passed management
preflight, verified four hosted identities/seats, both Scribe handoffs and their
duplicate/version denials, Asia-Pacific submission, and the missing-Europe
control-RPC denial (`23514`). It then failed the harness expectation for a direct
`game_state` PATCH: HTTP 200 instead of an exception. The saved report spans
`2026-09-19T04:17:22.945Z` to `2026-09-19T04:17:34.265Z`, with
`hostedAuthPassed: true`, `workflowPassed: false`, `passed: false` and
`cleanupPassed: true`. Both exact fixture sessions were archived; no manual
cleanup is needed for this run.

The direct-write assertion was too strict. The April 8 RLS hardening replaces
permissive `game_state` writes with a SELECT policy; later regional policies
are restrictive and do not themselves grant UPDATE. A PATCH can therefore
affect zero rows without firing the GC-05 row trigger. This run's HTTP receipt
did not retain its response body or before/after state, so it cannot prove that
outcome retrospectively and is retained as failed evidence.

The harness now accepts a constraint/permission rejection or HTTP 200 with an
explicit empty array only when independent reads before and after show the
same session/state row still at move 1, phase 1. It also rechecks that Europe is
the exact missing submission and retains the response row count and state
snapshots. A nonempty successful update, unreadable state, wrong session,
changed move/phase, missing body or unrelated error still fails. The protected
control RPC continues to require `23514`; the supplied SQL suite separately
exercises direct database writes. No production policy, RPC or migration was
changed. The human subsequently supplied **46 passing tooling tests**, Vitest
1.6.1, start `00:20:32`, duration `721ms`, covering this correction.

Hosted run `e9a5553b-b851-4f52-9b18-587c7b437c73` then passed both regional
handoff/submission/return/correction cycles, the direct-write check with retained
unchanged state, scope/type/version denials and unrelated shared-write denials.
It also passed the actual two-connection return/progression race: matching PIDs
1103568/1103569, a 1054.324 ms wait and independent committed-state verification.
Post-race corrected resubmission restored the five-submission gate and permitted
progression. The report spans `2026-09-19T04:20:45.866Z` to
`2026-09-19T04:21:17.641Z`, with `race.passed: true` and `cleanupPassed: true`;
both synthetic sessions were archived.

The run remained failed overall because the harness attempted a heartbeat after
deliberately expiring Europe's Scribe seat. The installed September 19 regional
heartbeat wrapper correctly returns `42501 / GC03_SEAT_REJOIN_REQUIRED` for an
expired seat. A heartbeat is not the rejoin operation. The expired Scribe write
was denied correctly; subsequent revoked/shared/White Cell cases did not run.
The report retains `workflowPassed: false` and `passed: false`.

The runner now calls `claim_session_role_seat` with the same authenticated actor,
session, role and client ID after the deliberate expiry check. It verifies the
same seat and participant IDs, delegation, staffing model, active/non-revoked
state and `rejoined` receipt before testing revocation. It does not revive a
revoked seat, reset database timestamps or change production permissions. Narrow
tests cover all three actor roles, changed scope/identity receipts and revoked
rejoin rejection. The subsequent human results are recorded below; no further
cleanup is needed for the archived failed run.

The human then supplied **60 passing tooling tests**, no skips reported,
Vitest 1.6.1, start `00:24:23`, duration `1.50s`. Hosted run
`f2c25e5a-8b88-4b91-a211-b04b92beed0c` passed **all 54 checkpoints** against
project `gsromgrxgrwwfywaoyme`. Its retained report is
`test-results/gc05-live/f2c25e5a-8b88-4b91-a211-b04b92beed0c/results.json`, spanning
`2026-09-19T04:24:35.933Z` to `2026-09-19T04:25:11.415Z`.
`hostedAuthPassed`, `workflowPassed`, `race.passed`, `cleanupPassed` and `passed`
are all true, with no failure. This includes both regional correction cycles,
unrelated-write denials and expiry/rejoin/revocation of Scribe, shared Facilitator
and White Cell seats. The direct REST progression attempt affected zero rows;
independent before/after reads confirmed the same session/state row at 1/1.

The return/progression race recorded matching distinct PostgreSQL PIDs
1104224/1104225, a 1085.226 ms wait and an independent committed-state receipt.
Both synthetic sessions, `389235d8-2a4e-4257-ae04-f3d808596c3d` and
`13316abd-a82b-431f-b1d2-cd0e1add6f98`, were archived. No cleanup retry is needed.
Earlier failed reports retain their failed status.

Read-only provenance review found all 20 recorded source hashes matched the
current files and report revision `8b29a62609c653b09cf35f807d299d8f3a26c794`
matched repository HEAD. Foundation run `ae278290-b531-440e-9b90-7626e79de255`
has the same project/revision, and all five source hashes shared by the reports
match. This establishes the recorded source relationship, not a hash of every
working-tree file or deployment provenance. The hosted runner verifies real-token
RPC/RLS behavior and a separately labelled database race; local browser results
remain the evidence for controls and deferred notices.

Run the tooling regressions after harness changes:

```powershell
npm test -- tests/unit/gc05-live-check.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 live tooling regressions failed.' }
```

Expected: every case passes without skips. These test fixture containment,
malformed input rejection, permission-error classification, both concurrent
outcomes, blocking receipt validation and independent committed-state evidence;
they do not call Auth, HTTP or SQL.

Then run the rehearsal from the repository root:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc05-live-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'GC05 hosted rehearsal failed; retain the report and printed cleanup command.' }
```

Expected: `hostedAuthPassed`, `workflowPassed`, `race.passed`, `cleanupPassed`
and `passed` all true in the printed report, both fixture sessions archived,
and no failure/cleanup failure. Record actual output before treating any item as
verified. These are real-token RPC checks plus a separately labelled database
race, not a hosted browser UI or deployed frontend test. The supplied local
browser results remain the evidence for orientation controls and deferred notices.

## Evidence still required and containment

- Human acceptance is recorded above for the tested local frontend and hosted
  Supabase scope. Supplemental SQL and root-browser collection now have passing
  human runs; deployed verification still requires execution. This does not expand
  acceptance or update the prompt status table.
- Deployed routing/provenance remains unverified and separate from local acceptance;
  manual foundation screen-reader checks remain excluded, not passed.
- Fresh SQL metadata and rollback proof are supplied by run
  `43d91357-72e2-4009-b770-af295db157b1`: 102 distinct PASS assertions, all fixture
  counts zero, target/times/source hashes recorded. See the
  [follow-up report summary](gc05-evidence-follow-up.md). The original SQL
  transcript and migration screenshot still lack historical execution metadata;
  the new run does not reconstruct those records.
- The root-path browser JSON is no longer available at its recorded path.
  Preserve its supplied passing transcript without inventing a replacement;
  a fresh separately dated browser run `4d890589-c8e8-46c6-877c-638e13f942f2`
  now supplies 2 passing cases and retained JSON with a verified report hash.
  The project-path JSON and complete hosted report also remain available.
- Operational roster approval and GC-08 creation remain separate pending work;
  synthetic checks cannot satisfy either.

On migration drift, stale revision or authorization failure, retain the error and
the persisted artifact; refresh the authenticated seat/revision and retry only
the intended operation. Do not broaden policies, replace roles, clear revocations
or lower the submission count. On containment, stop affected regional workflow
writes, preserve handoff/review/audit history and the server gate, use a compatible
frontend, and repair forward as described in `../supabase-rollback.md`.

## Exact change inventory

- Server: `data/2026-09-25_gc05_regional_orientations.sql` (new).
- Adapter/mock: `src/services/database.js`, `src/services/supabaseMock.js`.
- Runtime/UI: `src/features/actions/strategicOrientationDetails.js`,
  `src/features/scribe/sharedGreenContext.js`, `src/roles/facilitator.js`,
  `src/roles/scribe.js`, `src/roles/whitecell.js`, `src/stores/gameState.js`,
  `src/features/gameControls/PhaseControl.js`, `src/features/gameControls/MoveControl.js`.
- New regressions: `src/services/database.gc05-orientations.test.js`,
  `tests/unit/gc05-sql-runner.test.js`,
  `tests/unit/gc05-live-check.test.js`,
  `tests/unit/gc05-browser-config.test.js`,
  `tests/sql/gc05-regional-orientations-editor.sql`,
  `tests/e2e/gc05-orientations.e2e.js`, with `playwright.gc05.config.js`.
- Hosted verification: `scripts/gc05-live-check.mjs`,
  `scripts/gc05-live-contract.mjs` (new; foundation helpers reused unchanged).
- Extended regressions: `src/stores/gameState.test.js`, `src/roles/scribe.test.js`,
  `src/roles/facilitator.test.js`, `src/roles/whitecell.test.js`,
  `src/services/database.action-write.test.js`, `tests/unit/green-regional-contract.test.js`.
- Documentation: this file, `docs/architecture/green-regional-contract.json`,
  `docs/architecture/green-regional-contract.md`, `docs/supabase-setup.md`,
  `docs/supabase-rollback.md`.
- Supplemental evidence tooling: `scripts/gc05-evidence.mjs`,
  `scripts/gc05-evidence-contract.mjs`, `tests/unit/gc05-evidence.test.js`,
  `tests/e2e/gc05-deployed.e2e.js`, `docs/architecture/gc05-evidence-follow-up.md`,
  and a deployment documentation link. Existing GC05 browser configuration and
  its containment test are extended for unique evidence directories and
  deployed route checks.

Pre-existing edits in `docs/architecture/gc04a-shared-facilitator.md`,
`scripts/gc04-live-contract.mjs` and `tests/unit/gc04a-live-check.test.js` are
retained; they are not GC-05 changes or verification performed by this task.
