# GC08 independent database contention verification

This bounded rehearsal fills the concurrency gap left by the GC08 UI recovery run.
It does not constitute exercise approval or an overall GC08 gate pass.

`scripts/gc08-contention-check.mjs` sends two concurrent Management API SQL batches
to rehearsal project `gsromgrxgrwwfywaoyme`. It verifies distinct PostgreSQL PIDs,
records `pg_blocking_pids` and the blocked backend's lock wait event, holds the
winner's transaction for one second after observing contention, commits, and
checks persisted state through a separate request. A delay alone cannot pass.

Four unique synthetic sessions exercise:

- Identical operator/key creation: one session, one global clock, one receipt,
  and the same returned session ID for both callers.
- Different intent under that key: exact `PT409 / GC08_RETRY_CONFLICT`, retaining
  the first request. Normal code lookup cannot expose either uncommitted creation.
- Setup first: regional setup commits; the waiting unified join is rejected with
  `42501 / GC03_TOPOLOGY_ROLE_MISMATCH`; no incompatible seat is committed.
- Join first: a unified seat commits; waiting setup is rejected with
  `23514 / GC04A_SEAT_MODEL_FROZEN`; the session stays unified.

The two setup/join fixtures use the legacy creation RPC because a GC08 creation
receipt is itself retained evidence and would correctly forbid subsequent setup.
No historical session is repurposed. Cleanup archives only exact run-name/code
matches and checks receipt, clock and seat retention. No migration, approval,
policy or permanent database function is added by this tool.

This is a continuation of authorized synthetic run
`81b8e539-11ed-44d1-b0d3-9d19445cd9c1`; it reuses that run's immutable roster and
fails closed if its membership or synthetic provenance differs. It creates two
anonymous hosted Auth identities and obtains a Game Master grant through the
normal operator RPC. SQL transactions then use simulated JWT claims for those
real identities with `SET LOCAL ROLE authenticated`. This isolates PostgreSQL
contention from browser transport; it does not replace hosted authentication or
browser authorization evidence. Tokens remain in memory, not receipts or SQL.

The current application/migration files and installed definitions must match the
parent source-bound rehearsal. The new harness, regression tests and this document
are separately included in the run's whole-tree source digest. The old UI build
receipt remains historical and is not rewritten to claim this larger tree.

From the repository root, run only with explicit rehearsal authorization:

```powershell
npm test -- tests/unit/gc08-contention.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC08 contention contract regressions failed.' }
node --preserve-symlinks --preserve-symlinks-main scripts/gc08-contention-check.mjs run --project gsromgrxgrwwfywaoyme --parent-run 81b8e539-11ed-44d1-b0d3-9d19445cd9c1
if ($LASTEXITCODE -ne 0) { throw 'GC08 contention rehearsal failed; inspect retained evidence.' }
```

Use the existing ignored `.env.local` for `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `OPERATOR_CODE` (or `GC08_OPERATOR_ACCESS_CODE`), and
`SUPABASE_PERSONAL_TOKEN` (or `SUPABASE_ACCESS_TOKEN`). Never paste secrets into
chat, command-line arguments, evidence, or a browser-exposed Vite variable.

Expected: all narrow tests pass; all four races report distinct matched PIDs,
an observed lock blocker, at least 500 ms wait, expected outcomes and exact
committed counts; cleanup archives the new sessions without losing evidence;
historical session/approval fingerprints and installed definitions stay unchanged.
The script prints its unique evidence directory. Review `results.json` and the
exact submitted `.sql` files. HTTP success without these checks is insufficient.

To verify saved evidence without rerunning database mutations:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc08-contention-check.mjs verify 'EVIDENCE_DIRECTORY_PRINTED_BY_RUN'
if ($LASTEXITCODE -ne 0) { throw 'GC08 contention evidence verification failed.' }
```

Expected: four valid recorded cases, matching SQL hashes and current source. This
checks saved receipts; it is not a new backend test. Each `run` invocation creates
a new fixture set; do not rerun to conceal a failure. Keep failed reports too.
Transport errors settle both requests before cleanup; server statement, lock and
idle-transaction timeouts bound uncertain requests. A cleanup failure is an open
dependency requiring inspection of the exact recorded fixture IDs.

Still separate: human exercise roster approval, full fresh compatibility suites,
the hosted reconnect/revocation/recipient-thread matrix and manual accessibility
observations. No prompt handbook or status-table gate is changed by this tool.
