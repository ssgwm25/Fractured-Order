# GC08 unified removal history repair

Implementation supplied September 22, 2026. The user reported all four local
regression files passing (34 tests, including the 10 new cases). The first
installed SQL run stopped at an incorrect heartbeat error-code assertion.
The user subsequently supplied the corrected SQL result: **PASS, 69 assertions**.
The agent has not executed test suites or migrations. The subsequent hosted
workflow completed on fresh synthetic fixtures, with independent receipt
verification described below. These results do not pass either overall gate.
The supplied SQL output is retained separately at
`test-results/gc08-removal/83414006-0959-4ab3-bec9-0c1445e6632d/human-sql-result.txt`.
Neither GC08 nor GC09 is marked passed, and the prompt-book status is unchanged.

## Change and scope

The [failed hosted recovery run](gc08-hosted-recovery-verification.md) demonstrated
that unified operator removal deleted three seat-name snapshots. The additive
`data/2026-09-30_gc08_unified_seat_removal_history.sql` repairs future removals by
inserting an immutable receipt before deleting the live seat, in the same RPC
transaction. Failure to retain the receipt aborts removal and grant revocation.

The necessary dependency is one private table,
`public.gc08_unified_seat_removals`. It retains the original seat ID, session,
participant ID, role, delegation, original topology, exact display-name snapshot,
join time, removal time and authenticated removing operator ID. It is evidence,
not a live seat. No browser role, including authenticated operators, has direct
table access. RLS is enabled with no browser policies. UPDATE, DELETE and TRUNCATE
are rejected by immutable triggers; session deletion cannot cascade away receipts.
Database owners can inspect receipts for an explicitly scoped session.

Only the **private** `gc03_legacy_remove(UUID,UUID)` implementation is replaced.
The public removal wrapper, open-session lock, regional tombstones, claim,
heartbeat, restore, capacity, revision and recipient-thread contracts remain.
All existing public response keys remain; `display_name` now prefers the removed
seat's frozen name over the mutable global participant name. A pre-existing NULL
snapshot stays NULL in the receipt; the legacy response fallback is not promoted
into historical evidence. Historical NULL topology stays NULL.

The Supabase mock models the new private receipts, write failure atomicity and
browser isolation. Its compatibility initializer now preserves explicit NULL
snapshots instead of replacing them with a mutable participant name. No
framework, UI, represented membership, Notetaker seat,
PLI rule, artifact revision or operational roster approval changes.

There is no backfill. Already deleted seats cannot be reconstructed from current
participant names or these test receipts. The failed recovery directory
`test-results/gc08-recovery/8e25db29-c40c-4042-8c0c-9c4b707437f6/` and earlier GC09
evidence must remain unchanged. Its current-source verifier will correctly report
source drift after this repair; never reseal historical evidence to conceal it.
A read-only hash comparison during this repair matched all 1,307 entries in that
failed run's artifact manifest. This checks retained bytes, not current-source
validity or a repaired capability; its verifier was not rerun or changed.

## Authorization and compatibility

The existing unified operator-grant checks and White Cell grant revocation are
retained. Browser callers still cannot execute `gc03_legacy_remove` directly.
Participant-supplied IDs or browser filters do not authorize removal or receipt
access. The server verifies that the target seat belongs to the requested session
and retains the public wrapper's existing session lock and authorization checks.

Removed **seat IDs** cannot heartbeat or restore. Preserving unified legacy
behavior means an ordinary new Green join can create a new seat ID when capacity
permits; this is not recovery of the deleted seat and cannot rewrite its receipt.
A removed White Cell user still needs new operator authorization before joining
again. Regional revoked-identity claim denial is unchanged. This repair does not
introduce a new permanent user-ban policy.

The legacy unified heartbeat reports a missing removed seat as SQLSTATE `P0002`
(`Participant seat not found. Please rejoin the session.`). Restore reports
`42501`, as does heartbeat for a revoked regional seat. The September 19 wrapper
retains that distinction by delegating unified heartbeat to `gc03_legacy_heartbeat`.
The initial removal SQL regression incorrectly expected `42501` for unified
heartbeat. Only that assertion is corrected to require exactly `P0002`; explicit
regional heartbeat assertions still require `42501`. The migration and runtime
authorization are unchanged. Keep the failed output; it is not a passing receipt.

The existing `green_session_has_evidence` scans session-owned tables, so retained
receipts also prevent treating a previously occupied session as evidence-free.
The migration does not reset or convert any session's topology or roster.

## Replacement inspection

The implementation was checked against these replacements before editing:

- April 17 White Cell backend alignment: the legacy removal body and grant cleanup.
- August 26 session-role snapshots: immutable name capture and active roster reads.
- September 19 authorization: private legacy rename, public session lock and regional removal branch.
- September 22/23 context: authenticated restore and historical NULL compatibility.
- September 24 shared Facilitator: latest claim/restore replacements and model freeze.
- Later GC05–GC08 migrations: no subsequent removal replacement; existing revisions,
  messaging policies and atomic creation remain authoritative.

The dated ledger in `../supabase-setup.md` remains the installation order. Do not
reapply the old April/September bodies over the repaired helper.

## Human-run verification

Run from the repository root. None of these commands has been executed by the
agent for this change.

```powershell
npm test -- src/services/supabaseMock.gc08-removal-history.test.js src/services/supabaseMock.revocation.test.js src/services/database.seats.test.js src/services/database.gc08-administration.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC08 removal compatibility tests failed.' }
```

Expected: all listed tests pass, including the 10 new mock cases. These are local
contracts, not installed SQL or hosted Auth evidence.

Apply the migration to the designated rehearsal project using its authenticated
SQL Editor, or a securely configured operator connection. The environment
variable below must identify that rehearsal database, not production:

```powershell
if (-not $env:GC08_REHEARSAL_DATABASE_URL) { throw 'Set the secure rehearsal database connection first.' }
psql "$env:GC08_REHEARSAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f data/2026-09-30_gc08_unified_seat_removal_history.sql
if ($LASTEXITCODE -ne 0) { throw 'GC08 removal migration failed.' }
psql "$env:GC08_REHEARSAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/sql/gc08-unified-seat-removal-editor.sql
if ($LASTEXITCODE -ne 0) { throw 'GC08 installed SQL regressions failed.' }
```

SQL Editor alternative: paste the **complete contents** of each file separately,
migration first. Do not paste PowerShell or psql commands into the SQL Editor.
The migration should commit without errors. The SQL test should return one
`gc08_removal_result` JSON object with `result: PASS` and all named checks, then
roll back every synthetic fixture. A successful migration alone is not test
evidence. Retain the project, UTC time, submitted-file hashes and actual outputs.

For the reported `P0002` assertion failure, rerun only the complete corrected
`tests/sql/gc08-unified-seat-removal-editor.sql`; do not reapply the migration.
If the same SQL Editor connection remains in an aborted transaction, issue
`ROLLBACK;` before rerunning the suite. The prior 34-test local result remains
user-reported evidence; this assertion/documentation correction changes no JS.

The SQL regression exercises v1 topology and both legacy Green roles plus
White Cell, exact original snapshots, unauthorized/wrong-session requests,
private helper/table denial, unchanged response shape, removal retry, old-ID
heartbeat/restore denial, grant revocation, new-join versus disconnected-rejoin
semantics, real capacity enforcement, immutability, atomic receipt collision,
archive preservation and paired/shared tombstones. Claims are simulated in this
rollback suite; real hosted Auth remains the next step.

Historical NULL topology and unknown name snapshots are covered by the mock.
Current creation guards reject new NULL-topology sessions; the SQL suite does
not disable those guards or mutate old sessions to manufacture historical data.

## Hosted verification procedure

Fresh hosted verification follows human installation and the corrected SQL
regression. No old fixture is reactivated and no migration/test command is
executed implicitly. The following procedure defines the intended coverage;
the retained result below states the narrower coverage actually exercised.

After successful installation and regressions, use new synthetic fixtures and a
new evidence UUID on `gsromgrxgrwwfywaoyme`:

1. Seal current source and a fresh build, compare served bytes, and capture the
   installed private helper, table ACLs/RLS/triggers and unchanged public seat
   functions. Record the migration execution receipt. Hash the prior failed
   evidence independently of current-source equality.
2. Create a new unified session and authenticate both existing legacy Green
   roles and White Cell Lead. Retain original seat IDs/names. Change a participant's
   current name through a separate legitimate join and prove its original
   session-role name is frozen.
3. Remove through the real operator RPC; observe normal browser cleanup and
   denied old-ID heartbeat/restore/read/write. Read the exact private receipt
   through the privileged evidence connection. Confirm White Cell grant loss and
   receipt isolation from participant and operator browsers.
4. Make a normal replacement join and disconnected rejoin; prove capacity remains
   enforced and the removed ID and immutable name remain unchanged. Preserve
   regional paired/shared removal and revoked-rejoin behavior on new authorized
   synthetic fixtures with the unchanged roster; do not promote its approval.
5. Archive only the new fixtures. Independently compare receipts, artifacts,
   revisions, thread audiences, regional tombstones, other sessions and approval
   records before/after. Retain the new report separately and sign out actors.

For the privileged readback, substitute only a recorded new fixture UUID:

```sql
SELECT seat_id, session_id, participant_id, role, delegation_id,
       session_topology_version, display_name_snapshot, joined_at,
       removed_at, removed_by_auth_user_id
FROM public.gc08_unified_seat_removals
WHERE session_id = '<new-fixture-session-uuid>'::uuid
ORDER BY seat_id;
```

Expected: one exact receipt per successful unified removal, unchanged after
replacement joins and archive; no regional receipt substitutions, no old-ID
reactivation, no missing original name and no unapproved roster change. This
requires fresh retained evidence, not the old 188-assertion receipt.

Operational activation/roster approval, manual accessibility, deployed frontend
verification and other documented hosted gaps remain open. GC09's previously
verified repairs, browser-local uploads and stale-media limitations remain as
recorded; this migration neither retests nor closes those requirements.

## Retained hosted repair result

Evidence directory:
`test-results/gc08-removal/83414006-0959-4ab3-bec9-0c1445e6632d/`.
The completed workflow is in `attempt-3/`. `database-before.json` and
`database-after.json` bind the installed private removal body, public seat
functions, receipt ACLs/RLS/triggers, existing session rows and roster records.
`build-receipt.json` and `attempt-3/served-binding.json` bind the isolated fresh
build and all 314 served files to the rehearsal project. Only this result
document may differ between build and final source seals; implementation files
must remain equal. No unit/SQL test runner or migration was executed by the agent.

The hosted checks used the real Game Master creation UI and three unified UI
joins: `green_facilitator`, `green_scribe`, and `whitecell_lead`. After changing
each mutable global participant name, committed seat snapshots stayed unchanged.
Removal retained three exact private receipts and invalidated the old seat IDs.
Browser workspace cleanup and scoped Green storage cleanup completed. Both Green
identities made new RPC joins with different IDs, disconnected/rejoined those
new IDs, and retained normal capacity limits. White Cell lost its grant; a newly
authorized White Cell browser joined with a different seat. Receipts remained
unchanged through replacement and archive.

Paired Europe Scribe and Shared Facilitator joined through their normal UI paths;
removal retained their original revoked seat rows, denied heartbeat/reclaim, and
created no unified receipts. Those are the regional roles covered by this run.

| Model | Completed-run session | Final status |
| --- | --- | --- |
| Unified | `GC08R83414006BU` / `85a74ee1-1b15-446b-947a-a723da6de51e` | Archived |
| Paired | `GC08R83414006BP` / `06176a16-f893-443a-82c4-cf76715cec4a` | Archived |
| Shared | `GC08R83414006BS` / `ea5c3fed-a0ec-42c5-b6af-a020b5cbf7ed` | Archived |

All eight completed-run browser identities were signed out. Two earlier harness
attempts remain intact: the first stopped before fixture creation on form
readiness; the second incorrectly compared the legacy claim response's mutable
display name with the immutable seat snapshot. Its three fixtures were archived
and its browsers signed out. The corrected run compares committed seat records;
no production code was changed to accommodate either harness issue. The initial
sandbox build failure is also retained. The prior failed recovery run is preserved
separately and is never resealed as a success.

Run the independent, offline evidence verifier from the repository root:

```powershell
$e = 'test-results/gc08-removal/83414006-0959-4ab3-bec9-0c1445e6632d'
node --preserve-symlinks --preserve-symlinks-main "$e/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC08 retained repair evidence verification failed.' }
```

Expected: `VERIFIED_WITH_LIMITATIONS`, `evidenceIntegrity: CONSISTENT`, and both
gate fields still `NOT_PASSED_BY_THIS_RUN`. This verifies retained receipts and
current source; it performs no database requests and does not rerun the workflow.
The evidence directory must be retained with the documentation.

The stopped attempts are not passing capability evidence. The completed run is
narrow: it does not newly exercise recipient-thread exchanges, artifact revisions,
every regional/operator role, historical NULL fixtures, manual accessibility, or
a deployed frontend. Artifact-table reads used empty fixtures and therefore do
not establish new positive-control isolation evidence. Operational approval and
the separately documented GC08/GC09 hosted/media requirements remain open.

## Containment

If installation or a receipt write fails, stop affected removals, retain the error
and verify the live seat/grant remain. Repair forward. Do not bypass retention,
drop the table/triggers, expose the private helper, delete receipts, or restore
the old destructive helper. Existing receipts remain evidence even when the
frontend is rolled back. No rollback or historical reconstruction is authorized
by this document.
