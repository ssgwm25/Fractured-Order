# GC-04 local and hosted browser verification

This runner closes the tooling gap between the local browser/SQL checks and a
real deployed participant session. It has not been executed by the coding agent.
No live gate is reported passed until a fresh run supplies the required evidence.

The user supplied a run on 2026-09-18: all 25 selected unit tests passed and
Vite built successfully in 8.76 seconds. Live run
`e82ee015-ee19-4658-b318-7e8df3ee5cfa` failed before its first checkpoint because
the hosted landing page lacked `#checkSessionBtn`. Its retained `results.json`
records `cleanupPassed: true`, successful setup/archive requests, and no manual
observations. Hosted asset names differed from the local build. This indicates
a deployment mismatch, not a successful regional browser test. The shell command
entered at the screen-reader prompt was text, not an executed second command.
The subsequent human run on 2026-09-18 passed all 14 tests in
`gc04-live-check.test.js` and `gc04-live-preflight.test.js` (4.02 seconds).
Local browser run `118695e2-7338-454e-bd56-0861c3920891`, inspected in
`test-results/gc04-live/118695e2-7338-454e-bd56-0861c3920891/results.json`,
completed from 23:19:32 to 23:21:47 UTC using Chromium 143.0.7499.4 at
`http://127.0.0.1:4174/Fractured-Order/` with rehearsal project
`gsromgrxgrwwfywaoyme`. It records 20 checkpoints, no browser errors or asset
failure, `automatedPassed: true` and `cleanupPassed: true`. All four roles
passed hosted Auth, keyboard join/reload/Resume, RPC/RLS isolation, reconnect,
route/storage tampering and operator-removal cleanup checks. Local preflight
also passed. The report retains source hashes and working-tree state alongside
HEAD `2a2ada60cbcee6d96d487bf948248b8651a33ad6`; this does not claim the
uncommitted candidate was deployed or that HEAD alone identifies its contents.

No manual observations were recorded: `manualPassed: false` and `passed: false`
are expected for this automation-only run. Screen-reader observations and a
fresh deployed-site run with deployment provenance remain outstanding. The
earlier failed hosted report is retained unchanged.

## Check the local candidate before committing

No commit or frontend deployment is needed. Local mode serves the production
build under `/Fractured-Order/` and exercises the same four-role matrix against
the configured, migrated **rehearsal Supabase project**. It creates and archives
real synthetic fixtures as described below; this is not an offline/mock run.
No migration or dependency change is required for local mode.

In terminal 1, from the repository root, build and keep the server running:

```powershell
$env:VITE_PUBLIC_BASE_PATH = "/Fractured-Order/"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; do not serve an older dist." }
node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174
```

Open `http://127.0.0.1:4174/Fractured-Order/` to inspect the build yourself.
Rebuild after source edits; this server serves `dist`, without hot reload.
Stop it with Ctrl+C when finished.

In terminal 2, from the same repository root:

```powershell
npm test -- tests/unit/gc04-live-check.test.js tests/unit/gc04-live-preflight.test.js
if ($LASTEXITCODE -ne 0) { throw "Local runner regressions failed." }
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs preflight --local
if ($LASTEXITCODE -ne 0) { throw "Local frontend preflight failed." }
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --local
```

Expected: both unit files pass; preflight finds every required landing control;
the runner records 20 automated checkpoints, no browser/asset failures and
successful fixture archival, exiting 0. Supply your Supabase personal access
token at its concealed prompt. Project selection uses `VITE_SUPABASE_URL` from
the environment or `.env.local`, or asks if neither is available. The build
must use that same rehearsal project. Fixture IDs are generated automatically.
Local mode always targets port 4174 at the URL above, ignoring an older
`PLAYWRIGHT_BASE_URL` value. The default mode still requires deployed HTTPS.

For screen-reader observations, repeat the last command with `--local --manual`
and use an actual running screen reader. Automation alone leaves
`manualPassed` and `passed` false. A complete manual run additionally requires
all 24 observations; never enter a pass without observing the behavior.

Manifests, preflight receipts and reports identify `target: "local"`.
Local success establishes behavior of the served candidate with hosted Auth,
RPC/RLS, reconnect and removal. It does not establish GitHub Pages deployment
or deployed base-path behavior. Retain the separate hosted run and deployment
provenance for that evidence. Historical hosted manifests remain usable for
guarded cleanup. The only added scope is this local verification-tool mode,
its regression tests and these instructions; participant behavior is unchanged.

## Run

Use the existing fully migrated Supabase rehearsal project and a candidate
deployed under its real base path, such as `/Fractured-Order/`. The runner does
not build, deploy, apply migrations, enable Auth providers or alter policies.
Anonymous sign-ins must already work in the chosen project. The installed
Playwright Chromium browser and the repository's existing Node dependencies
are required. No new package or framework is introduced.

The candidate must include the accompanying runtime fixes: regional heartbeats
pause while offline, an expired lease is restored through the authenticated RPC
before one heartbeat retry, and shared startup registers deck cleanup on both
Green workspaces. A server denial still invalidates access. No offline heartbeat
renews the database lease or grants offline write authority. Build that candidate
with `npm run build` (expected: successful Vite production build), then use the
existing human-owned deployment workflow before testing its hosted URL.

`npm run build` does not update GitHub Pages. After the reviewed GC-04 changes
are on `main`, the repository's `Deploy GitHub Pages` workflow publishes on a
push to `main`, or can be dispatched by the human:

```powershell
gh workflow run deploy-pages.yml --ref main
```

Wait for that deployment to finish successfully before the live run. Dispatching
the workflow while GC-04 is only in the local working tree republishes older code.
No deployment was performed by the coding agent.

Check the published landing page without credentials, browser sign-ins or fixtures:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs preflight
```

Expected: required GC-04 landing controls are present and exit code 0. The tool
writes `test-results/gc04-live/preflight-<generated-id>.json` with the fetched
HTML hash and missing controls. A missing control stops with
`GC04_DEPLOYMENT_MISMATCH`. A passing preflight verifies markup availability only;
the full matrix must still verify behavior. Normal runs perform this same static
check before requesting credentials or provisioning any test identity or fixture.

For the complete assisted run, start NVDA with Chrome-compatible Chromium on
Windows, enable its speech viewer if useful, and run:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --manual
```

The tool reads the project reference and public key from the existing
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` configuration in the environment or
`.env.local`. Missing values are prompted. It asks for the deployed app URL
unless `PLAYWRIGHT_BASE_URL` is already set, and securely prompts for a Supabase
personal access token unless `SUPABASE_ACCESS_TOKEN` is already set. The token
must have management access to the rehearsal project. This is the same
management-query mechanism used by the GC-03 hosted tooling. The management
token remains in Node memory and is never placed in browser storage, browser
requests, screenshots or reports. No service-role key is needed.

No session, seat, user, action or grant UUIDs must be copied. The tool creates
the fixtures, exercises them, records evidence and archives the session.
Executing this command authorizes these synthetic rehearsal operations.

For automation only:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs
```

This runs headless and leaves `manualPassed` and overall `passed` false even
when the automated checks succeed. It does not manufacture screen-reader evidence.
In manual mode, type `skip` or `none` at the screen-reader details prompt to
switch to this mode within the same invocation. Pasted shell commands are rejected
with an explanation; they are never executed or accepted as screen-reader details.
Blank input requests details again. Chromium's version is recorded automatically.

## What it verifies

All four regional roles use separate browser contexts and real anonymous Auth
sign-ins through the deployed join form. No mock, response substitution,
preloaded browser credentials or test-only application authority hook is used.
Browser actions use Tab/Enter/Space rather than forcing focus to the target.

For each role, the automated matrix verifies:

- Full delegation/semantic role before join, correct workspace/base path,
  hosted `/auth/v1/user` identity, reload and Resume with the same identity.
- Direct authenticated restore RPC success for the own seat and rejection of
  another region's occupied seat. Direct RLS reads must return only the own
  synthetic draft transport marker, including when the other marker ID is known.
- Offline announcement, a real application-issued restore RPC on reconnect,
  sync recovery and retained seat identity.
- Rejection of changed delegation, role, team, session, observer mode, duplicate
  parameters and wrong workspace. Stale stored Blue identity must be repaired
  from the authenticated seat. Retry on a bad URL must remain blocked.
- Removal via a real session-scoped operator RPC while the tab stays open.
  Production realtime/heartbeat must invalidate the workspace without a test
  refresh or injected store event. Synthetic DOM/private storage probes and
  regional IndexedDB deck data must disappear. Subsequent RPC/RLS access must
  be denied or empty.

Asia-Pacific roles run at 1440x1000; Europe roles run at 390x844. This covers
desktop and narrow layouts, not native mobile screen-reader certification.
The DOM/local-storage/deck probes are explicitly synthetic cleanup checks;
they are not participant-authored evidence or deck assignment approval.

## Screen-reader procedure and evidence

Manual mode opens visible browser windows, asks for screen reader/version,
browser version, OS and tester identifier, then pauses for observation. For
each role it requires an explicit `pass` or `fail` and a nonempty observation
for each of these six steps:

| Step | Observe and record |
| --- | --- |
| Join | Session check result, region/role button names and selected states, complete delegation summary before Join. |
| Workspace | Role and region after reload/Resume; logical browse/tab order and visible focus. At desktop width inspect 200% browser zoom and restore it; at narrow width inspect readable, reachable controls. |
| Offline | Paused-sync announcement and message available without unexpected focus movement. |
| Reconnect | Correct role and region after recovery; navigation remains operable. |
| Permission | Error announced, focus on error, Retry and Return to join reachable, hidden workspace absent from browse/tab navigation. |
| Removal | Access-loss announcement, private content absent from browse/tab navigation, recovery controls reachable. |

Use the actual speech output and keyboard behavior, not the presence of an ARIA
attribute, to decide. The tool brings the relevant page forward and waits before
join, offline and removal transitions. A failed observation aborts the run and
still attempts archival. Blank input never records a pass. Native VoiceOver or
JAWS coverage, if required for the release audience, needs separate observations;
this Chromium/NVDA run does not imply those combinations passed.

## Results and containment

Each run writes `test-results/gc04-live/<generated-run-id>/results.json`,
`manifest.json`, guarded `cleanup.sql`, executed SQL copies and checkpoint PNGs.
The directory is already ignored by Git. Reports retain source revision, dirty
working-tree state, source hashes, fetched HTML/JS hashes, local/hosted target, browser version,
timestamps, request IDs when exposed by the server, status codes and per-role
checkpoints. Headers, Auth tokens, raw Auth payloads, browser storage dumps,
traces and HAR files are not retained. Review screenshots and manual free text
before sharing; they may contain tester observations.

Expected complete result: 20 unique automated checkpoints, 24 recorded manual
observations, no unhandled browser errors or asset failures, and successful
archival. `automatedPassed`, `manualPassed`, `cleanupPassed` and `passed` must
all be true. A failed automated/manual check or cleanup returns exit code 1.
An automation-only successful run returns 0 with `passed: false` and explicitly
reports the outstanding screen-reader evidence.

Deployed hashes bind the observed behavior to fetched assets; they do not by
themselves prove those assets were built from the reported source revision.
Retain the deployment/build provenance with the report before sign-off.
The management inventory/ledger from GC-03 remains a prerequisite, not something
this browser test silently replaces.

Necessary scope expansion includes test fixtures/tooling and the two shared
runtime dependencies in `src/stores/participants.js` and
`src/services/seatBootstrap.js` described above. The runner
commits one synthetic v2 session, an empty synthetic roster approval fixture,
one temporary session-scoped operator grant, and two unsubmitted regional draft
transport markers. It creates real anonymous test Auth identities. It never
submits decisions, runs scoring, reviews/forwards proposals, changes represented
countries, relabels unified records or edits existing exercise sessions.

The session and its evidence are archived rather than deleted; the operator
grant is removed. Test Auth identities remain as retained test identities;
this runner does not delete users or require administrative Auth credentials.
Browser contexts close and the Node operator session signs out on completion.
If setup times out, exact fixture presence is inspected before cleanup; a
timeout is never assumed to mean rollback. If archival fails, the report prints
an exact `cleanup` command containing the generated run ID. Run that printed
command; it verifies fixture identity and archives only that session. It writes
a separate cleanup receipt and does not rewrite a failed browser result as a pass.

## Narrow regression command

```powershell
npm test -- tests/unit/gc04-live-preflight.test.js tests/unit/gc04-live-check.test.js tests/unit/gc04-sql-runner.test.js src/stores/participants.gc04-context.test.js src/services/seatBootstrap.deck-cleanup.test.js src/stores/participants.test.js src/services/seatBootstrap.test.js
```

Expected: all seven selected files pass. These check deployment preflight and prompt handling,
credential redaction, URL validation,
fixture containment, offline/server-denied heartbeat behavior, shared deck cleanup,
SQL-runner usability and completeness rules for automated/manual evidence.
They do not execute hosted operations or prove the live matrix passes.
