# GC-03 completion verification and evidence

This is the follow-on to the successful two-connection races and focused API
matrix in [hosted verification](gc03-hosted-verification.md#evidence-limits).
Those four sessions are archived. This procedure creates a new run in the
**existing** project `gsromgrxgrwwfywaoyme`; it does not reopen them or require a
second database. The agent has not executed tests, deployments or live checks.
The hosted matrix, archival and correlated logs have now passed. Do not rerun
or resume the archived successful run. The human retains prompt sign-off; the
completed verification evidence is recorded below. GC-03 is ready for human
sign-off for the verified implementation; no verification evidence remains pending.

## Verified human-run evidence, September 18, 2026

The human supplied **45 passing tests across five files**, started at 17:07:01
local time. Git output showed line-ending warnings with no whitespace errors
displayed. These are human executions, not agent executions.

For project `gsromgrxgrwwfywaoyme`, the agent reviewed:

- `test-results/gc03-completion/78414608-28d8-4e03-b247-b38e5fec3b49/completion-results.json`:
  matrix and archival passed from **21:08:00.145 to 21:10:26.972 UTC**. The
  immediate log query returned no rows; this original report remains unchanged.
- `test-results/gc03-completion/78414608-28d8-4e03-b247-b38e5fec3b49/logs-results-1789765902941.json`:
  read-only retry began at **21:11:41.513 UTC**, returned HTTP 200 and six matching
  server records. `matrixPassed`, `cleanupPassed` and `logsPassed` are all true.

All six records match the server-generated request ID, operation and deployment,
with `authorized: false` and `external_dispatch_started: false`. Versions stayed
unchanged during the run: `trigger-pli-adjudication` version **5**, function ID
`e1f9588f-05ff-4057-b624-289068e46d92`; `pli-report-narrative` version **8**,
function ID `a5a7d4d9-4841-4263-88a8-6702a0753122`.

The reports retain 700 participant HTTP requests and 10 fixture/catalog SQL
requests, not 710 independent tests. All documented matrix checkpoints passed,
including both regional review/RFI cycles, notes, recipient isolation/retries,
timeline/link/derived boundaries, seat lifecycle and operator scope, legacy
permissions, Edge denials and archived-session authority. All five sessions
are archived with history retained. The 15 recorded source hashes matched local
files at review. Git HEAD was `2a2ada60cbcee6d96d487bf948248b8651a33ad6` with
working-tree changes; this is evidence for those recorded file versions, not a
clean committed release. Keep the earlier successful race/API reports as well.
The later conflict/index repairs did not change seat-claim locking.

**Final SQL evidence supplied:** the human supplied the SQL Editor screenshot
for `tests/sql/gc03-recipient-forward-uniqueness.sql`, showing the assertion
body, `ROLLBACK;`, and the expected result:
`GC03 recipient index assertions completed; temporary fixtures rolled back`.
This completes the previously missing index regression evidence alongside the
successful catalog and both-recipient RPC checks. The screenshot supplies no
execution timestamp or machine-readable transcript; none is invented here.
The script uses temporary data and changes no public records or Auth users.
No further hosted run, deployment or migration reapplication is required by
the completed evidence. The human may now mark GC-03 complete in the prompt
status table; the agent has not edited that table.

The original sequential rollback-suite success screenshot is already supplied.
Do not invent an unavailable historical migration execution transcript. Preserve
the deployed definitions and execution evidence actually available. Later
roster/UI/PLI/export dependencies remain separate activation gates; this evidence
does not authorize regional production activation or mark the prompt table.

## Recorded timeout and forward repair

The human supplied 29 passing tests across five files at 14:50:13 on September
18, 2026 and successful deployments of both logging-enabled Edge Functions.
The retained report at
`test-results/gc03-completion/d88e1582-16b2-4b65-97c0-58787e18b3f0/completion-results.json`
records inventory and topology passes, followed by a timeout between
18:51:35 and 18:51:51 UTC. Notes were successfully saved as revisions 1 and 2.
The next scripted request deliberately supplies stale revision 1. The old runner
did not persist requests that aborted before a response, so the precise failed
request and server retry activity were not captured. All five exact fixtures
were archived: `cleanupPassed: true`, `matrixPassed: false`, `logsPassed: false`.
Retain this failed report unchanged; do not reopen those sessions.

The captured deployed note function deliberately raises SQLSTATE `40001` for
that application conflict. Supabase documents that affected PostgREST versions
retry this code, potentially until timeout:
[RPC errors and transaction retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
This is consistent with the observed timeout, not proof of the project's exact
PostgREST retry behavior. Stale application revisions need a terminal response
regardless of server version.

Necessary scope expansion: additive migration
`data/2026-09-20_gc03_terminal_revision_conflicts.sql` changes six deliberate
conflict raises in five active implementations from `40001` to `PT409` (HTTP
409). It preserves native PostgreSQL serialization failures, validation,
authorization, ACLs, function ownership, search paths, wrappers and every row.
It patches the private GC-02 append implementation, retaining the public GC-03
authorization wrapper. Original migration files and retired training RPCs are
untouched. Unexpected function/site drift aborts the transaction.

The mock uses the same conflict code. The runner requires HTTP 409 plus PT409,
checks deployed definitions before creating Auth identities, and persists each
participant request before dispatch so timeouts retain its actor, route and
method. It does not retry failed requests or increase timeouts.

The human's 15:02:35 offline run reported 35 passes and one failure: the
migration-scope test's identifier pattern excluded digits and therefore missed
`gc02_unified_append_proposal_thread_message`. The test pattern now permits
digits after the first character while retaining the exact five-function
expectation. This correction changes no migration or runtime behavior. The
human subsequently supplied 36 passing tests at 15:03:32 and a five-row SQL
result confirming all six terminal conflict sites and no application retry codes.

## Recipient fixture correction

Run `dd464097-9741-4489-95d8-3688d6976949` passed deployed inventory, topology,
private notes, terminal conflicts and cross-seat note isolation. Its retained
`test-results/gc03-completion/dd464097-9741-4489-95d8-3688d6976949/completion-results.json`
shows that the harness replaced proposal details during handoff without their
`Recipient Teams` line. The deployed payload rebuilding contract consequently
retained only the primary Blue recipient. Blue approval succeeded, then Red
approval correctly returned HTTP 403 / 42501: `Requested recipient is not an
intended proposal partner.` All five fixtures were archived; the matrix and
server log checks remain incomplete.

The corrected harness uses the existing proposal serializer for both draft and
handoff details, preserving the synthetic Blue/Red selection through later
payload rebuilds. It checks the stored recipient list after draft, handoff,
submission, revision and resubmission. Two offline regressions cover serialized
routing and rejection of an incomplete stored recipient list. The serializer's
source hash is included in new evidence reports. No production behavior,
database policies or migration changes are needed for this fixture correction.
Keep both failed reports and their archived sessions unchanged.

## Second-recipient uniqueness dependency

The human supplied 38 passing offline tests. Run
`1c6ff4b1-b337-4b5d-803a-8a9b3e2aa601` then passed the corrected recipient
retention checks and Blue approval/retry. Red approval failed for a different
reason: HTTP 409 / 23505, duplicate key on
`idx_communications_one_forward_per_proposal`. Its report is retained at
`test-results/gc03-completion/1c6ff4b1-b337-4b5d-803a-8a9b3e2aa601/completion-results.json`.
All five fixtures were archived; `matrixPassed` and `logsPassed` remain false.

The July 14 migration creates uniqueness on `source_proposal_id` alone. The
August 6 recipient-thread migration adds thread/round uniqueness but does not
remove this incompatible earlier restriction. Inspection of later migrations
found no replacement. This is a required GC-03 dependency, not a reason to skip
Red approval or weaken recipient isolation.

`data/2026-09-21_gc03_recipient_forward_uniqueness.sql` atomically installs
uniqueness on proposal plus normalized recipient and limits the old index to
historical messages without a thread. It verifies the old index shape, takes a
bounded table lock and installs the new guard before replacing the old one.
Duplicate or unexpected evidence aborts the transaction. It changes no rows,
role permissions, policies, RPCs, scoring or historical labels. Existing
thread/round/client-message indexes remain intact. The mock review RPC already
supports separate recipient approvals and idempotent recipient retries.

The runner now captures installed communication index definitions and requires
the new scopes before creating Auth identities or fixtures. The additional SQL
regression copies the two installed index expressions onto a temporary table:
Blue and Red can each have a thread root, duplicate roots remain forbidden even
with a new thread ID or uppercase recipient, and historical messages retain
proposal-wide uniqueness. All temporary data is rolled back. This checks index
semantics; the subsequent hosted matrix still supplies authorization evidence.

## Necessary scope and evidence dependency

The verification runner uses five fresh UUID sessions with names beginning
`GC03 SECURITY TEST <new run UUID>`, no join codes, and eleven ordinary anonymous
Auth identities. Four sessions use the synthetic empty regional roster fixture;
one uses unified topology for compatibility checks. The empty approval is a
labelled security fixture, not exercise-owner approval and not a roster expansion.
Synthetic proposals, reviews, RFIs and replies exercise the contracts without
representing participant decisions. All remain retained after archival.

The initial application change was correlated authorization logging in the two PLI
Edge Functions. `auditedDerivedAuthorization` logs `derived_authorization`, a
server-generated `request_id`, operation, Supabase `DENO_DEPLOYMENT_ID`, the
authorization result and `external_dispatch_started: false`. A denied request
returns immediately with HTTP 403 and `x-gc03-request-id`. Credentials, payloads,
session contents and caller-supplied request IDs are not logged. The subsequent
database repair changes only the deliberate conflict error codes; permissions,
scoring and browser configuration remain unchanged.

The human has redeployed both functions to obtain this evidence. The unit tests execute
the actual handler bodies with a mocked authorization backend and verify there
is no GitHub/Cursor fetch on denial. The hosted report joins each denial to its
server log and exact deployed version. This establishes evidence at the
application dispatch boundary; it does not claim a provider-wide audit of all
GitHub/Cursor jobs. An authorized log is emitted before dispatch and must never
be interpreted as proof that an authorized request did not dispatch later.

Supabase documents [deployment IDs](https://supabase.com/docs/guides/functions/secrets)
and the [Management API log query](https://supabase.com/docs/guides/observability/advanced-log-filtering).
The log collector uses a bounded time window and only the six generated request
IDs; missing logs, query errors or version mismatches never pass.

## Human-run commands

### Historical Auth recovery (completed; do not rerun)

Attempt `78414608-28d8-4e03-b247-b38e5fec3b49` passed the deployed inventory at
19:17:33 UTC on September 18, then hit `Request rate limit reached` while
creating `outsider`. Its private checkpoint contains ten actors. The retained
report contains only the inventory request; fixture setup was never reached.
No sessions existed at that initial failure. The later successful resume and
archival are recorded above. These commands explain recovery and must not be
repeated for this now-completed run.

Supabase documents a default anonymous signup limit of 30 per hour per IP:
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
Allow the limit to recover (conservatively, one hour after the last rate-limit
error). Do not repeatedly start `run`, raise the limit or change access policies.
After running the offline tests below, resume this exact attempt once:

```powershell
node scripts/gc03-completion-check.mjs resume-auth 78414608-28d8-4e03-b247-b38e5fec3b49
```

Expected initial message: ten saved identities, one missing. The command keeps
the same unused fixture IDs, refreshes the ten existing Auth identities and
requests only `outsider`. It checks server-returned user IDs, anonymous status
and run metadata. A refresh failure stops; it never silently creates a substitute.
Each rotated refresh token is checkpointed before moving to the next actor.
Keep `private-auth.json` local and never share it.

Resume requires an Auth-only failure, no setup dispatch or cleanup sidecar,
matching run/project metadata, distinct saved users, and a fresh database check
that none of the five fixture session IDs exists. It refuses runs that reached
the matrix or archival. An exclusive local lock prevents overlapping resumes.
Every previous report is preserved byte-for-byte as
`completion-before-resume-<UUID>.json` before a new attempt updates
`completion-results.json`; SQL sidecars have unique attempt prefixes. Current
source hashes, inventory and deployment metadata are captured again. This is
only a harness recovery path; application Auth settings and permissions do not
change. If rate-limited again, retain the new report and wait rather than looping.

The inventory pass checks the recipient indexes. The human has also supplied
the rollback-only SQL success screenshot, recorded above. Retain that evidence;
do not reinstall the migration.

### Offline tests and initial installation

Run from the repository root in PowerShell. First run the offline safeguards:

```powershell
npm test -- tests/unit/gc03-auth-resume.test.js tests/unit/gc03-completion-check.test.js tests/unit/gc03-terminal-conflicts.test.js src/services/database.regional-security.test.js tests/unit/repo-docs-contract.test.js
git diff --check
```

Expected: **5 files, 45 tests pass**, no network/SQL in those tests, and no
whitespace errors. These tests cover the terminal-conflict preflight and strict
response assertions, abort evidence before headers/during body, the bounded
migration, retained note revisions, migration ledger documentation and Auth
resume guards. These updated tests have not been executed by the agent.

For the current project, the September 20 terminal-conflict repair is already
confirmed installed and the latest preflight accepts the September 21 index
definitions. Its interrupted attempt has now completed; do not resume it again.
The following installation instructions apply only when that index repair is
absent from another environment; do not reapply it to the current project:

```powershell
notepad .\data\2026-09-21_gc03_recipient_forward_uniqueness.sql
```

Copy the entire file into a **new query** in the SQL Editor for the existing
project `gsromgrxgrwwfywaoyme`, then run it once. Expected: no SQL error and two
index-definition rows. `communications_proposal_recipient_root_unique` must
have both source proposal and recipient keys; the old index must now include
the `thread_id IS NULL` condition (expressed using NULLIF/BTRIM). Save this
output and record the migration in the project's change log. If it fails, stop
and retain the error; do not delete rows or replay older migrations.
This is a committed index repair. No Edge redeployment is needed.

Then open the rollback-only index regression:

```powershell
notepad .\tests\sql\gc03-recipient-forward-uniqueness.sql
```

Run its entire contents in another new SQL Editor query. Expected: no SQL error
and `GC03 recipient index assertions completed; temporary fixtures rolled back`.
Retain that result. This creates no Auth users or public-session fixtures.

For a future verification against a changed implementation, the initial-run
command is below. The current successful run does not need repeating:

```powershell
node scripts/gc03-completion-check.mjs run gsromgrxgrwwfywaoyme
```

It prompts for a Supabase personal access token, hidden in the terminal, as the
race runner did. It needs database-query authority, function metadata read and
project logs read on this project. The public anon/publishable key is read from
the existing environment or `.env.local`, otherwise prompted. The personal
token is used only for fixture setup, exact fixture maintenance/archival,
catalog inspection and metadata/log collection. All participant and White Cell
authorization assertions use independent Auth JWTs through PostgREST. The
runner never retrieves service-role keys, changes Auth settings or deploys code.

Expected final success:

```text
PASS: completion API matrix, archival and correlated deployment logs. Retain for GC-03 evidence review.
```

Reports and exact owner SQL go into `test-results/gc03-completion/<run UUID>/`.
Share `completion-results.json` and terminal output; **never share
`private-auth.json`**, which holds access/refresh tokens. Do not commit token
files. The report captures Git HEAD plus dirty status and hashes, rather than
claiming that a dirty working tree equals a committed source revision.

If the API checks and archival pass but logs are pending, the runner prints an
exact command containing the run UUID:

```powershell
node scripts/gc03-completion-check.mjs logs RUN_UUID_FROM_THE_OUTPUT
```

Run that printed command after log ingestion catches up. It only reads the
saved report and matching server logs, then writes a new timestamped evidence
file. It does not create users, rerun the matrix or reopen archived sessions.
Keep every attempt. A missing log is pending evidence, not an isolation pass.

On any other failure, retain the report and stop. The runner attempts archival
in `finally` and reports cleanup separately. If interrupted or cleanup fails,
the run directory contains `cleanup.sql`, prepared before setup. Review the
reported database state, then run that entire exact file in SQL Editor as
`postgres`; expect **five** rows all `archived`. It validates IDs, names,
topology and roster, uses temporary grants per fixture, and removes only its
own grants. It never deletes participants, artifacts, revisions or approvals.
Do not blindly repeat `run`: it creates a new set of identities and fixtures.

## Coverage and pass conditions

| Requirement | Fresh evidence generated |
| --- | --- |
| Regional/unified role claims | Both mismatch directions rejected; valid normalized legacy claims succeed |
| Notes | Each notetaker saves/revises its own row; stale revision rejected; opposite region and paired authors cannot read/patch/delete it |
| Review RPCs and revisions | Both regional Scribes hand off; Facilitators submit; White Cell returns and completes revision 2; unauthorized/stale reviews fail; snapshots retained and outcome stays null |
| RFI workflow | Both regions submit, receive clarification return, resubmit and receive one answer; opposite region and other session cannot read/mutate the evidence |
| Recipient threads | Blue and Red receive separate roots for both regions; pending replies remain private; retries create one review/forwarded round; cross-region/session/recipient retries fail |
| Timelines and links | Nonempty authorized controls; forbidden GET/PATCH/DELETE; mixed-region action/RFI links rejected |
| Derived copies | Nonempty action-log, raw note-revision and unscoped report controls; forbidden reads/mutations leave evidence intact |
| All GC-03 policy families | Live catalog RLS, enabled authority triggers, restrictive USING/WITH CHECK and private compatibility RPC checks; raw definitions/policies retained for review |
| Unscoped PLI/research families | Active regional JWTs exercise the deployed read-decision helper for every operator-only family; no fabricated scoring records are inserted |
| Stale browser | Disconnect/rejoin retains seat/name; owner ages one exact synthetic lease; expired reads/writes/heartbeat fail; replacement cannot revive the old identity, even after leaving |
| Removal | Operator removes a notetaker; old JWT cannot rejoin, switch region, save or recover notes; operator still sees retained notes |
| Operator scope | A grant from another fixture cannot remove a seat; withdrawing a fixture grant removes RPC authority |
| Legacy permissions | Historical Green role inversion, draft/handoff/submission and session-seat authority survive changes to `participants.role` |
| Archive | Five fixtures archived through normal RPC; claims, heartbeat and capabilities fail afterward |
| Edge dispatch | Six denied calls, matching server-generated IDs, unchanged deployed versions and corresponding server denial records |

Operator grants have no expiry field in the installed contract; grant
withdrawal is tested. No expiry schema is invented. The full table inventory
and helper probes are explicitly policy evidence, not claims of nonempty REST
fixtures for every PLI/research table. The broader regional UI, realtime play,
production roster approval, PLI attribution and publication/export contracts
belong to later prompts and are not prerequisites for this authorization proof.

## Evidence review before marking GC-03 complete

Keep the already supplied race report and focused API report with this run.
Review fresh unit output, deployment outputs, all completion checkpoints,
`matrixPassed`, `cleanupPassed` and `logsPassed`, the restrictive-policy inventory
and stored function definitions. Resolve every failure or unexplained policy
before sign-off. Source/deployment changes after a run require assessing which
evidence is invalidated. A screenshot of installation markers is not a substitute
for the captured deployed definitions. Do not fabricate a migration ledger
entry or reconstruct an unavailable historical execution transcript.

The human updates the prompt-status table only after reviewing the fresh
evidence. This document does not change that table or declare a gate passed.

## Files in this verification change

- New runner/contracts: `scripts/gc03-completion-check.mjs`,
  `scripts/gc03-completion-contract.mjs`, `scripts/gc03-completion-sql.mjs`,
  `scripts/gc03-completion-matrix.mjs`, `scripts/gc03-recorded-request.mjs`.
- Auth-only recovery: `scripts/gc03-auth-resume.mjs` and the `resume-auth`
  command in `scripts/gc03-completion-check.mjs`.
- Terminal-conflict repair: `data/2026-09-20_gc03_terminal_revision_conflicts.sql`
  and `src/services/supabaseMock.js`.
- Recipient uniqueness dependency: `data/2026-09-21_gc03_recipient_forward_uniqueness.sql`
  and rollback-only regression `tests/sql/gc03-recipient-forward-uniqueness.sql`.
- Existing input helpers exported for reuse: `scripts/gc03-hosted-check.mjs`,
  `scripts/gc03-race-runner.mjs`.
- Correlated server logging: `supabase/functions/_shared/authorizeDerivedOperation.js`,
  `supabase/functions/trigger-pli-adjudication/index.ts`,
  `supabase/functions/pli-report-narrative/index.ts`.
- New tests: `tests/unit/gc03-completion-check.test.js` (14),
  `tests/unit/gc03-auth-resume.test.js` (5),
  `tests/unit/gc03-terminal-conflicts.test.js` (4),
  `tests/unit/gc03-edge-dispatch.test.js` (2). Extended
  `tests/unit/regional-derived-authorization.test.js` (1 additional test),
  `src/services/database.regional-security.test.js` (1 additional note test),
  `tests/unit/repo-docs-contract.test.js` (ledger assertion).
- Documentation: this file, `docs/architecture/gc03-hosted-verification.md`,
  `docs/architecture/green-regional-authorization.md`, `docs/supabase-setup.md`,
  `docs/supabase-rollback.md`.

The 45-test output, complete hosted matrix, five-session archival, six correlated
deployment logs and rollback-only index regression result are supplied and
reviewed above. No GC-03 verification evidence remains outstanding for the
recorded implementation. This document does not mark the prompt-status table.
