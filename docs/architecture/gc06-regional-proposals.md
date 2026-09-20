# GC-06 regional proposals and handoffs

Implementation is supplied for human verification. The agent has not executed
tests, builds, migrations, hosted rehearsals or deployments. Human-supplied
results now include passing SQL assertions for GC-06 (169), GC-05 (102),
GC-04A (49) and GC-04 (36), plus 387 passing combined tests across 16 files.
Both Vite builds and all four local browser cases at each supported base pass.
Earlier focused 27-test and 107-test results remain recorded below.
The later human-run rehearsal also supplies hosted Auth handoff/review/return,
concurrent-connection and archival-cleanup evidence; see the
[verified live-run record](gc06-live-verification.md#verified-human-run-evidence-2026-09-20).
Full GC-06 acceptance, including remaining deployment and operational evidence,
remains pending. Earlier GC-04A/GC-05 reports
retain their original stage and cannot establish this change's gate.

## Runtime contract

Regional Green proposal authors use the frozen session roster, including its
approved aliases. The form loads that roster through
`get_regional_proposal_roster(session, delegation)`. Missing roster or expired
seat is an error with refresh/retry guidance; it never falls back to the unified
originator list. Unified records retain their existing list and null ownership.
No roster approval, session conversion, participant decision or PLI change is
part of this implementation.

`write_regional_proposal` derives authority from the authenticated active session
seat, locks the session before the artifact, and checks the stored artifact type,
owner, workflow state, revision and row version. Regional Scribes can save and
forward their own drafts or returned corrections. The shared Facilitator can edit
handed-off/returned proposals and submit a revision that its originating Scribe
has handed off. The older four-seat model routes to the matching Facilitator.
The revision-one, already-forwarded paired-model compatibility exception accepts
a null handoff marker; shared seats and returned revisions cannot use it.

Only goal, sector, expected outcomes and the existing proposal details envelope
are writable content. Required originators, recipients, objective, intended
partners, sectors, supply-chain decision, conditional areas, and timing/conditions
are validated on the server. Optional existing fields remain in the details
record. Structured content is server-derived. Regional approval badges use
persisted White Cell approvals, never approval claims in narrative text.

The nullable `actions.proposal_handoff_revision` marks the Scribe's handoff.
White Cell return clears it, increments the existing artifact revision, preserves
ownership and archives current recipient approvals under
`artifact_payload.proposal_recipient_review_history[revision]`. A correction
requires a fresh Scribe handoff before resubmission. Facilitator edits do not mint
a handoff. Stale forms receive terminal `PT409`; the UI does not silently replace
the expected revision. Draft keys include session, delegation and authenticated
seat so two regions can use the same browser key without overwriting each other.

Blue and Red approvals stay separate. Regional approval roots are unique per
source artifact, recipient and revision. Historical unified uniqueness remains
per source and recipient. Existing roots/rounds are never rewritten. New thread
rounds require the persisted proposal, matching owner, approved recipient, root,
thread and current revision; returned/old revisions cannot accept new rounds.
Replies still enter White Cell review. Released replies reach the shared
Facilitator under the source delegation and only that delegation's Scribe.
Older paired sessions keep their original regional routing. Client message keys
are scoped by session, active seat and thread. Earlier rounds remain readable,
with earlier proposal revisions rendered separately.

Region and revision appear on proposal forms, review cards, presentation slides
and White Cell response review. The shared region selector separates queues; it
is not an authorization input. Joint ownership is absent: coordination requires
two independently owned proposals and explicit textual references, with no
permission implied by those references.

Shared generic submit/thread flags remain false. Only the orientation RPCs and
proposal-specific RPC/thread paths authorize writes. Private drafts and notes
stay inaccessible; shared RFI/direct-message creation stays closed for GC-07.
Existing paired/unified capabilities remain compatible. The shared notice now
names these remaining restrictions.

## Installation and necessary scope dependencies

Apply `data/2026-09-26_gc06_regional_proposals.sql` after every prior migration,
including the September 20 terminal-conflict repair, September 21 recipient-root
index repair, GC-04A and GC-05. Then apply
`data/2026-09-27_gc06_released_thread_round_order.sql`. Later replacements of the affected helpers and
policies were inspected. Exact helper patch sites abort on definition drift;
do not weaken those checks or reinstall an older helper to force installation.
The transaction adds the handoff column and policy, replaces the recipient-root
index and patches existing helper definitions in place, preserving ACLs/OIDs and
positive orientation branches. It also enforces active White Cell seats on
regional proposal approvals, returns and response forwarding. Mutation RPCs take
session locks before artifact/thread locks to keep their lock order consistent.

Necessary additions beyond the initially cited files: the revision-aware thread
selector, versioned permission contract, additive migration, focused verification
files/configuration, and setup/containment documentation. The GC-04A SQL fixture
now uses GC-06 proposal RPCs when installed, with a rolled-back synthetic roster;
its original isolation and seat assertions remain. The GC-05 browser notice
expectation is updated for the current stage. The prompt handbook is not an
implementation output and its pre-existing edits are retained.

Operational prerequisites are still external: an actual approved roster registry
entry with approval provenance, that version frozen into the target session, and
fresh GC-04A/GC-05 prerequisite verification. The contract's approved membership
list is not evidence that those database steps were performed. Synthetic fixtures
are not operational roster approval. No production migration was applied here.

## Reported failures and correction status

The supplied human unit-test output reports 373 passing and two failing tests
across 15 files. The failures are the returned unified proposal's Save Changes
control and the architecture identity/permission table synchronization. Preserve
that failed run as evidence; it does not establish acceptance.

The corrected form retains Save Changes for historical unified returns and
Facilitator edits. Only a regional Scribe's returned correction presents the new
handoff controls. Six added role/region cases cover shared and paired workflows;
the original unified regression remains unchanged. The misplaced shared proposal
permission row is moved out of the Asia-Pacific Scribe identity row into the
permission matrix. Table tests now require complete rows, so an embedded fragment
cannot satisfy synchronization.

The reported migration error 42725 came from subtraction taking precedence over
JSON extraction in gc06_shared_change. Both payload extractions are now
parenthesized before removing the proposal key. The SQL suite additionally checks
that proposal content edits are allowed while sibling recipient-approval changes
are rejected. No permissions are broadened by this correction.

If the entire migration was run inside its supplied BEGIN/COMMIT transaction,
that failed attempt did not commit. Copy the updated file from disk and rerun the
entire migration, not an isolated replacement line. If SQL Editor reports an
aborted transaction, run ROLLBACK first. A duplicate-column error needs state
inspection; do not remove checks or skip statements to force installation.

First rerun the two affected unit files:

```powershell
npm test -- src/roles/facilitator.test.js tests/unit/green-regional-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 correction regressions failed.' }
```

Expected: all cases pass, including the six new regional return-control cases.
Then rerun the complete focused unit command and the migration/SQL/browser steps
below. Corrected-source tests and migration have not been executed by the agent;
fresh human results are still required.

The subsequent supplied focused rerun reports 107 passing tests across
`src/roles/facilitator.test.js` and `tests/unit/green-regional-contract.test.js`.
This confirms that focused scope only; it is not a full GC-06 gate result.

The database-check attempt then reported constraint error 23514 on
`actions_proposal_recipient_check`. The synthetic unified proposal omitted the
required legacy `proposal_recipient_team` scalar while supplying the plural
recipient list. The fixture now explicitly sets the scalar to `blue` and asserts
that the structured list still contains both Blue and Red. The database
constraint, RLS and application migration are unchanged by this fixture fix.
Recopy and rerun the entire `tests/sql/gc06-regional-proposals-editor.sql` file
as postgres with RLS enabled. No migration rerun is needed for this correction.
Expected: all assertion rows PASS and the final ROLLBACK; fresh execution is
still required. If the editor reports an aborted transaction, run ROLLBACK first.

The subsequent reported error 42P01 (`gc06_sessions` does not exist) has no
supplied statement/LINE/CONTEXT, so its precise execution point is unverified.
The file creates this temporary table before every reference and removes it
with the final rollback. Setup and assertions must run in one submission on the
same database connection; running a selected section, resuming after rollback,
or moving between connections cannot reuse the fixtures. Recopy the whole file
into a new SQL Editor query, select all of its contents and Run once as postgres
with RLS enabled. Do not create a permanent replacement table or rerun the
migration to address missing temporary fixtures. If the full-file submission
still fails, retain the complete error including LINE and CONTEXT to locate the
failing statement. No SQL or tests were executed by the agent for this report.

The same 42P01 error was reported again after the thread-order repair, and the
human confirmed that the entire file ran in one submission. Partial selection
is therefore not an established explanation. The exact failing statement and
database/editor cause remain unverified.

The GC-06 harness now follows the existing GC-05 harness: one server-side `DO`
block creates and consumes all temporary fixtures. The surrounding result query
reads a transaction-local JSON report instead of a temporary relation. A missing
or empty report returns FAIL. All existing authenticated role switches and
RPC/RLS assertions remain; the final ROLLBACK removes fixtures and report.
Unexpected errors preserve SQLSTATE and include the stage and stacked SQL
context directly in MESSAGE. This is a harness and diagnostic correction,
not proof of an editor defect or a passing database gate.

No additional migration or migration rerun is required for this harness change.
With the September 26 and September 27 migrations already installed, recopy:

```powershell
Get-Content -Raw -Encoding UTF8 'tests/sql/gc06-regional-proposals-editor.sql' | Set-Clipboard
```

Paste into a new SQL Editor query and run the whole file as postgres with RLS
enabled. Expected: a nonempty result table, every result PASS, and final
ROLLBACK. On failure retain the full `GC06 stage=...` error. If the error still
has no stage, retain that fact rather than attributing it to a particular RPC.

Three narrow structure regressions protect fixture containment, unchanged
rollback/permission boundaries and error context, and fail-closed reporting:

```powershell
npm test -- tests/unit/gc06-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 SQL harness structure checks failed.' }
```

Expected: three passing tests, none skipped. These do not execute PostgreSQL.
If SQL Editor still suppresses context, use an installed PostgreSQL CLI with
`GC06_DATABASE_URL` securely configured for the rehearsal project's owner:

```powershell
psql $env:GC06_DATABASE_URL -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f tests/sql/gc06-regional-proposals-editor.sql
if ($LASTEXITCODE -ne 0) { throw 'GC06 SQL failed; retain the full error and file line.' }
```

The [`psql` file and verbosity options](https://www.postgresql.org/docs/current/app-psql.html)
provide file-line and expanded error reporting. No tests or SQL were executed
for this correction; fresh database results remain required.

## Released-round ordering repair

The later supplied SQL failure reports PT409 from
`gc02_unified_append_proposal_thread_message` at the Facilitator followup.
The installed append helper includes pending-review and released-response rows
when it selects the latest round. A retained review request and its released
response share the same round number; timestamp/UUID ordering can choose the
review request and falsely reject the released response as a stale parent.
The mock already selected released messages separately, so its earlier success
did not expose this database bug.

Apply the additive `data/2026-09-27_gc06_released_thread_round_order.sql` after
September 26, including on projects where that migration already succeeded.
Do not rerun September 26. The repair patches only the private helper's exact
ordering expression and checks that its OID, owner, ACL and security settings
remain intact. The GC-06 wrapper's active-seat/source/recipient/revision checks
are unchanged. A released response wins within the same round; an unreviewed
higher round still blocks new writes with PT409. Same-key retry resolution and
append-only history remain unchanged. Necessary dependency: the private append
helper is shared by unified and regional sessions, so all three staffing models
are included in the regression coverage.

Run the new migration in SQL Editor as postgres, keeping RLS enabled:

```powershell
Get-Content -Raw -Encoding UTF8 'data/2026-09-27_gc06_released_thread_round_order.sql' | Set-Clipboard
```

Paste and run the entire file. Expected: successful transaction, no drift or
permission errors. Then recopy and run the entire SQL fixture in one submission:

```powershell
Get-Content -Raw -Encoding UTF8 'tests/sql/gc06-regional-proposals-editor.sql' | Set-Clipboard
```

Expected: all PASS, including pending-review rejection, same-key retry, released
round followup and stale-root denial, with the final ROLLBACK. Regional checks
cover both delegations in shared and paired sessions; the unified fixture also
checks the reviewed-thread continuation without introducing regional ownership.

The mock now returns PT409 for duplicate pending attempts. Three added mock
regressions cover shared, paired and unified threads with an adversarial retained
review timestamp, plus idempotent retries and stale/duplicate denial:

```powershell
npm test -- src/services/database.gc06-proposals.test.js src/services/database.policy.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 thread-order regressions failed.' }
```

No migration or tests were run by the agent. The later human SQL result below
covers the repaired thread continuation. The earlier failure remains historical
failed evidence; full regression, hosted Auth and concurrent-write results are
still required.

## Supplied GC-06 SQL result

After the runner correction, the human supplied the GC06 result table in
attachment `c4b9adc0-fe54-4d19-aa9a-7f50d3cfba82/pasted-text.txt`. It contains
**169 rows with 169 unique assertion labels, all PASS**, matching the reported
assertion count of 169. This is fresh user-supplied database rehearsal evidence,
not an agent-executed test or a full acceptance verdict.

The supplied results cover shared and paired regional drafting/handoff,
submission, White Cell return, correction and resubmission; ownership and
other-region Scribe isolation; separate Blue/Red approvals and recipient-thread
denials; released-round continuation, retries, stale and duplicate rejection;
direct source/recipient/thread forgery denials; and closed shared RFI, direct
message and private-note access. They also cover historical unified handoff,
return and thread continuation without regional relabeling, plus regional
GC-05 orientation submission and artifact-type separation.

The successful report shows that the prior missing-table and false-stale-thread
errors did not prevent this rehearsal from completing its assertions. It does
not establish the original missing-table error's cause. The attachment contains
the result table only: target identity, execution time, executed-source hash,
migration receipts and an independent rollback/cleanup confirmation were not
supplied. The source ends with ROLLBACK; the table alone is not a cleanup receipt.

Still required: current full unit and browser results, separate GC-05/GC-04A/
GC-04 compatibility SQL reruns after the helper changes, hosted authenticated
end-to-end evidence, real concurrent-connection checks, and operational roster/
migration provenance. No code or test changes were needed to record this result.
Do not rerun migrations merely to acknowledge this passing assertion report.

## Supplied focused runner/proposal/policy result

The human subsequently ran:

```powershell
npm test -- tests/unit/gc06-sql-runner.test.js src/services/database.gc06-proposals.test.js src/services/database.policy.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 regressions failed.' }
```

The supplied Vitest 1.6.1 output reports **27 tests passed across three files**:
three SQL-runner structure tests, 18 GC-06 proposal mock tests, and six database
policy tests. No failures or skips are reported. Start time is `00:16:46` and
duration `5.08s`; the output does not supply a date, time zone or source hash.

The stderr seat-claim rejection is expected: the named removed-observer test
asserts a `DatabaseError` with the exact message
`This role cannot be claimed in the live demo.` It is not a failed test.
This result verifies the focused mock/runner scope, separately from the 169 SQL
assertions above. It does not replace the full compatibility, browser, hosted
Auth, concurrency or provenance evidence still required. Recording this result
changes documentation only; no tests or migrations were executed by the agent.

## Human-run verification

### Subsequent combined results and GC-04A runner correction

The human supplied attachment `103101ee-ba3c-435b-8c4d-42fcb693f704/pasted-text.txt`
with **387 tests passed across 16 files**, including the GC-06 runner checks.
The summary records start time `00:19:38` and duration `42.61s`; no failed or
skipped tests are reported. This establishes the combined selected unit/mock
scope, not browser or hosted execution. Preserve logged error-path output with
the original run rather than treating a passing summary as silent execution.

Attachment `c6be0e2d-4df4-4b17-a3cf-60b1b92b9d1d/pasted-text.txt` contains
**102 unique GC05 assertion rows, all PASS**, matching its count of 102. This is
the requested orientation/gate compatibility rerun during GC-06 verification.
Database target, executed-source hash and independent cleanup receipts are not
present in that table; earlier evidence is retained separately.

The GC-04A SQL attempt then reported `42P01: relation "gc04a_run" does not exist`.
Its compatibility runner is now contained in one server-side block, including
temporary composite types, with `pg_temp` references, a transaction-local grouped
report and stage/context diagnostics. Existing assertions and permission checks
are retained. Necessary scope dependency: this GC-04A verification script must
run to establish GC-06 backward compatibility. No migration or runtime change is
needed; the failed attempt remains historical evidence. See the
[GC-04A runner commands and expected results](gc04a-shared-facilitator.md#sql-editor-runner-correction-during-gc-06-compatibility-checks).

New structure tests: `tests/unit/gc04a-sql-runner.test.js` (three cases). The agent
did not execute them or the SQL suite. The passing 387-test report predates these
new structure tests; it is not evidence that they passed.

The subsequent human output supplies that focused result: **10 tests passed
across two files** (three runner tests and seven GC-04A context tests), Vitest
1.6.1, start time `00:26:01`, duration `5.09s`, with no failures or skips reported.
The accompanying SQL Editor screenshot shows **49 GC-04A assertions passing**:
one boundary row with 22 and three Green role rows with nine each. This verifies
the corrected compatibility rehearsal's grouped result. Individual check labels
are cropped in the image; target identity, executed-source hash and independent
cleanup evidence are not supplied. The separate GC-04 SQL result, browser checks,
hosted workflow/concurrency evidence and provenance/cleanup receipts remain
outstanding. No new code, tests or migration are needed to record these results.

The next GC-04 compatibility attempt reported
`42P01: relation "gc04_run" does not exist`. The four-seat SQL runner now uses
the same server-side fixture containment, explicit temporary-schema references,
transaction-local grouped report and stage/context error handling as the
corrected GC-04A runner. Its 36 assertions, role switches and rollback are
preserved. This is a necessary compatibility-verification dependency only;
runtime permissions and migrations are unchanged. Three structure cases were
added to `tests/unit/gc04-sql-runner.test.js` (six total). See the
[GC-04 reproduction commands](gc04-regional-context.md#reproduction-commands).
The agent did not run tests or SQL. The failed attempt remains historical failed
evidence; earlier GC-04 results retain their original scope.

The subsequent human terminal output reports **six GC-04 runner tests passed**,
Vitest 1.6.1, start time `00:31:35`, duration `3.44s`, with no failures or skips.
The accompanying SQL Editor screenshot shows **36 GC-04 assertions passing**:
all four regional roles have nine each, including identity restoration, legacy
workspace mapping, wrong-session/foreign-seat denial and disconnected/stale/
revoked-seat recovery behavior. All four requested SQL suites now have supplied
passing assertion results: GC06 = 169, GC05 = 102, GC04A = 49, GC04 = 36.
These are simulated-identity database checks, not hosted browser/Auth or real
concurrency results. Browser checks, hosted workflow/concurrency evidence and
database/source provenance plus independent cleanup receipts remain outstanding.
Only documentation changed to record these results; no new tests were added or
executed by the agent and no gate status was changed.

Run from the repository root with the existing dependencies installed. None of
these commands have been run by the agent.

### Focused unit and compatibility regressions

```powershell
npm test -- src/services/database.gc06-proposals.test.js src/services/database.gc05-orientations.test.js src/services/database.regional-security.test.js src/services/database.shared-green.test.js src/services/database.actions.test.js src/services/database.action-write.test.js src/services/database.policy.test.js src/services/database.privileged.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/whitecell.test.js src/features/actions/ActionCard.test.js src/features/actions/proposalDetails.test.js src/features/actions/proposalRecipientState.test.js tests/unit/green-regional-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 focused regressions failed.' }
```

Pass requires every selected case to pass without skips. New cases cover parallel
regional drafts, scoped retries, invalid originators, wrong-region/source-type
attempts, stale and duplicate submission, independent recipient threads, returns,
current-revision approvals, thread metadata forgery, deferred capabilities,
active leases and review/form labels. Mocks establish application behavior, not
PostgreSQL or hosted authorization.

### Database migration and real RPC/RLS checks

In a disposable/rehearsal Supabase project at the prerequisite migration state,
run the ENTIRE September 26 migration and then the September 27 repair in SQL
Editor as postgres. Skip September 26 if it already succeeded. Retain their
actual output and target identity. Then run each ENTIRE file below separately:

1. `tests/sql/gc06-regional-proposals-editor.sql`
2. `tests/sql/gc05-regional-orientations-editor.sql`
3. `tests/sql/gc04a-shared-facilitator-editor.sql`
4. `tests/sql/gc04-session-context-editor.sql`

For a configured PostgreSQL CLI, these are equivalent exact commands. Set
`GC06_DATABASE_URL` securely to the rehearsal project's owner connection first;
do not put a credential in logs or committed files.

```powershell
psql $env:GC06_DATABASE_URL -X -v ON_ERROR_STOP=1 -f data/2026-09-26_gc06_regional_proposals.sql
if ($LASTEXITCODE -ne 0) { throw 'GC06 migration failed; retain the error and stop.' }
psql $env:GC06_DATABASE_URL -X -v ON_ERROR_STOP=1 -f data/2026-09-27_gc06_released_thread_round_order.sql
if ($LASTEXITCODE -ne 0) { throw 'GC06 thread-order repair failed; retain the error and stop.' }
foreach ($gc06Sql in @('tests/sql/gc06-regional-proposals-editor.sql', 'tests/sql/gc05-regional-orientations-editor.sql', 'tests/sql/gc04a-shared-facilitator-editor.sql', 'tests/sql/gc04-session-context-editor.sql')) {
    psql $env:GC06_DATABASE_URL -X -v ON_ERROR_STOP=1 -f $gc06Sql
    if ($LASTEXITCODE -ne 0) { throw "GC06 compatibility SQL failed: $gc06Sql" }
}
```

Pass requires migration commit, all assertion rows labelled PASS, no SQL error,
and each fixture transaction ending ROLLBACK. The GC-06 suite exercises the
shared and four-seat workflows through real RPC/RLS plus historical unified
handoff/return/resubmission without relabeling. It exercises orientation submission
after helper replacement; the separate GC-05 suite checks the complete gate.
These suites simulate JWT claims in PostgreSQL. They do not prove hosted Auth or
concurrent connections. Record target, UTC times, actual source revision and
working-tree hashes, output and independent fixture-cleanup confirmation.

### Root and project-path browser controls

```powershell
$gc06PriorBase = $env:VITE_PUBLIC_BASE_PATH
try {
    foreach ($gc06Base in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc06Base
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "GC06 build failed: $gc06Base" }
        node --preserve-symlinks --preserve-symlinks-main ./node_modules/@playwright/test/cli.js test --config playwright.gc06.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC06 browser checks failed: $gc06Base" }
    }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc06PriorBase
}
```

Expected: four passing cases at each base (two proposal and two orientation
cases), without retries/skips. The new configuration writes JSON to
`test-results/gc06-browser/root/results.json` and
`test-results/gc06-browser/project-base/results.json`, with failure artifacts
alongside them. The human-run results at these paths are recorded below. Archive each
run's output before rerunning. Browser cases use synthetic mock fixtures and
keyboard submission; they do not prove a deployed or full hosted workflow.

### Supplied two-base build and browser results

The human supplied attachment `eb26d996-3015-4dac-ad44-314667a133c4/pasted-text.txt`
showing the prescribed root/project-base loop completed. Both Vite 5.4.21 builds
succeeded (173 modules), in 16.90s and 20.76s respectively. Both emitted mixed
static/dynamic import and chunk-size warnings; these did not fail either build.
No bundle or build configuration change is made merely to silence them.

The agent read the resulting JSON reports on disk without executing tests:

| Base | Report | UTC start | Result | Duration |
| --- | --- | --- | --- | --- |
| `/` | `test-results/gc06-browser/root/results.json` | `2026-09-20T04:34:45.960Z` | 4 passed | 38.9s |
| `/Fractured-Order/` | `test-results/gc06-browser/project-base/results.json` | `2026-09-20T04:35:52.445Z` | 4 passed | 32.9s |

Both reports identify the matching local server URL on port 4174, zero skipped,
unexpected or flaky tests, an empty runner-errors array, and one attempt with
retry zero for every case. They cover shared independent orientation/proposal
submissions, retained capability notices and returned-artifact resubmission
controls at both bases. These are local browser runs with synthetic mock data;
the report errors array is not a separate browser-console audit or hosted test.

The local browser step now has fresh passing evidence. Hosted authenticated
handoff/review/return and recipient-thread workflows, real concurrent connections,
deployed asset/source provenance, operational roster/migration provenance and
independent database-fixture cleanup receipts remain required. The reports do
not themselves bind the candidate to a source revision or deployment. Full
GC-06 acceptance remains pending. Recording this evidence changes documentation
only; no tests, build, migration or deployment was executed by the agent.

## Acceptance evidence checklist

The subsequent run `03f94fbd-aeeb-480a-8fd2-b944426d1a51` supplies the hosted
Auth/RPC proposal cycle and real connection contention below, with confirmed
archival cleanup. Its frontend was local. The detailed
[live-run record](gc06-live-verification.md#verified-human-run-evidence-2026-09-20)
distinguishes that supplied evidence from deployed-URL, browser/accessibility,
operational roster and migration/deployment receipts still required.

- Hosted authenticated regional Scribes independently save and forward proposals
  to the one shared Facilitator; it edits/submits each stream to White Cell.
  Repeat with paired Facilitators and the unified role mapping. Record actual
  artifact IDs, owners, revisions, immutable roots and outcomes.
- White Cell independently approves Blue/Red, returns a partially approved
  proposal, and receives its originating Scribe's correction/resubmission.
  Capture revision increment, cleared/new handoff, preserved old approval, new
  roots and stale-thread denial. Other-region Scribe reads must remain empty.
- Real Blue/Red identities negotiate in distinct threads through White Cell;
  shared replies retain the originating delegation. Repeat direct RPC/RLS
  forgery attempts with hosted tokens, including unapproved recipient/source
  type/owner/thread, private drafts/notes, RFIs and direct messages.
- Two independent database connections must contend on the same revision and
  client key, with exactly one mutation and a terminal stale/state conflict or
  matching retry. Concurrent regions must both persist distinct records. The
  single-transaction SQL suite and mock Promise.all are not connection-race proof.
- Confirm current orientation completion/return gates after helper replacement,
  mobile overflow, keyboard/focus return, screen-reader region/revision labels,
  deployed asset/base routing, and target migration/roster provenance. Preserve
  failed attempts and historical reports under their original labels.

Dedicated GC-06 hosted-backend and concurrency tooling is now supplied in
`scripts/gc06-live-check.mjs`. It creates isolated synthetic shared, paired and
unified fixtures through the existing backend configuration foundation, uses
distinct hosted Auth users, records two-connection contention and archives its
fixtures while preserving history. Follow the exact commands and evidence limits
in the [GC-06 live verification runbook](gc06-live-verification.md). The new runner
and its unit regressions were executed by the human and their passing evidence
was inspected by the agent. No tests or hosted commands were executed by the agent.
This tooling does not require GC-08 creation screens or a new migration.
Acceptance is not claimed.
On drift, stale revision or denied scope, retain the error and persisted artifact;
refresh only the authenticated seat/form and retry the intended operation.
Do not broaden RLS or clear history. For containment, stop affected regional
writes and follow [Supabase rollback guidance](../supabase-rollback.md).

## Exact change inventory

- Server: `data/2026-09-26_gc06_regional_proposals.sql` and
  `data/2026-09-27_gc06_released_thread_round_order.sql` (new additive repair).
- Adapter/mock: `src/services/database.js`, `src/services/supabaseMock.js`.
- UI/runtime: `src/roles/facilitator.js`, `src/roles/scribe.js`,
  `src/roles/whitecell.js`, `src/features/scribe/sharedGreenContext.js`,
  `src/features/actions/ActionCard.js`, `src/features/actions/proposalDetails.js`,
  `src/features/actions/proposalRecipientState.js`.
- New regressions: `src/services/database.gc06-proposals.test.js`,
  `tests/unit/gc06-sql-runner.test.js`,
  `tests/sql/gc06-regional-proposals-editor.sql`,
  `tests/e2e/gc06-proposals.e2e.js`, with `playwright.gc06.config.js`.
- Extended regressions: `src/services/database.regional-security.test.js`,
  `src/roles/facilitator.test.js`, `src/roles/scribe.test.js`,
  `src/features/actions/ActionCard.test.js`,
  `src/features/actions/proposalDetails.test.js`,
  `src/features/actions/proposalRecipientState.test.js`,
  `tests/e2e/gc05-orientations.e2e.js`,
  `tests/sql/gc04a-shared-facilitator-editor.sql`,
  `tests/unit/green-regional-contract.test.js`.
- Docs: this file, `docs/architecture/green-regional-contract.json`,
  `docs/architecture/green-regional-contract.md`, `docs/supabase-setup.md`,
  `docs/supabase-rollback.md`.

The contract JSON/Markdown and contract test already had user edits before this
work; those roster changes are preserved. Pre-existing
`docs/green-cell-regional-split-prompt-book.md` changes are not part of this work.
