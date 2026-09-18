# GC-03 regional seat authorization

Implementation candidate; **no test, migration, hosted API check or gate has been
executed by the agent**. Apply the additive
`data/2026-09-19_green_regional_authorization.sql` once, after the installed GC-02
migration. Do not reapply GC-02 or an earlier policy owner over this migration.
The [GC-01 contract](green-regional-contract.json) remains the semantic-role and
roster specification. No roster is selected, approved, expanded or relabeled.

## Seat authority and compatibility

Regional authority resolves `auth.uid()` to exactly one current session seat,
including active status, null disconnect/leave/revocation markers, matching
delegation, an active live session, and a heartbeat within 90 seconds. Global
`participants.role`, browser client ID, delegation parameters and sender metadata
cannot grant authority. Client-ID collisions with a different authenticated
identity fail; neither participant deletion nor identity takeover reconciles them.

Each of the six regional role names has capacity one. Regional names have their
literal meanings; the compatibility surface adapter maps them into existing
workflow guards. Legacy role normalization, White Cell aliases, capacities and
the existing legacy Facilitator/Scribe inversion remain. `green_semantic_role`
and `green_has_capability` expose the semantic contract for later consumers.
There are no new routes, UI roles, represented entities or PLI formulas.

Claims lock the session before the role and identity, serializing against
topology freeze and seat lifecycle operations. Different regional seats have
separate capacities; claims may briefly wait on the common topology lock. This
is not a throughput claim. A caller cannot shorten the regional timeout to
evict another participant. An expired/disconnected regional seat must explicitly
claim again; heartbeat only renews a current lease. A normal rejoin retains its
seat ID, name snapshot and note references. Legacy heartbeat recovery remains.

Removal retains a regional seat with `revoked_at`, and revokes its session's
White Cell/SME grant. A replacement claim permanently revokes earlier inactive
leases for that role. The revoked identity cannot reclaim that session seat or
switch roles in place, even after the replacement leaves. The operator must
arrange a fresh authenticated join if intentional readmission is needed; do not
clear revocations or alter historical seats. This preserves note authorship and
prevents stale automatic recovery. It is seat revocation, not a person-level ban
on obtaining a new anonymous identity. Normal legacy removal remains compatible.

Archived/protected sessions reject claims and heartbeat. The existing archive
and retirement RPCs retain evidence; only operator-authorized seat closure and
the existing session closure/retirement audit events can be appended after the
session becomes inactive. Cross-session White Cell grants cannot archive a
regional session.

## Policy and RPC boundaries

The GC-02 restrictive policy inventory is replaced in place with per-record
checks. Existing permissive policies still apply, but cannot broaden regional
scope. A final mutation trigger also runs inside SECURITY DEFINER RPCs, after
GC-02 has derived communication/timeline scope. No browser service credential
or browser-side filter is part of this boundary.

| Surface | Regional contract |
| --- | --- |
| Actions/orientations/proposals | Own delegation only. Scribe creates/edits draft or returned work; Facilitator edits/submits forwarded or returned drafts. Notetaker sees own completed artifacts. |
| RFIs | Own delegation reads; semantic Facilitator creates/resubmits. Existing review, revision and unanswered-field guards remain. |
| Communications | Exact sender or explicit addressed scope. Both-delegation/session announcements require the existing explicit audience contract. Direct participant messages go to White Cell and cannot carry forged source links. |
| Proposal threads | Source delegation plus that thread's Blue or Red recipient. Pending review is visible only to its sender role and operators. Only semantic Facilitator appends; authorization runs before idempotent retry lookup. White Cell review/redaction remains. |
| Review records | Own authoring pair, plus authorized session operators. Existing revision snapshots remain immutable. |
| Timeline and links | Referenced communication/action/RFI scope is checked; both endpoints of a link must be readable. Other-delegation copies cannot bypass source isolation. |
| Notes | Own notetaker seat only, with retained references after revocation; authorized operators can read evidence. Shared v2 JSON notes stay forbidden. |
| Physical delete | Regional authenticated deletes are rejected, including via definer RPCs. Draft soft deletion remains subject to author/workflow constraints. |
| Research/shared derived records | Operator-only reads; trusted nested audit capture can write. Direct participant research-event RPC writes are rejected. |

Replacement owners inspected include April seat/auth alignment, June identity
and role normalization, July SME/Industry and artifact integrity, August 5 review,
both August 6 communication/thread migrations, August 12/17 lifecycle,
August 13/14 notification and canonicalization, August 15 review preparation,
August 18 access helpers, August 26 decommission/name snapshots, and GC-02.
The private compatibility functions have no PUBLIC/anon/authenticated EXECUTE.

Necessary dependencies beyond the initially cited files: GC-02 scope triggers,
note seat references, topology locking, proposal retry RPC, lifecycle guards,
the two PLI Edge Functions and the setup/rollback ledger. No handbook is edited.

The Edge Functions previously checked only a Bearer header before external
dispatch. Both now forward the caller JWT and the project's public anon key to
`green_authorize_derived_operation` through PostgREST. Invalid auth, missing RPC,
network failure or any response other than boolean `true` rejects the request
before GitHub/Cursor is contacted. Unified sessions require a matching White Cell
grant or Game Master grant; regional calls remain closed pending scoped PLI
inputs. The shared helper uses the Supabase-provided `SUPABASE_URL` and
`SUPABASE_ANON_KEY` environment values; no new browser configuration or reusable
secret is introduced. Both Edge Function deployments are required to close this
external-dispatch path; migration installation alone does not deploy their code.

## Human-run checks

The human supplied a Vitest v1.6.1 run reporting **7 files and 69 tests passed**,
starting at `11:51:26`, with duration `2.97s`:

| File | Passing tests |
| --- | ---: |
| `src/services/database.regional-security.test.js` | 9 |
| `tests/unit/regional-derived-authorization.test.js` | 7 |
| `tests/unit/green-regional-authorization-contract.test.js` | 5 |
| `src/services/database.seats.test.js` | 13 |
| `src/services/database.policy.test.js` | 6 |
| `src/services/supabaseMock.test.js` | 17 |
| `tests/unit/repo-docs-contract.test.js` | 12 |

The observer-role and duplicate-seat error logs accompany passing rejection
tests. The supplied `git diff --check` output contains LF-to-CRLF warnings and
no whitespace-error diagnostics; a separate exit code was not supplied. These
are human-run results, not agent executions. The human subsequently supplied
the rollback-check and subsequent installation-marker screenshots recorded below.
Fresh real database contention evidence was subsequently supplied and is recorded
under Two-connection contention below. The focused hosted API matrix also passed,
as recorded under Deployed boundary evidence. No source revision, full SQL
execution transcript or migration ledger entry was provided.
The three additional compatibility files in the broader command below
(`database.green-storage`, `database.participants-history`, `database.trigger-pli`)
were not part of this reported run. No overall GC-03 gate is declared passed.

From the repository root:

```powershell
npm test -- src/services/database.regional-security.test.js tests/unit/regional-derived-authorization.test.js tests/unit/green-regional-authorization-contract.test.js src/services/database.seats.test.js src/services/database.policy.test.js src/services/supabaseMock.test.js src/services/database.green-storage.test.js src/services/database.participants-history.test.js src/services/database.trigger-pli.test.js tests/unit/repo-docs-contract.test.js
git diff --check
```

Expected: all focused tests pass and no whitespace errors. The new mock tests
cover contention with distinct request identities, independent seats, topology,
approval, client-identity spoofing, scope spoofing, cross-session and cross-region
reads/writes/deletes, unauthorized review/submission, semantic Facilitator RFIs,
sender spoofing, private thread retry access, fixed expiry, explicit rejoin,
replacement revocation, retained note authorship and legacy normalization. Mock
results alone do not prove PostgreSQL authorization or contention.
Source regressions also pin in-place replacement of policy-bound function OIDs,
private compatibility functions and failure on missing prerequisite policies;
these do not compile SQL.
The shared Edge authorization tests cover caller-JWT forwarding, explicit
database approval, denied/malformed responses, missing configuration and network
failure. In a separately authorized rehearsal deployment, run:

```powershell
supabase functions deploy trigger-pli-adjudication
supabase functions deploy pli-report-narrative
```

Use the verified rehearsal project link, never an implicit production target.
Then invoke both functions with regional, cross-session and expired user tokens:
expect HTTP 403 and no GitHub dispatch or Cursor request. A missing helper RPC
also fails closed. Preserve function deployment revisions and request logs.

With a database-owner `PGSERVICE` configured outside Git for a **dedicated
rehearsal database**, verify its complete migration ledger first. Only if GC-03
is absent:

```powershell
$env:PGSERVICE = 'fractured_order_rehearsal'
psql -X -v ON_ERROR_STOP=1 -f data/2026-09-19_green_regional_authorization.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/green-regional-authorization.sql
```

Expected: installation commits once; the regression exits 0, emits
`GC-03 sequential authorization assertions completed; fixtures rolled back`,
then `ROLLBACK`. It assumes the existing project's verified base schema. It
uses actual `SET ROLE authenticated` and distinct JWT subjects. No trigger is
disabled. Any missing object, unexpected rejection or failed assertion blocks
acceptance. The SQL suite creates a synthetic approval only within its rolled
back transaction. It does not approve an exercise roster. Do not use the older
GC-02 activation-closure assertions as expected GC-03 behavior.

### First check when no separate test database is available

The user reported that no test database is available. A generated convenience
file is prepared at
`test-results/green-regional-authorization-rollback-check.sql`. It combines the
current GC-03 migration and sequential SQL suite in one transaction, removes
their individual transaction boundaries, and ends with `ROLLBACK`. The human
supplied the expected final result screenshot; the agent did not execute it.
This ignored file must be regenerated if either source changes.

While nobody is using the application, open the existing project's Supabase SQL
Editor as the database-owner role. Paste and run the **entire file in one
execution**, with no partial selection. Its preflight requires installed GC-02
and absent GC-03; if either condition fails, stop and inspect the reported state.
Do not install the standalone migration first for this check. Do not substitute
`COMMIT` for `ROLLBACK`, run fragments, disable a trigger, or raise timeouts to
force a pass. The check uses a 3-second lock timeout and 30-second statement
timeout; idle transactions time out after 60 seconds. Real table locks can block
other use, and PostgreSQL sequences may advance despite rollback.

Expected final row:

| result | gc03_capability_function | gc03_private_claim | has_revoked_at |
| --- | --- | --- | --- |
| GC-03 rollback-only check completed | NULL | NULL | false |

The human-supplied screenshot matches this row exactly. It documents the final
absence of these two GC-03 functions and the revocation column. The screenshot
does not show the selected SQL, preceding statements/errors, project identity,
execution timestamp or source revision. Sequential-suite success therefore
remains conditional on running the entire prepared file without earlier errors;
the final SELECT alone is not an assertion that every preceding check ran.
Retain the full execution record with the source revision for gate evidence.

That result, with no earlier error, means the sequential assertions completed
and the temporary GC-03 installation and fixture rows were rolled back. GC-02
and pre-existing application records remain; GC-03 is **not installed** afterward.
On error, retain the exact error text and run `ROLLBACK;` in the same connection
if it remains open. An error or timeout is a failed check, not authorization to
run the remaining statements independently.

This is only the next database-validation step. It does not exercise concurrent
connections, hosted REST/RPC requests or Edge Functions, and cannot replace their
acceptance evidence. Those require a separately arranged test environment or a
reviewed, installed-state verification procedure; do not run the committing race
script against an active exercise simply because no separate project exists.

### Subsequent installation in the existing project

After receiving the standalone migration instructions, the human supplied a
second screenshot with `capability_installed`, `claim_wrapper_installed` and
`revocation_column_installed` all `true`. These markers establish the presence
of `green_has_capability(uuid,text)`,
`gc03_legacy_claim(uuid,text,text,text,integer)` and
`session_participants.revoked_at` in the queried database. This supersedes the
earlier absent-state screenshot; do not reapply GC-03 or rerun the combined
temporary-installation script. The screenshot does not verify every policy,
grant or function definition, nor establish concurrent or hosted API isolation.
The full execution record and source revision remain required.

The user has no separate test database and chose installation in the existing
project. The deployment commands target that same project explicitly. From
the repository root, the human runs these commands individually (Node.js 20+
is required for the npm-based CLI):

```powershell
npx supabase login
$gc03ProjectRef = 'REPLACE_WITH_EXISTING_PROJECT_REF'
npx supabase functions deploy trigger-pli-adjudication --project-ref $gc03ProjectRef --use-api
npx supabase functions deploy pli-report-narrative --project-ref $gc03ProjectRef --use-api
```

Use the project reference from the existing dashboard URL, immediately after
`/project/`. Replace the placeholder before deployment. Each deploy must report
success for the named function and the intended project; stop on error and
retain the output. The imported `_shared/authorizeDerivedOperation.js` is bundled
with each function. API bundling does not require Docker or a local database.
See the [Supabase CLI deployment guide](https://supabase.com/docs/guides/functions/quickstart).
The human subsequently supplied CLI success output for both functions on
project `gsromgrxgrwwfywaoyme`. Each command reported uploading its `index.ts`
and `_shared/authorizeDerivedOperation.js`, followed by `Deployed Functions`
for the corresponding function. This is human-run deployment evidence, not an
agent execution or a runtime authorization test. Deployment version IDs,
timestamps and request logs were not supplied. Do not redeploy solely to repeat
this confirmation. Keep existing function secrets. Regional PLI requests remain
denied pending scoped inputs. Subsequent installed-state tests need dedicated fixture sessions
and identities in this project, with their setup and retained evidence reviewed
before use; the rehearsal-only race commands below are not an automatic next step.

The next sequential check in this existing project uses only
`tests/sql/green-regional-authorization.sql`, with GC-03 already installed.
During a quiet period, paste the entire file into a new SQL Editor query as
`postgres` and run it once with no partial selection. Its random fixture session
IDs isolate the assertions from exercise sessions; its final `ROLLBACK` discards
the fixture writes and leaves the installed migration in place. It takes real
locks, has a 30-second statement timeout, and may advance sequences. Do not
substitute `COMMIT`, disable triggers or run the old combined migration/check
file. Expected: no errors, the sequential assertion completion message stated
above, and successful final rollback (the editor may show only a success message
for the last command). Retain the output or first error.

The human subsequently supplied a screenshot showing exactly
`GC-03 sequential authorization assertions completed; fixtures rolled back`.
This matches the installed-state suite's completion message. When the entire
file was executed without earlier errors as instructed, it is evidence that
the sequential assertions completed. The SELECT emitting this message precedes
the final `ROLLBACK`, so the screenshot alone does not independently show the
rollback command completing. Retain the full execution record; no rerun is
requested solely to reproduce the screenshot. The installed GC-03 migration
remains in place after the suite's rollback. Concurrent claims were subsequently
verified as recorded below. The focused hosted API matrix and deployed Edge
denial responses subsequently passed; broader coverage and provenance limits
remain documented below. No overall GC-03 gate is declared passed.

### Two-connection contention

For the user's existing project without a second database, use the
[prepared hosted-verification procedure](gc03-hosted-verification.md). It
generates exact fixture SQL, SQL Editor race pairs, committed-count assertions
and an archive script, and supplies a direct API runner using public credentials
and five separate authenticated test identities. After dashboard coordination
failed, the human ran the automated operator race runner successfully on
`2026-09-18T18:15:51.389Z` through `18:15:56.290Z`. The agent read
`test-results/gc03-hosted/race-results-1789755351389.json`: matching distinct
backends observed actual blocking in both races, and the independent committed
counts were one same-seat winner and two different-region winners. All five
requests returned HTTP 201. The human also supplied 11 passing harness unit
tests across two files. These are human executions, not agent executions.
The API matrix and remaining coverage limits are documented in that procedure.
The `psql` procedure below remains an alternative for a dedicated rehearsal.

Prepare a separate disposable v2 rehearsal session with a synthetic approved
roster using the GC-02 setup procedure. Record its actual ID as
`$env:GC03_RACE_SESSION`. Do not use a participant exercise or manufacture an
approval to unblock production. Set two distinct test identity UUIDs as
`$env:GC03_RACE_USER_A` and `$env:GC03_RACE_USER_B` in the respective terminals.
Run these commands in **two terminals within five seconds**, with the same
database service and session ID:

```powershell
# Terminal A
psql -X -v ON_ERROR_STOP=1 -v "session_id=$env:GC03_RACE_SESSION" -v "auth_user_id=$env:GC03_RACE_USER_A" -v seat_role=green_asian_pacific_scribe -v client_id=gc03-race-a -f tests/sql/green-regional-seat-race.sql
# Terminal B
psql -X -v ON_ERROR_STOP=1 -v "session_id=$env:GC03_RACE_SESSION" -v "auth_user_id=$env:GC03_RACE_USER_B" -v seat_role=green_asian_pacific_scribe -v client_id=gc03-race-b -f tests/sql/green-regional-seat-race.sql
```

Expected: exactly one transaction commits; the other fails with role-full. In
a second fresh disposable session, repeat with B using `green_europe_scribe`:
both must commit with distinct delegation IDs. The race script intentionally
commits test seats, holds the winning transaction five seconds, and times out
instead of waiting indefinitely. Retain its output; archive the fixture session
through the operator RPC afterward. Do not delete evidence to clean up.

### Deployed boundary evidence

The human supplied a successful API run, and the agent read
`test-results/gc03-hosted/api-results-1789755718468.json` for the existing
project and fixture run, from `2026-09-18T18:21:58.467Z` through
`18:22:28.064Z`. Its 112 recorded HTTP responses include authorized operations,
empty RLS-filtered results and expected authorization denials; `passed` is true.
Both deployed functions returned the expected HTTP 403 authorization error for
both regional Facilitators and the other-session identity (six requests).
The [hosted evidence record](gc03-hosted-verification.md#evidence-limits) details
the tested matrix and its limits. This is fresh focused API evidence, not a
complete deployed lifecycle/workflow rehearsal. The human subsequently supplied
the archive result showing all four exact fixture sessions as `archived`;
cleanup is complete and evidence remains retained. Do not rerun these checks
against the archived fixtures.

Capture fresh Supabase REST and RPC responses with distinct authenticated
identities for both regional pairs and a different session. Repeat the SQL
matrix through PostgREST, including GET/PATCH/DELETE, spoofed delegation/sender,
review RPCs, thread retries, stale/revoked identities, and withdrawn operator
grants. Other-region private rows must be absent, forbidden mutations must fail
or affect zero rows, and authorized counterparts must succeed. Preserve deployed
function definitions, grants, restrictive policy inventory, source revision,
migration execution records and timestamps. Retain the successful race report
and submitted SQL sidecars described above, together with the successful API
report. The later completion run supplied revoked/expired-seat checks, note
revisions, full review cycles, recipient retries, timeline/link/derived boundary
checks, deployed versions and six correlated denial logs. The human also
supplied the rollback-only recipient-index success screenshot. GC-03 verification
evidence is complete for the recorded implementation and ready for human
sign-off; no prompt status has been changed by the agent.

The [completion evidence record](gc03-completion-verification.md) identifies
run `78414608-28d8-4e03-b247-b38e5fec3b49`, its successful matrix and archival,
and `logs-results-1789765902941.json` with all three result flags true. It also
records the 45 passing offline tests and the necessary terminal-conflict and
recipient-index repairs. Keep the successful fixtures archived; no repeated
hosted run or redeployment is needed for these results.

## Remaining dependencies and containment

D-02 exercise-owner roster approval remains unresolved. GC-04 through GC-10
still own routes, regional producers, complete workflow/realtime rehearsal and
PLI attribution; GC-11 owns publication/export projections. Regional SME access
to unscoped PLI/shared packets remains closed rather than exposing mixed private
records. Direct participant research capture requires a later scoped server
projection; the raw historical audit chain and operator export remain intact.
These are operational activation dependencies, not evidence of completed play.

On `GC03_SCOPE_DENIED`, `GC03_THREAD_SCOPE_DENIED` or `GC03_SEAT_REVOKED`, retain
the Supabase request correlation, SQLSTATE and function name without private
content, refresh authenticated seat state, and stop the rejected operation.
On `GC03_SEAT_REJOIN_REQUIRED`, offer an explicit rejoin; never silently switch
delegations. `GC03_CLIENT_IDENTITY_CONFLICT` requires restoring the correct auth
identity, not deleting another participant. Revisions, snapshots and revocations
must never be cleared to force a retry. Contain with the unified UI and a forward
repair; preserve all schema, policies and immutable regional evidence.
