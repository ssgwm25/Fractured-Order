# GC-03 checks in the existing Supabase project

This procedure uses the existing project `gsromgrxgrwwfywaoyme`; it needs no
second database, Docker, database password or `psql`. GC-03 must already be
installed and both guarded Edge Functions deployed. The human runs all commands
and SQL. These new harness files have been reviewed but **not executed by the
agent**. Human-run results are recorded below; the overall acceptance gate remains open.

Scope: four clearly named `GC03 SECURITY TEST <run UUID> ...` sessions, two SQL
race identities and five new anonymous Auth identities for the API matrix. The
four sessions have no join code. The generated setup commits an empty synthetic
roster approval, two private draft transport fixtures and two thread roots.
These are labelled security-test evidence, never exercise-owner roster approval
or participant/White Cell decisions. No represented entities are added. Existing
exercise sessions, historical unified records, scoring and migrations are not
changed. Use a quiet period; do not include these test sessions in exercise
analysis or publication. Test records remain as archived evidence afterward.

## 1. Check the harness, then prepare files locally

From the repository root, run each command separately:

```powershell
npm test -- tests/unit/gc03-hosted-check.test.js
node scripts/gc03-hosted-check.mjs prepare gsromgrxgrwwfywaoyme
```

Expected: seven harness unit tests pass; preparation reports
`Prepared local files only` and creates `test-results/gc03-hosted/`. Preparation
does not contact Supabase. Do not overwrite an existing run or delete its
evidence to force preparation to succeed. The regression pins credential
rejection, exact fixture targeting, race overlap and denial-result validation;
it is not a SQL compilation or hosted test.

Open `test-results/gc03-hosted/01-setup.sql`. In the **existing project's** SQL
Editor, as `postgres`, paste and run the entire file once. Expected:
`GC03 fixture setup committed` plus a run UUID. This setup intentionally commits
so other connections can see the fixtures. It does not install/reapply GC-03.
On any error stop and retain the complete error. Do not run fragments or disable
triggers. All generated SQL includes statement, lock and idle-transaction
timeouts; idle transactions time out after 60 seconds.

## 2. Automated races after the dashboard coordination failure

The current user reported that starting A stops B in the SQL Editor and showed
the correct A source alongside B's error. Stop dashboard race attempts. The
result/source mismatch does not prove an authorization failure, and the earlier
suggestion that the user pasted B into A was not supported by this screenshot.
The exact dashboard cancellation/result-display mechanism remains unverified.

Use the standalone operator runner for both races and the committed-count check:

```powershell
npm test -- tests/unit/gc03-hosted-check.test.js tests/unit/gc03-race-runner.test.js
node scripts/gc03-race-runner.mjs
```

Expected unit result: **11 tests** (7 generator safeguards and 4 runner tests).
Neither this test run nor the new live runner has been executed by the agent.
The runner uses the existing manifest and fixture sessions, renders current SQL
directly from the generator, starts both HTTP requests before awaiting either,
and retains both results even when one fails. Do not repeat preparation, setup,
refresh-races, migrations or deployment. Close outstanding dashboard runs first;
the configured 60-second idle timeout bounds abandoned fixture transactions.

The runner needs a **personal access token** from
[Supabase Account Access Tokens](https://supabase.com/dashboard/account/tokens),
beginning `sbp_`, with authority to run SQL on this project. If offered a scoped
token, select this project and database-write permission; choose a short expiry.
Paste it only into the hidden terminal prompt, not into SQL, chat, a command
argument or a committed file. It may also read an already-configured
`SUPABASE_ACCESS_TOKEN`. It does not read or extract the CLI credential store.
The token is kept in process memory, sent only to the HTTPS Management API with
redirects rejected, and redacted from saved response/error text. Revoke a token
created only for this check after recording the result. This is an operator
credential; it must never be added to `VITE_*` variables or the browser app.
See [Management API authentication](https://supabase.com/docs/reference/api/introduction)
and the [SQL endpoint](https://supabase.com/docs/reference/api/v1-run-a-query).

Necessary harness dependency: authenticated Management API SQL submission replaces
manual dashboard timing; no npm dependency, schema object or application
authorization rule is added. The SQL still switches to `authenticated` with
distinct subjects for each claim. It requires A to observe B blocked on A's
transaction and validates matching, different backend IDs in both responses.
The runner returns each receipt after commit using a temporary session setting,
then clears that setting. It does not infer contention from HTTP overlap alone.
An independent final request verifies the committed counts (one and two seats).

Expected final message:
`PASS: both two-connection races and committed counts. API isolation remains a separate check.`
The report `test-results/gc03-hosted/race-results-<timestamp>.json` and adjacent
exact submitted SQL files record each labelled request, timestamps, available
request IDs, SQL hashes and the runner hash. Keep and share the report on success
or failure. HTTP errors, unknown response shapes, network timeouts, serialized
backend execution, mismatched connection IDs or missing post-commit rows fail
the check. No automatic retries are made. A request timeout does not establish
whether its transaction committed; the report and database state need review
before retry. The successful human-run result below verifies this transport and
both contention checks for the recorded fixture run.

After success, continue at **Direct API isolation** below. The operator race
credential is not used by that participant API matrix. The existing archive
procedure remains the final cleanup step.

### Manual same-seat procedure (reference only)

Open two browser tabs for this project's SQL Editor, each with a new query:

- Tab A: entire `test-results/gc03-hosted/02-same-A.sql`.
- Tab B: entire `test-results/gc03-hosted/02-same-B.sql`.

Create two distinct **New Query** documents, named `GC03 Same A` and
`GC03 Same B`, then open one in each browser tab. Two browser tabs displaying
the same saved query are not two independently prepared scripts. Before running,
check the text: A contains `GC03_NO_BLOCKED_B` and does not contain
`GC03_NO_CONCURRENT_A`; B contains `GC03_NO_CONCURRENT_A`. Recheck after switching
tabs so that an accidentally shared/overwritten editor document is caught.

Prepare both tabs before starting. With the current v2 files, click **Run in B**,
then **Run in A within a few seconds**, without waiting for B to finish. B waits
up to 20 seconds for A. Each connection advertises its presence through a
different transaction-scoped advisory marker. B discovers A through `pg_locks`,
then attempts the claim as a different `authenticated` subject. A holds the
claim transaction open until it observes its own backend ID in
`pg_blocking_pids(B)`, then releases it after one additional second. These marker
locks do not serialize the claims themselves; the real seat RPC does that.
No activity-name lookup is used. The privileged observation does not grant
authority to the claim. See [PostgreSQL lock monitoring](https://www.postgresql.org/docs/current/view-pg-locks.html).

Expected in B: `PASS: same seat has one winner`, two different connection IDs,
and `waited_ms` of at least 500. A must report
`PASS: A observed B blocked on its transaction` and finish without error. B catches only the
specific role-full error; missing functions, unrelated exceptions and a second
successful claim fail. If either reports `GC03_NO_CONCURRENT_A`,
`GC03_NO_BLOCKED_B` or `MISSED CONTENTION`, retain both outputs and stop. These
are failed coordination checks, not authorization evidence. A sequentialized
dashboard connection path cannot satisfy this procedure and would require
separately controlled database connections. Do not disable the overlap checks
or repeatedly increase timeouts. Save both outputs.

For an already-prepared run that reported the old `MISSED OVERLAP`, use:

```powershell
npm test -- tests/unit/gc03-hosted-check.test.js
node scripts/gc03-hosted-check.mjs refresh-races
```

Expected: seven tests pass; four local race files are refreshed, with previous
copies saved under `test-results/gc03-hosted/race-backup-<timestamp>/`. This
command makes no database calls and preserves the manifest, fixture IDs, setup,
verification and archive scripts. Reopen the files and re-paste **both** A and B
into the editor; old pasted queries do not update automatically. Do not rerun
`prepare`, fixture setup, migrations or function deployments.

### Manual different-region procedure (reference only)

Repeat the same timing with `03-split-A.sql` and `03-split-B.sql` in the two tabs.
Expected in B: `PASS: different regional seats both claimed`, different
connection IDs and at least 500 ms observed waiting. A must finish without error.
Both claims commit; the common session lock can serialize them briefly.

Then run all of `04-verify-races.sql` in one SQL Editor query. Expected:
`PASS: committed race seat counts are 1 and 2`. Preserve the race transcripts
and this result. This verification reads fixture state and rolls back.

## 4. Direct API isolation

Run from the repository root:

```powershell
node scripts/gc03-hosted-check.mjs api
```

The command uses `VITE_SUPABASE_ANON_KEY` from the environment or `.env.local`;
otherwise it prompts for the project's **public anon/publishable key**. Never
supply a service-role key, secret key, database password or operator code. The
target URL comes from the prepared manifest. Auth uses the existing Supabase
client dependency and ordinary anonymous sign-in. If CAPTCHA or Auth rate limits
prevent sign-in, stop; do not weaken project security settings. The script retains
each created identity immediately and refreshes it on retry instead of creating
another set. See [Supabase anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous).

The matrix exercises both regional authoring pairs and a seated identity from
the separate `foreign` fixture session:

- Own action reads, draft creation/editing, Facilitator RFI creation, direct
  messaging and own thread visibility must succeed.
- Other-region action/thread GET, PATCH and DELETE attempts must return no
  private row and make no change; RFI reads/updates/deletes are checked for both
  opposite-region seats and the other-session identity.
- Delegation and sender spoofing, cross-session action creation, unauthorized
  Scribe submission, participant review RPCs and cross-region thread append
  calls must be denied. Derived action-log reads must not leak the other region.
- Both deployed Edge Functions must return HTTP 403 with the application's
  `Session operation is not authorized` error for both regional Facilitators
  and the other-session identity. An HTTP 401, missing route, bad payload,
  unrelated constraint or server failure does not count as an isolation pass.

Expected terminal message:
`PASS: hosted API matrix and Edge denial responses. This is not the overall GC-03 gate.`
The command exits nonzero on the first failed check and always writes its partial
API report once testing starts. `api-results-<timestamp>.json` records HTTP
responses, timestamps, available request IDs and local source SHA-256 hashes.
It contains only targeted synthetic responses, not request credentials. Local
hashes are not proof of deployed function versions. Capture those versions and
server logs separately, including evidence of no GitHub/Cursor dispatch for the
denied requests. Network timeouts are failures, never acceptable denials.

**Do not share `private-auth.json`.** It holds the test users' access and refresh
tokens inside the Git-ignored results directory. Share only the API report and
SQL outputs. Retain test identities and record history; do not delete users or
erase evidence as cleanup. Retrying the API command can add further explicitly
synthetic draft/RFI/message records to the same fixture sessions.

## 5. Archive the test sessions

After capturing results (or when stopping an unsuccessful run), run the whole
`06-archive.sql` file in SQL Editor as `postgres`. It checks the exact fixture
IDs, names, topology and roster before acting. It uses a temporary session-scoped
White Cell grant for one fixture at a time, invokes the normal archive RPC, then
removes that temporary grant in the same transaction. No global operator grant
or permanent helper function is installed. No session, artifact, revision or
approval is deleted. Expected: exactly four result rows, all `archived`.

Do not resume the API/race command after archiving. Keep the manifest, SQL
transcripts, API report, deployment version IDs and execution times together.
An archive failure is a cleanup dependency to resolve, not a reason to delete
historical records manually.

## Evidence limits

Human-reported progress for run `362dc3b3-1579-4ed1-b1ae-a79b73584d97`:

- Vitest v1.6.1: `tests/unit/gc03-hosted-check.test.js`, 6 tests passed,
  starting `12:23:13`, duration `2.43s`. No source revision was supplied.
- Local preparation reported success; the manifest records
  `2026-09-18T16:23:24.952Z` and the existing project reference.
- SQL screenshot: `GC03 fixture setup committed` with this run UUID.
- Two screenshots show `A claimed; committing`: backend `1052137` at
  `2026-09-18 16:25:41.603496+00`, and backend `1052142` at
  `2026-09-18 16:26:11.547136+00`. The displayed results do not identify the
  race mode or show B's concurrent attempt, waiting time or outcome. These are
  A-side observations only; no contention pass is inferred.

At that stage both B results, the committed-count check, API report and archive
result were outstanding. The human then reported repeated `MISSED OVERLAP` from B while A
completed. Timing, activity visibility and dashboard scheduling have not been
distinguished by that output. It is not a seat-authorization failure or pass.
The harness was revised to the lock-based rendezvous above, with one updated
regression and one added marker-pair regression (seven tests total). The revised
tests and SQL have not been executed by the agent; the later human test result
is recorded below. The subsequent SQL attempt is recorded below. Do not repeat
setup or preparation; refresh only the race files if still using the old version.

The human then reported `GC03_NO_CONCURRENT_A` from the tab described as A,
and no result from the other tab. The local generated v2 A file has no such
exception; only B emits it. The revised SQL was therefore attempted, but the
reported tab label does not establish which script ran. Duplicate saved-query
documents or swapped pasted code are possibilities, not confirmed causes.
The subsequent screenshot confirmed the visible A source was correct while the
result pane showed B's exception; the user also reported B stopping when A was
started. The automated runner above now supersedes further dashboard attempts.
No concurrent execution or successful authorization result is inferred from
those dashboard attempts.

The human subsequently ran both harness unit files: **2 files, 11 tests passed**
(7 generator tests and 4 runner tests), Vitest v1.6.1, starting `14:14:18`,
duration `645ms`. The live runner then succeeded. The agent read the local
`test-results/gc03-hosted/race-results-1789755351389.json` report:

- Project `gsromgrxgrwwfywaoyme`, same fixture run UUID as above.
- Execution `2026-09-18T18:15:51.389Z` through `2026-09-18T18:15:56.290Z`.
- Same seat: A backend `1059974`, B backend `1059973`, B waited `1037.095ms`;
  matching receipts confirm actual blocking and one winner.
- Different regional seats: A backend `1059976`, B backend `1059977`, B waited
  `1030.731ms`; matching receipts confirm actual blocking and both claims.
- All five requests returned HTTP 201; the independent committed-count query
  confirmed counts of **1 and 2**. The report records `passed: true`.

These two-connection checks passed for this run; do not repeat them merely to
replace the failed dashboard attempts. Retain this ignored local report with
its submitted SQL sidecars and hashes.

The human then ran `node scripts/gc03-hosted-check.mjs api` successfully. The
agent read `test-results/gc03-hosted/api-results-1789755718468.json`, for the same
project and fixture run, from `2026-09-18T18:21:58.467Z` through
`2026-09-18T18:22:28.064Z`. It records `passed: true` and 112 HTTP responses:
86 HTTP 200, six HTTP 201 and twenty HTTP 403. These are request counts, not
112 independent test cases; empty HTTP 200 results are expected for rows hidden
by RLS. The focused matrix above passed, including authorized counterpart
operations and denied cross-region/session and spoofing operations.

All six Edge requests (both functions, each regional Facilitator and the
other-session identity) returned HTTP 403 with
`Session operation is not authorized`, with request IDs retained in the report.
This verifies the deployed denial responses for those callers. Local source
hashes do not identify deployed versions or independently prove the absence of
external dispatch. Deployment version IDs and server denial logs were still
outstanding for this focused run; the later completion evidence supplies them.
Preserve both successful reports.

The human subsequently supplied the archive result screenshot: all four exact
fixture IDs and names for this run show `archived`:

| Fixture | Session ID | Observed status |
| --- | --- | --- |
| api | `bc23b3c5-0dad-494a-b78c-8b547130ec12` | archived |
| foreign | `2c82ddd7-b523-4c02-9312-00d4d644baa1` | archived |
| same | `8e911722-ddd2-4bfc-b137-e63b2c6e0081` | archived |
| split | `f92ee49d-8fed-4437-8a9d-a99e74426239` | archived |

This matches the prepared archive script's post-commit result. Fixture cleanup
is complete for this run; the screenshot provides no execution timestamp.
Do not rerun the race/API commands against these archived sessions. Retain
their records and the local evidence; no further cleanup command is required.

This adds an executable procedure for two-connection contention and a focused
hosted API matrix. It does not turn prior screenshots into full gate evidence.
The existing sequential suite still covers additional lifecycle/legacy cases.
At this stage, hosted tests of revoked/expired seats, note revisions, complete White Cell
review cycles, Blue/Red recipient retry isolation, all timeline/link/derived
surfaces and external-dispatch logs were separate evidence requirements.
Production roster approval and later regional UI/workflow gates remain open.

The [GC-03 completion evidence](gc03-completion-verification.md) records the
later successful lifecycle/workflow matrix, archival and all six correlated
deployment logs on September 18. It used separate fixtures and retains both
archived runs. Its passes come from those new reports. The human also supplied
the rollback-only recipient-index success screenshot. The completion record
now has all requested verification evidence and is ready for human sign-off.
