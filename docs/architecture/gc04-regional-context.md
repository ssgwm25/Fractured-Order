# GC-04 join, routing and persistent regional context

Human-run unit, build, local browser and database SQL checks have passed as
reported below. The local frontend also passed the automated matrix against
real rehearsal Supabase. Screen-reader and deployed-site verification remain
outstanding; GC-04 is not signed off.

Participants enter the session code and use **Check session**, choose Green,
choose Asia-Pacific or Europe, then choose Scribe or Facilitator. The complete
delegation and semantic role appear above Join Session and in the join status.
Discovering a regional session during submission pauses for explicit delegation
selection. Regional Notetaker seats are not added to the public chooser by GC-04.
Existing legacy Notetaker routes remain supported.

| Semantic seat | Persisted role | Workspace |
| --- | --- | --- |
| Asia-Pacific Scribe | `green_asian_pacific_scribe` | `teams/green/facilitator.html?delegation=asian_pacific` |
| Asia-Pacific Facilitator | `green_asian_pacific_facilitator` | `teams/green/scribe.html?delegation=asian_pacific` |
| Europe Scribe | `green_europe_scribe` | `teams/green/facilitator.html?delegation=europe` |
| Europe Facilitator | `green_europe_facilitator` | `teams/green/scribe.html?delegation=europe` |

Legacy role inversion is unchanged. URLs use the existing Vite base path and
page entries; no new page or build architecture is required. Historical unified
Green records, roster membership, White Cell review, PLI scoring and proposal
thread revisions are unchanged.

## Server boundary and recovery

Apply `data/2026-09-22_gc04_session_context.sql` after the September 18–21
migrations, once in a dedicated rehearsal project before the matching frontend.
The latest lookup definition inspected was August 18; August 26 keeps retired
training sessions closed. The latest claim/heartbeat wrappers are September 19;
September 20/21 replace workflow functions/indexes, not seat authority.

`lookup_joinable_session_by_code` now requires authenticated identity and returns
`session_topology_version`. Missing topology is a setup error, never assumed v1.
`restore_session_seat_context(session UUID, seat UUID)` resolves `auth.uid()`
to the existing seat and derives role/client identity on the server. It rejects
foreign, ambiguous, revoked and non-live seats. It calls the GC-03 claim wrapper
to recover disconnected/stale seats, retaining capacity locks and replacement
tombstones. It never accepts a role or delegation parameter.
Regional page navigation retains the seat lease to avoid a late disconnect
racing reload recovery. Explicit logout releases the seat; closing a tab lets
the existing 90-second lease expire.

Browser storage is a rejoin hint. Confirmed scope exists only in memory and must
be restored before shared controllers or protected sync start. A missing URL
delegation is restored from the seat; conflicting or duplicate authority hints,
wrong workspaces, wrong base paths and observer-mode substitution are rejected.
The historical observer path without a participant seat remains separate.

Heartbeat and realtime revocation invalidate the confirmed scope. Reconnect
revalidates the seat before refreshing data. Authentication/permission loss
blocks the workspace and clears its scoped browser state. Transient validation
failure also blocks, with keyboard-accessible Retry and Return to join controls.
The existing sync banner supplies offline, reconnecting, degraded and retry
states. No offline write authority is granted.

Regional heartbeats pause during known browser-offline periods, preserving the
rejoin context without renewing the server lease. A stale-lease heartbeat on
reconnect uses the authenticated restore RPC before one retry; a denied restore
still clears access. Shared startup registers regional deck cleanup for both
legacy workspaces, including semantic Scribes that do not read uploaded decks.

Local keys include session, topology, parent team, delegation (or explicit
unified identity), role and seat. Scoped draft/local-state lookup never searches
legacy fallback keys. Notification read/dismiss state, onboarding and deck
sidebar preferences are scoped. Existing in-memory draft maps are discarded with
the inaccessible workspace; no draft decisions are synthesized. Logout, seat
change and removal clear scoped state while retaining server evidence and
unrelated historical export keys.

Uploaded deck keys accept an explicit delegation:
`scribe-deck:SESSION:green:europe` or `scribe-deck:SESSION:green:asian_pacific`.
Regional readers reject a unified or other-region uploaded key before IndexedDB
access. Seat invalidation requests removal of that regional browser deck;
storage failures cannot grant access. Repository briefing material is still
shared historical material. Regional deck authoring/assignment controls are a
later-prompt dependency; a rejected assignment presents the existing deck error
and retry state. Do not relabel the historical briefing as regional approval.

## Human verification

No commands below were executed by the coding agent.

### Reported verification results

The user supplied a terminal transcript showing the commands below completed:

- Vitest: 8 test files and 65 tests passed (3.20 seconds).
- Vite: production build succeeded (172 modules, 9.60 seconds).
- Playwright: all 5 GC-04 browser tests passed (27 seconds).

The local `test-results/playwright-gate-summary.json` also reports 5 tests,
no skipped tests, no retries, no browser errors and no violations;
`test-results/.last-run.json` reports no failed tests. These artifacts do not
identify a candidate commit or establish hosted Supabase authorization evidence.
The build emitted nonfatal mixed static/dynamic import and chunk-size warnings.
The user subsequently reported successful installation of
`data/2026-09-22_gc04_session_context.sql` in Supabase with no errors. The first
SQL regression attempt in SQL Editor failed to parse at the psql-only `\set`
command; that failed attempt is not an authorization-test result.

After the self-contained runner replaced manual fixture parameters, the user
supplied fresh evidence:

- Terminal transcript: `tests/unit/gc04-sql-runner.test.js` passed all 3 tests
  in 1.46 seconds (reported start time 18:25:36).
- Supabase SQL Editor screenshot: all four regional roles returned `PASS`,
  each with `assertions_passed = 9`, for 36 successful SQL assertions. The
  screenshot shows the script ending with `ROLLBACK`.

These results establish the runner contract and the SQL matrix under simulated
JWT claims on the tested database. The screenshot does not identify the project
or candidate commit. At that stage, hosted Auth/browser integration,
operator-removal UI cleanup and manual accessibility evidence remained outstanding.

The subsequent hosted-run transcript reports 25 tests passing across six files
and a successful 8.76-second build. Live run
`e82ee015-ee19-4658-b318-7e8df3ee5cfa` failed at the missing deployed
`#checkSessionBtn` before any checkpoint; its saved report confirms successful
fixture archival. The deployed frontend needs the GC-04 changes. The hosted
runner now checks landing markup before provisioning and rejects shell commands
at its screen-reader prompt; see the live verification procedure for recovery.

The subsequent local run on 2026-09-18 passed all 14 runner/preflight unit tests
(two files, 4.02 seconds). Saved browser report
`test-results/gc04-live/118695e2-7338-454e-bd56-0861c3920891/results.json`
confirms `target: "local"`, 20 checkpoints, no browser errors or asset failure,
and successful automatic archival against rehearsal project
`gsromgrxgrwwfywaoyme`. All four roles passed real hosted Auth, keyboard joins,
reload/Resume, RPC/RLS isolation, offline/reconnect, route/storage tampering and
operator-removal DOM/storage/deck/authority cleanup. Chromium was 143.0.7499.4;
the frontend was served at `http://127.0.0.1:4174/Fractured-Order/`.
The report records source hashes and working-tree state with HEAD
`2a2ada60cbcee6d96d487bf948248b8651a33ad6`; the tested candidate included
uncommitted changes. No manual observations were recorded, so `manualPassed`
and overall `passed` remain false. This supplies local integration evidence
without claiming deployed routing, deployment provenance or screen-reader approval.

### Reproduction commands

```powershell
npm test -- src/core/seatContext.test.js src/services/seatBootstrap.test.js src/services/database.seat-context.test.js src/roles/landing.join.test.js src/core/teamContext.test.js src/core/navigation.test.js src/stores/session.test.js tests/unit/repo-docs-contract.test.js
npm run build
node --preserve-symlinks --preserve-symlinks-main ./node_modules/@playwright/test/cli.js test tests/e2e/gc04-regional-context.e2e.js
```

Expected: all assertions pass; build succeeds; all five browser cases pass.
Browser fixtures are synthetic and local only. They verify the four keyboard
joins, full-seat feedback, reload, deep-link restoration and tampered storage/
queries. They are not live Supabase authorization evidence.

For **Supabase SQL Editor**, paste the entire
`tests/sql/gc04-session-context-editor.sql` file and run as `postgres` against
the migrated rehearsal project. No placeholders, manual UUIDs, existing seats
or pre-created Auth accounts are needed. Do not reinstall the successful migration.

The suite generates two isolated session IDs, four distinct synthetic identities
and an empty synthetic roster fixture, then claims the four regional seats via
the installed RPC as `authenticated`. The empty roster follows the GC-03 SQL
test pattern; it neither adds represented countries nor approves an exercise.
Every fixture and lease/revocation write is inside the final rolled-back
transaction. No existing exercise is selected or modified, and no participant
decisions or artifact revisions are created. Run the whole file, including
`BEGIN` and `ROLLBACK`.

Expected: **four result rows, each with status `PASS` and `assertions_passed = 9`**,
and no errors. The 36 assertions cover join, topology lookup, restored seat
identity, semantic/legacy workspace mapping, foreign-seat denial, wrong-session
denial, disconnected rejoin, stale rejoin and revoked-seat denial. Negative tests
require the intended seat-authorization exception, not an unrelated SQL error.
Foreign seats are active when ownership is checked. A failed assertion aborts
the transaction; it cannot produce a complete passing matrix.

This tests the installed database functions under simulated JWT claims, not
Supabase Auth token issuance or browser/live RLS integration. The user-supplied
SQL Editor results above cover this expanded 36-assertion suite.

For the terminal alternative, set `GC04_DATABASE_URL` to the rehearsal database
connection and run the same suite through its psql entry point:

```powershell
psql "$env:GC04_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/gc04-session-context.sql
```

Expected: the same four passing rows, `ROLLBACK`, and exit code 0. The psql
wrapper's `\set`/`\ir` commands are for the terminal only. SQL Editor uses the
full editor file directly. Neither runner has been executed by the coding agent.

The narrow runner contract checks prevent recurrence of SQL Editor placeholders
and client commands, keep both entry points on one suite, and guard rollback:

```powershell
npm test -- tests/unit/gc04-sql-runner.test.js
```

Expected: all three checks pass. These source checks do not execute PostgreSQL
and cannot establish that the SQL assertions pass on the installed database.

Also verify on the freshly built candidate at `/Fractured-Order/`: all four
roles retain region after reload and Resume; changing `session`, `delegation`,
`role`, `team`, `mode` or the workspace path blocks access. Inspect direct
authenticated RPC/RLS requests from separate identities, not only browser
filters. Remove a seat as operator and check that its open tab loses private
content and local keys. Check offline/reconnect and denied storage with keyboard
and screen reader at mobile and desktop widths.

Before committing, use the [local candidate procedure](gc04-live-verification.md#check-the-local-candidate-before-committing)
to build and serve `/Fractured-Order/`, then run the runner with `--local`.
This uses real rehearsal Supabase and automatically generated fixtures. Reports
identify the local frontend explicitly; deployment evidence remains separate.
The local automated matrix passed in the human run recorded above.

The self-contained [hosted browser runner](gc04-live-verification.md) now
implements the live verification workflow, including generated fixtures,
real browser Auth/RPC/RLS checks, routing, reconnect, operator-removal cleanup,
recorded screen-reader observations and automatic archival. Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --manual
```

It prompts for deployment/credential inputs when not configured, never for
fixture UUIDs. Expected: 20 automated checkpoints, 24 manual observations and
successful archival. The first hosted run failed on deployment mismatch as
recorded above; no passing full-matrix result has been supplied yet.

## Dependencies and evidence still required

- The user reported successful GC-04 migration installation and supplied passing
  SQL results. Retain the target project's verified migration ledger, including
  GC-02/03 and the September 20/21 fixes, with the candidate evidence.
- Roster approval and v2 activation remain operator-owned dependencies. This
  change does not approve or expand a represented roster.
- Regional artifact authoring/handoff and communication/deck assignment flows
  remain GC-05–07 scope. This change preserves their server authorization and
  does not claim end-to-end regional workflow completion.
- Unit/build/browser and SQL results are reported above. Local frontend integration
  with hosted Auth/RPC/RLS, keyboard operation, removal cleanup and reconnect is
  supported by run `118695e2-7338-454e-bd56-0861c3920891`. Manual screen-reader
  observations and a fresh deployed-site matrix with candidate/build/deployment
  provenance remain required. The local report records the project, source hashes
  and uncommitted working-tree state; it does not establish deployed behavior.

For lookup/restore permission errors, verify identity, live session status,
revocation and installed function definitions. For full seats, select an
available seat or ask the operator to review the roster. For missing topology/
RPC, apply the verified forward migration; never restore broad legacy policies.
Contain a frontend problem with a compatible reader and retain the additive
functions, ownership columns, tombstones and historical evidence. Do not undo
regional ownership or replay old schema snapshots as rollback.

## Change inventory

GC-04 changes these files (pre-existing GC-02/03 edits in shared files are retained):

- Join and page identity: `index.html`, `src/roles/landing.js`,
  `teams/green/facilitator.html`, `teams/green/scribe.html`.
- Context and startup: `src/core/teamContext.js`, `src/core/seatContext.js`,
  `src/services/seatBootstrap.js`, `src/stores/session.js`, `src/main.js`.
- Necessary shared-controller/lifecycle dependencies: `src/roles/facilitator.js`,
  `src/roles/scribe.js`, `src/roles/notetaker.js`, `src/stores/participants.js`,
  `src/services/sync.js`.
- Persistence dependencies: `src/utils/keyGenerator.js`,
  `src/components/ui/DurableNotification.js`, `src/features/scribe/deckStorage.js`.
- Server and mock adapter: `src/services/database.js`, `src/services/supabaseMock.js`,
  `data/2026-09-22_gc04_session_context.sql`.
- New regression files: `src/core/seatContext.test.js`,
  `src/services/seatBootstrap.test.js`, `src/services/database.seat-context.test.js`,
  `tests/e2e/gc04-regional-context.e2e.js`, `tests/sql/gc04-session-context.sql`,
  `tests/sql/gc04-session-context-editor.sql`, `tests/unit/gc04-sql-runner.test.js`.
- Extended regressions: `src/roles/landing.join.test.js`, `src/stores/session.test.js`,
  `tests/unit/repo-docs-contract.test.js`.
- Hosted verification tooling: `scripts/gc04-live-check.mjs`,
  `scripts/gc04-live-contract.mjs`, `scripts/gc04-live-browser.mjs`,
  `scripts/gc04-live-preflight.mjs`, `tests/unit/gc04-live-preflight.test.js`,
  `tests/unit/gc04-live-check.test.js`, `src/stores/participants.gc04-context.test.js`,
  `src/services/seatBootstrap.deck-cleanup.test.js`.
- Documentation: this file, `docs/architecture/gc04-live-verification.md`,
  `docs/supabase-setup.md`, `docs/supabase-rollback.md`.

`src/core/navigation.js` and `vite.config.js` were inspected and require no
changes: the existing base-path builder and Green page entries are reused.
The prompt handbook was not edited. No gate status was changed.
