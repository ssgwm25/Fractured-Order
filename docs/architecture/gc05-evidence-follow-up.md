# GC05 evidence follow-up

The human accepted GC05 for the tested local frontend and hosted Supabase scope,
retaining the recorded evidence limitations. This follow-up supplies tooling for
three new evidence captures. It does not change orientation permissions, roster
approval, creation workflows, PLI scoring or historical evidence. No checks,
builds, migrations or deployments were executed by the agent.

The implementation adds `scripts/gc05-evidence.mjs` and its pure contract module,
extends the existing GC05 browser configuration, and adds a separate deployed
route spec and narrow unit tests.
These are necessary verification dependencies. Production runtime code and the
installed migration remain unchanged. The earlier hosted report remains evidence
for its recorded source; these additional checks do not rewrite it.

## Run first: tooling regressions

From the repository root in PowerShell:

```powershell
npm test -- tests/unit/gc05-evidence.test.js tests/unit/gc05-browser-config.test.js tests/unit/gc05-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 evidence tooling checks failed.' }
```

Expected: all cases in all three files pass, none skipped. These cover report
containment, unchanged SQL assertion content, rollback receipt validation,
incomplete/duplicate assertion rejection, source mismatch, deployed workflow/asset
mismatch, and blocking backend access during deployed route checks.
They do not execute SQL, build the app, launch a browser or call the network.

The first human run reported **33 passed and 1 failed across three files**,
Vitest 1.6.1, start `01:11:20`, duration `8.52s`. All 30 evidence-contract cases
and three SQL structure cases passed. The browser configuration test exceeded
Vitest's 5000 ms timeout (reported duration 7012 ms); no containment assertion
failure was reported. The transcript supplies no calendar date or source hash.

That unit test imported the Playwright runner merely to call `defineConfig`.
It now stubs only that third-party wrapper as an identity function while still
evaluating the real repository configuration and all containment assertions.
The configuration uses one object, so no Playwright merge/default behavior is
needed by this test. This removes the heavyweight import from the unit check;
it does not establish the precise cause of the machine's delay. Neither timeout
limits nor production/browser configuration were changed. Preserve the timed-out
run as historical evidence.

The subsequent human rerun passed **34 tests across all three files**, none
reported skipped, using Vitest 1.6.1. Its supplied transcript records start
`01:13:19` and duration `681ms`; no calendar date or source hash is supplied.
This verifies the corrected tooling suite for that run. It does not execute or
establish SQL, browser or deployment evidence. The subsequent SQL result is below.

Each collector command below asks for an operator name/initials. Optionally set
`GC05_EVIDENCE_OPERATOR` once to your actual operator label. Every invocation
creates a unique `output/release-evidence/gc05/<run-id>/` directory and prints its
absolute `results.json` path. Retain the entire directory in the approved evidence
store; it is intentionally ignored by Git. No previous report is overwritten.
Failed runs have `passed: false`; an interrupted run without a completed report
is incomplete evidence, never a pass.

## 1. Capture fresh SQL metadata and rollback proof

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc05-evidence.mjs sql
if ($LASTEXITCODE -ne 0) { throw 'GC05 SQL evidence collection failed; retain its report.' }
```

The target comes from the existing rehearsal `VITE_SUPABASE_URL` configuration.
Confirm the printed project reference is the intended rehearsal project
(`gsromgrxgrwwfywaoyme` for the accepted hosted run). Enter the Supabase personal
access token only at the hidden terminal prompt. A read-only management probe
must succeed before any fixture SQL executes. No migration is applied.

The collector saves the exact original suite and submitted SQL, their SHA-256
hashes, the migration source/hash, Git revision and working-tree source hashes,
operator, target project, HTTP/request receipts, client/server UTC times,
database role/version, RLS setting, and a read-only snapshot of relevant installed
functions, policies and triggers.

The existing suite's assertion block executes unchanged inside an additional
PL/pgSQL subtransaction. After collecting its 102 assertions and fixture IDs, a
deliberate exception rolls back all fixture writes. The outer block then checks
that the temporary fixture relation and exact session, roster, operator-grant
and seat rows are absent before returning a receipt. Variables retain the
assertions across the rollback; no fixture or production object is committed.
Unexpected errors also abort fixture writes and cannot produce a passing receipt.
This is labelled **fixture subtransaction rollback** rather than pretending to
be the original SQL Editor transaction's historical rollback receipt.

Expected: `sqlPassed: true`, `passed: true`, 102 distinct `PASS` assertions,
`sql.rollbackVerified: true`, and all four `*Remaining` counts zero. RLS remains
enabled; the suite exercises its authenticated-role checks as before. This is
real SQL/RLS with synthetic claims, separate from the already supplied hosted
Auth-token rehearsal.

This new result closes the missing metadata for a **new** SQL rehearsal. It
cannot recover the old screenshot's installation time or the old transcript's
execution details. Keep those historical limitations labelled. The installed
schema snapshot describes current state, not a fabricated migration ledger entry.

The human subsequently ran SQL collection successfully as operator `Sethu`,
against project `gsromgrxgrwwfywaoyme`. The inspected report is
`output/release-evidence/gc05/43d91357-72e2-4009-b770-af295db157b1/results.json`.
Client times are `2026-09-19T05:14:11.606Z` through
`2026-09-19T05:14:40.124Z`; server assertion times are
`2026-09-19T05:14:37.53208+00:00` through `2026-09-19T05:14:39.076076+00:00`.
It records **102 distinct assertions, all PASS**, `sqlPassed: true`,
`passed: true`, `rollbackVerified: true` and all four remaining-row counts zero.
The database and role are `postgres`, PostgreSQL version is 17.6, and
`rowSecurity` is `on`. Preflight, installed-schema capture and assertion/rollback
requests each returned HTTP 201; request IDs were not supplied by the endpoint.

The recorded source revision is `8b29a62609c653b09cf35f807d299d8f3a26c794`, with
working-tree source hashes in the report. Read-only follow-up confirmed these
two hashes match the current files:

- SQL suite: `22920e5d6fb967346c0df9739852da3577cd659c6ca1aede1ed321f68e1fa18a`.
- Migration source: `4d07a0078a11e5fbc2b3e2afb01bf80cbab41913ed2ac341f07760be158040ea`.

This supplies fresh SQL metadata and rollback evidence. No migration was applied
and no cleanup retry is needed. The original incomplete SQL transcript remains
historical; this report does not invent its execution or installation metadata.
The subsequent root-path browser result is recorded below.

## 2. Retain a new root-path browser report

The first collected root-browser attempt,
`86b9b20c-5a7d-44aa-ac57-e230a62bdb3d`, failed before browser tests ran because
`http://127.0.0.1:4174/` was already in use. Its report spans
`2026-09-19T05:17:06.942Z` through `2026-09-19T05:17:24.222Z` and retains
`passed: false`. The fresh build succeeded in 8.16s. Preserve the report and
`browser.log` under `output/release-evidence/gc05/86b9b20c-5a7d-44aa-ac57-e230a62bdb3d/`;
this is a server-startup failure, not an orientation assertion failure.
Read-only follow-up observed PID 32996 listening on that port, but process
command-line access was denied in the agent environment. Its identity was not
verified and no process was stopped. Keep `reuseExistingServer: false` so an
unidentified server cannot satisfy the fresh-build check.

Ensure the previous manually started server on port 4174 has been stopped in
its own terminal. The runner requires the port and does not reuse another server.
The following guarded command was supplied for PID 32996 during the failed run
and is retained as recovery history. Do not rerun it as a routine prerequisite;
for a future port conflict, identify the current owner. It checks the process's
command line before stopping only a matching static test server.

```powershell
$gc05Server = Get-CimInstance Win32_Process -Filter 'ProcessId = 32996' -ErrorAction Stop
if ($gc05Server) {
    if ($gc05Server.CommandLine -notmatch 'tests[\\/]e2e[\\/]support[\\/]staticServer\.mjs"?\s+dist\s+4174(?:\s|$)') {
        throw 'Process is not the expected static test server; do not stop it.'
    }
    Stop-Process -Id 32996 -ErrorAction Stop
}
```

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc05-evidence.mjs browser-root
if ($LASTEXITCODE -ne 0) { throw 'GC05 root browser evidence collection failed; retain its report.' }
```

This explicitly builds a fresh root-path candidate into local `dist`, starts the
existing static test server and runs the two GC05 browser cases. It does not
deploy. The child processes receive the base-path setting without changing your
parent terminal environment. The new root build replaces local `dist`; rebuild
with the project base before using that directory for a project-path rehearsal.

Expected: `browserPassed: true`, `passed: true`, exactly two expected tests, zero
skipped/unexpected/flaky tests and no runner errors. The unique directory contains
`browser.json`, `browser.log`, `build.log`, source hashes and built HTML/JS/CSS
hashes. Browser cleanup targets only that run's `artifacts/` child, leaving all
reports outside it. Source changes during a run cause failure.

This is a fresh run, not recovery or reconstruction of the lost
`test-results/gc05-browser/results-root.json`. Preserve the old passing transcript
and its missing-file note. The new report must keep its own date and run ID.

The subsequent human run by `Sethu`,
`4d890589-c8e8-46c6-877c-638e13f942f2`, passed. Its inspected report at
`output/release-evidence/gc05/4d890589-c8e8-46c6-877c-638e13f942f2/results.json`
spans `2026-09-19T05:24:32.579Z` through `2026-09-19T05:25:20.686Z`, with
`browserPassed: true`, `passed: true` and no error. The separate `browser.json`
records **2 expected tests, zero skipped, unexpected or flaky tests, and no
runner errors**, starting `2026-09-19T05:25:01.621Z` and lasting 16.8s.
Both independent submissions/deferred notices and returned-note/waiting/corrected
resubmission controls passed against `http://127.0.0.1:4174/` with the synthetic
mock. Read-only inspection confirmed the retained browser JSON matches its
recorded SHA-256 `1eb338b842811f2df2f20fef53c7b62feecc250115c6f5fccfa9a7cebfa34102`.

The source revision is `8b29a62609c653b09cf35f807d299d8f3a26c794`; the report
records an uncommitted working tree and its source hashes. This is fresh local
browser evidence, not a clean published-commit or deployed-browser result. The
lost historical JSON remains lost; this new report supplies a separately dated
replacement rehearsal. Preserve the earlier failed port-conflict run unchanged.

## 3. Verify the deployed routes and assets

Prerequisites: the candidate changes have already been committed and published
through the normal Pages workflow by the human, the checkout is clean at that
published commit, and local public Supabase build configuration matches Pages.
This collector will not commit, push, deploy or modify GitHub settings. A dirty
checkout, older deployment, missing workflow evidence or asset mismatch remains
an explicit failed check rather than a reason to weaken verification.

The repository currently documents this website URL; use the actual target if
it differs:

```powershell
$env:GC05_DEPLOYED_URL = 'https://ssgwm25.github.io/Fractured-Order/'
node --preserve-symlinks --preserve-symlinks-main scripts/gc05-evidence.mjs deployed
if ($LASTEXITCODE -ne 0) { throw 'GC05 deployed verification failed; retain its report.' }
```

At the terminal prompt, paste the successful **Deploy GitHub Pages** Actions run
URL. Find it in the repository's **Actions → Deploy GitHub Pages → successful
run**, and copy the browser URL (`https://github.com/OWNER/REPO/actions/runs/NUMBER`).
Alternatively set `GC05_DEPLOYMENT_RUN_URL` to that URL before running.

The collector now asks for a **GitHub personal access token** at a hidden prompt.
For this repository's restricted workflow metadata, use a fine-grained token
whose resource owner/repository access includes `ssgwm25/Fractured-Order`, with
**Actions: read** repository permission. Create it under GitHub Settings >
Developer settings > Personal access tokens > Fine-grained tokens. Follow any
required owner approval for the repository. This is a GitHub credential, not the
Supabase token used for SQL. GitHub documents the read permission for
[Get a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run).

Paste the token only at the hidden terminal prompt. Do not place it in chat,
shell command history, `.env.local` or a `VITE_` variable. The collector holds it
in the Node process, sends it only in the Authorization header of the derived
`https://api.github.com/repos/.../actions/runs/...` GET request, rejects redirects,
and redacts it from response/error evidence. It is not passed to build or browser
child processes. No new credential environment variable is introduced.
An empty entry preserves unauthenticated access for public runs; noninteractive
execution also remains public-only. A failed authenticated request is recorded
without falling back to anonymous access or skipping provenance checks.

The change adds `scripts/gc05-github.mjs`, integrates it in
`scripts/gc05-evidence.mjs`, and adds `tests/unit/gc05-github.test.js`; this runbook
is the fourth changed file. No application, migration or workflow permission is
changed. The supplied unauthenticated failure remains at
`output/release-evidence/gc05/f0b534aa-1d84-4d1c-9207-6a648c9fb599/results.json`:
HTTP 404, `passed: false`, from `2026-09-19T05:40:36.386Z` through
`2026-09-19T05:40:40.568Z`. It recorded a clean checkout at
`a2905cbe1942a8241445256c7d1560dc217363e6`. The human confirmed that the referenced
successful run is visible when signed into GitHub. No deployed browser checks
ran in that attempt, and its result is not rewritten.

First verify the authentication correction (no network, SQL or browser launch):

```powershell
npm test -- tests/unit/gc05-github.test.js tests/unit/gc05-evidence.test.js tests/unit/gc05-browser-config.test.js tests/unit/gc05-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05 authenticated evidence tooling checks failed.' }
```

Expected: **49 tests pass across four files**, without skips. The 15 new cases
cover authenticated/public requests, exact GitHub destination, redirect refusal,
malformed token rejection, error/receipt redaction, HTTP failures and malformed
JSON. Existing clean-commit, workflow and asset checks remain in force. These
tests have not been executed by the agent.

The human supplied a successful rerun: **49 tests passed across all four files**,
none reported skipped, using Vitest 1.6.1. The transcript records start
`01:52:20` and duration `1.65s`; it supplies no calendar date or source hash.
This includes all 15 authenticated-lookup regressions. It does not establish
live GitHub access or a deployed-site pass.

Next, review and commit these four changed files through the normal
release process and use the successful Pages run for that new commit. The older
run URL for commit `a2905cb` cannot prove a later commit. Ensure the checkout is
clean and update `GC05_DEPLOYMENT_RUN_URL` to the new run URL (or remove that
environment variable so the collector asks for it). Then execute the deployed
command above and supply the GitHub token when prompted. This correction does
not authorize the agent to commit, publish, or execute verification commands.

The collector fetches that workflow receipt, requires a successful Pages run
whose SHA matches the clean checkout, builds the matching base locally, then
compares HTTP 200 responses and exact SHA-256 bytes for every built HTML, JS and
CSS file. This includes direct Green Scribe/Facilitator and White Cell page URLs
and the landing directory URL. Redirects, stale files and missing routes fail.
It then runs two dedicated checks against the deployed URL without starting a
local server: landing controls/reload with the mock disabled, and direct Green
workspace URLs retaining the unauthenticated seat gate and Return to join path.
All write requests and Supabase requests are blocked; any attempted backend
access fails the check. Service workers are blocked so they cannot bypass request
interception. The deployed spec is excluded from ordinary local runs; the
explicit deployed collector requires both cases to run without skips.

Expected: `deployedAssetsPassed: true`, `browserPassed: true`, `passed: true`,
a matching successful workflow receipt, and two passing browser cases with no
skips, failures or flakiness. Keep the unique browser JSON and HTTP/hash receipts.

The production mock remains disabled, preserving its localhost-only boundary.
These are unauthenticated deployed browser checks, not synthetic orientation
submissions on a hosted origin. Orientation controls/deferred notices retain
their separate local browser evidence; served code identity is checked through
the asset comparison. A new end-to-end deployed real-session workflow and the
entire production release matrix are outside this collector. The accepted real
Auth/RPC evidence remains separate. Manual screen-reader checks,
operational roster/creation approval and broader deployment release gates are
not passed by this collector.

## Evidence status

The tooling rerun passed 34 tests, and the fresh SQL collection passed 102
assertions with verified fixture rollback and recorded metadata as detailed
above. The fresh root-path browser collection passed both cases and its saved
JSON hash was verified. Deployed verification still awaits a clean checkout
matching a published Pages commit, its successful workflow run URL, and human
execution of the deployed collector with authenticated workflow access. The
authentication tooling now has a supplied 49-test passing run, including the 15
new cases. That correction must be committed before using the deployed collector.
The current working tree is uncommitted;
do not treat the local browser pass as deployment provenance. The historical
GC05 acceptance remains scoped as stated by the human; it is not automatically
expanded when tooling is added. Record actual result paths, times and outcomes
after execution.
