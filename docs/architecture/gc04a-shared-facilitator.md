# GC-04A: Shared Green Facilitator foundation

Implementation supplied; **not verified**. No tests, npm commands, migrations or
deployments were executed by the agent. The prompt-book status remains for the
human to update after fresh evidence. Earlier GC-04 four-seat results remain
compatibility evidence and do not pass this new model.

## Model and authorization

| Session | Persisted model | Public Green entry paths |
| --- | --- | --- |
| Historical/unified topology 1, including historical NULL topology | NULL | Existing Scribe and Facilitator; existing Notetakers unchanged |
| Existing regional topology 2 | NULL (`regional_pairs_v1` in responses) | Existing four regional roles |
| New shared staffing, topology 2 | `shared_facilitator_v1` | Asia-Pacific Scribe, Europe Scribe, one shared Green Facilitator |

The new `green_shared_facilitator` role has semantic role Facilitator, capacity
one, and the legacy `teams/green/scribe.html` deck workspace. Its owning
delegation is NULL; this does not make it a unified Green owner. Regional
Scribes retain their explicit names and legacy `facilitator.html` workspace.
The two existing regional Notetaker slots remain unchanged and are not added
to the public chooser. No represented entities, roster approvals, decisions,
artifact revisions, PLI scores or historical records are changed.

`configure_session_green_shared_facilitator(sid, roster_version)` requires a
Game Master grant, an active live session, an existing approved roster and no
seats/evidence/freeze. It serializes with claims on the session row, performs
both topology/roster and model writes atomically, and rejects later conversion.
The database adapter is `database.configureSessionGreenSharedFacilitator`.
GC-08 will expose this through normal Game Master creation controls. No current
session, including PLENUM2026, is converted by installing this migration.

Server lookup and restore return `green_seat_model`. Claims also return the
model frozen by the claim, closing the lookup/claim race. Authority comes from
`auth.uid()`, the active session seat, the model and the existing 90-second
lease. A unique index and serialized claim RPC enforce capacity. Regional
Facilitator claims are rejected in the shared model, and the shared role is
rejected in old models. Removal retains tombstones and original evidence.

The shared foundation reads only Green actions in
`forwarded_to_facilitator`, `submitted_to_white_cell` or `completed`, plus
explicitly addressed/shared White Cell non-thread messages and ordinary
session/seat context. Drafts, returned drafts, notes, recipient proposal threads,
other teams, unscoped derived records and shared operational writes are denied.
Existing restrictive RLS still intersects every permissive policy. The mutation
trigger also denies shared writes, including SECURITY DEFINER paths that bypass
RLS. No legacy helper is exposed and policy function OIDs are preserved.

The Facilitator sees one deck and a native keyboard-operable regional view
selector. Record summaries are read-only and show the owner. Switching view
does not change the seat or artifact ownership. The UI explains that submission,
RFIs and proposal replies are not yet enabled. The existing unmodified support
deck remains historical material pending GC-09; it is not roster approval.

Shared-model draft/local keys include model, session, seat and role. Regional
working keys require an explicit region. The view selection is only a preference;
URL `delegation` cannot replace the shared seat. Uploaded shared deck keys include
model and seat and cannot fall back to unified/regional uploads. Notification
state uses the confirmed seat namespace and artifact IDs. Logout, cached-seat
invalidation, model/seat change and removal clear inaccessible state. The shared
seat uses regional offline/rejoin behavior even though its delegation is NULL.

## Scope and prerequisites

Necessary dependencies beyond the original GC-04 page list are the GC-01
contract/fixture, GC-02/03 database authority, deck storage, shared deck controller,
mock backend, seat limits, tests and this runbook. They are part of the authorized
GC-04A reconciliation. The vanilla JavaScript/Vite/Supabase architecture and
existing pages remain.

Apply prerequisite migrations through September 23, including the September
20 terminal-conflict and September 21 recipient-index repairs. The additive
September 24 migration replaces the latest September 18/19 role/seat/ownership
helpers and September 23 lookup/restore definitions in place. It does not replace
the later repaired workflow functions or recipient indexes.

Human installation: open `data/2026-09-24_gc04a_shared_facilitator.sql` in the
rehearsal project's Supabase SQL Editor and run the **entire file**, once, after
the prerequisites. Expected: one committed additive migration, no error, no
historical row backfill. Keep the migration result with the frontend revision.
Do not use a real exercise roster as a synthetic test fixture.

## Exact human-run verification

From the repository root in PowerShell, run the focused regression set:

```powershell
npm test -- tests/unit/gc04a-context.test.js tests/unit/green-regional-contract.test.js src/core/seatContext.test.js src/core/teamContext.test.js src/roles/landing.join.test.js src/roles/scribe.test.js src/services/seatBootstrap.test.js src/services/database.shared-green.test.js src/services/database.regional-security.test.js src/services/database.join.test.js src/services/database.seat-context.test.js src/stores/session.test.js src/stores/participants.gc04-context.test.js src/features/scribe/deckStorage.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC04A regressions failed.' }
```

Expected: every listed test passes, with no skipped GC-04A cases. This covers
three entry paths, old compatibility, model validation, both URL bases,
cross-region reads/writes, shared capacity, stale recovery/removal, view state,
local/deck/notification isolation, and offline heartbeat behavior. Mock API
tests do not establish deployed RLS or concurrent database lock behavior.

For database evidence, paste the **entire**
`tests/sql/gc04a-shared-facilitator-editor.sql` into Supabase SQL Editor after the
migration. No placeholder replacement, client backslash commands, account lookup
or existing session code is needed. It generates the sessions, identities,
approval fixture and action records, assumes authenticated roles for assertions,
and rolls everything back without disabling installed controls.

Expected: three role rows with **9 assertions each**, plus a `boundary` row with
**22 assertions**, all `PASS`, followed by rollback. Any SQL error is a failure.
It verifies real action RLS, Scribe separation, shared forwarded reads, denied
writes, model/role mismatch, full shared seat, restore/foreign-seat denial,
stale/disconnected rejoin, revoked recovery denial, approved GM setup and model
freeze. It simulates JWT claims; it does not issue hosted authentication tokens
or create concurrent connections. Rerun the unchanged
`tests/sql/gc04-session-context-editor.sql` for four-seat compatibility (four
rows, nine assertions each).

Local browser checks use a dedicated local-only configuration. It starts and
stops its own server, does not request operator credentials, and preserves
four-seat cases. Port 4174 must be free; existing Playwright Chromium must be
installed. Run both build bases:

```powershell
$gc04aPreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    foreach ($gc04aBase in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc04aBase
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed for $gc04aBase" }
        node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc04a.config.js
        if ($LASTEXITCODE -ne 0) { throw "Browser checks failed for $gc04aBase" }
        $gc04aLabel = if ($gc04aBase -eq '/') { 'root' } else { 'project-base' }
        Copy-Item -LiteralPath 'test-results/gc04a-browser/results.json' -Destination "test-results/gc04a-browser/results-$gc04aLabel.json"
    }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc04aPreviousBase
}
```

Expected: **10 browser tests pass at each base**, no skips. These cover native
keyboard joins, role labels, reload, stale stored identity, deep-link denial,
shared view persistence, full-seat feedback, reconnect and simulated removal
cleanup. The result paths above are
future outputs; they are not evidence that a run occurred. If Chromium is
missing, the human can install it with
`node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js install chromium`.

### Hosted authentication, contention and IndexedDB cleanup

GC-04A owns these tools now; GC-12 reuses them for later operational stages.
The shared runner uses real hosted Auth and browser RPC/RLS with three distinct
participant identities. Its separate contention fixture uses simulated JWT
identities on two actual PostgreSQL connections through the Management API.
The receipts must identify distinct matching backend PIDs, an observed lock
block, at least 500 ms of contention, and one independently verified committed
shared seat. Sequential full-seat rejection is insufficient. Both requests must
settle before cleanup, and both outcomes are retained on failure.

Each participant's removal check writes an actual uploaded-deck record to
IndexedDB before calling the operator RPC. Production realtime/heartbeat must
remove the workspace, scoped storage and that record without a refresh or
injected event; an unrelated IndexedDB record must remain. The local mock
browser removal case also checks real IndexedDB, but does not prove hosted auth.

Run the focused tooling regressions in PowerShell:

```powershell
npm test -- tests/unit/gc04a-live-check.test.js tests/unit/gc04-live-check.test.js tests/unit/gc04-live-preflight.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC04A live tooling regressions failed.' }
```

Expected: all tests pass, including legacy manifest cleanup, shared fixture
containment, one-grant setup and sequential scoped grant/archive/revoke cleanup,
rejection of unrelated operator authority, incomplete/duplicate checkpoint rejection, both race outcomes and
rejection of absent/mismatched contention or committed-state evidence.

After the human installs the GC-04A migration and deploys the corresponding
candidate to the existing GitHub Pages path, run:

```powershell
$gc04aPreviousURL = $env:GC04A_BASE_URL
try {
    $env:GC04A_BASE_URL = 'https://ssgwm25.github.io/Fractured-Order/'
    node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs preflight --shared
    if ($LASTEXITCODE -ne 0) { throw 'GC04A deployed frontend preflight failed.' }
    node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --shared
    if ($LASTEXITCODE -ne 0) { throw 'GC04A shared hosted verification failed; retain the report and cleanup instructions.' }
} finally {
    $env:GC04A_BASE_URL = $gc04aPreviousURL
}
```

The runner reads the rehearsal project/public key from existing Vite environment
configuration or `.env.local` and requests the personal access token through the
existing hidden terminal prompt. Privileged credentials stay in Node; no service
key is used in participant browsers. It does not build, migrate or deploy.
Static preflight is only a markup check; the full run validates the server model.

Expected: **16 browser checkpoints** (five for each role plus shared-view
persistence), a passing observed-contention/committed-seat check, no browser or
asset failures, and **both synthetic sessions archived**. `results.json` must
record `stage: "GC-04A-foundation"`, `greenSeatModel: "shared_facilitator_v1"`,
`race.passed`, `automatedPassed`, `cleanupPassed` and `passed` as true.
`manualStatus` is `excluded_by_user`; `manualPassed` remains false. This is a
foundation test result, not automatic human gate sign-off or operational readiness.

To run this same real-backend check before committing, in terminal 1:

```powershell
$env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; do not serve stale dist.' }
node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174
```

In terminal 2:

```powershell
$env:GC04A_BASE_URL = 'http://127.0.0.1:4174/Fractured-Order/'
node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --shared --local
if ($LASTEXITCODE -ne 0) { throw 'GC04A local frontend/hosted backend check failed.' }
```

For the root-base variant, stop terminal 1's server with Ctrl+C, repeat its block
with `$env:VITE_PUBLIC_BASE_PATH = '/'`, then repeat terminal 2's block with
`$env:GC04A_BASE_URL = 'http://127.0.0.1:4174/'`. Stop the server when finished.
Both local variants use the real rehearsal backend but cannot establish deployed
routing; retain the separate hosted-path result and matching deployment provenance.
Shared mode accepts root or project base explicitly; default four-seat mode keeps
its previous base-path validation and ignores `GC04A_BASE_URL`.

Each run generates two isolated sessions, its own IDs/code and clearly synthetic
empty roster/transport markers. Unlike SQL Editor tests, browser fixtures must
persist through separate requests. Setup creates one White Cell grant for the
browser session; the contention fixture needs no operator grant. The database
allows only one grant per auth identity and surface, regardless of session.
Cleanup validates both fixtures and rejects unrelated/global operator authority,
then grants access, archives and revokes access for each session sequentially in
one transaction. Retry cleanup also supports already-archived fixtures. Only
the manifest's temporary session-scoped grants are removed; history is preserved. The empty roster
is test provenance, never exercise approval. No existing exercise is configured,
claimed, converted or deleted. Reports, exact submitted SQL, hashes and manifest
are written under `test-results/gc04-live/<generated-run-id>/`. The runner prints
the complete cleanup command with the actual ID; copy that line if interrupted.
Version-1 four-seat cleanup remains supported without changing its old reports.

An unavailable second database connection, authentication failure, blocked
IndexedDB, missing migration or failed archive is a failure with retained
evidence, not a skip/pass. Preserve reports with their actual base, environment,
source revision/working-tree hashes and fetched asset hashes. Later migrations
that enable submissions need versioned expected permissions, not a weakened
foundation test. No new hosted run has been executed by the agent.

### Duplicate operator-grant setup failure

Run `ea7071e5-8153-4575-915f-2e148595029f` passed deployed frontend preflight
but failed fixture setup with PostgreSQL `23505` on
`idx_operator_grants_auth_surface`. The old setup attempted two White Cell grants
for the same operator. Its retained
`test-results/gc04-live/ea7071e5-8153-4575-915f-2e148595029f/results.json`
records `cleanupPassed: true`: setup rolled back and the presence check found no
fixture sessions. No manual archival is needed for that attempt; no browser or
contention checks passed in that run.

The repair changes the local runner's generated setup/cleanup SQL, not the
database constraint or deployed application. Run the focused tooling regressions
above, then rerun
`node --preserve-symlinks --preserve-symlinks-main scripts/gc04-live-check.mjs --shared`.
This repair needs no migration, build or frontend redeployment. Fresh hosted
output must show the 16 checkpoints, observed contention and both archives before
those checks can be considered verified. The earlier 24 tooling test passes did
not exercise the installed database's grant uniqueness constraint.

## Outstanding evidence and dependencies

- Fresh unit, SQL and local browser output for this revision is required.
- Fresh `--shared` real contention and three-seat browser/reconnect/removal/
  IndexedDB results, plus deployed base-path provenance, remain required before
  claiming those acceptance items verified. The tools are supplied above;
  the default runner and its historic four-seat PASS output remain separate.
- Exercise-owner approval of the represented roster remains unresolved. Synthetic
  SQL fixtures roll back; hosted fixtures are archived with test provenance.
  Neither kind satisfies this prerequisite.
- GC-05 implements five orientation submissions. GC-06 implements regional
  proposal handoffs/revisions/submission and recipient-isolated threads. GC-07 implements
  scoped shared RFIs. GC-08 implements atomic Game Master creation UI, White Cell
  integration and operational recovery. GC-09 updates the shared deck/instructions.
- Manual screen-reader testing is excluded by the user's decision, not passed.

### Subsequent permission and workflow stages

The prompt book version 1.4 assigns each remaining dependency explicitly. These
are future implementation requirements; this documentation changes no runtime
authority and does not mark a gate passed.

| Prompt | Required extension | Boundaries to retain |
| --- | --- | --- |
| GC-05 | Scribe orientation handoff, shared orientation submission, White Cell return/correction/resubmission, five-submission gate and working controls | Proposal/thread/RFI/direct-message writes remain closed; private drafts/notes stay isolated |
| GC-06 | Proposal handoff/edit/submission/return recovery and approved recipient threads, with matching controls | Preserve GC-05 orientations; keep RFIs/direct-message creation closed and recipients isolated |
| GC-07 | Scoped RFI and direct-message creation/return/recovery, answers and notices | Preserve orientation/proposal authorization and each Scribe's read-only, regional RFI scope |
| GC-08 | Atomic creation around the GC-04A configuration/freeze contract, approved roster selection and operational administration | No separate browser create/configure race, historical conversion or generic shared access |
| GC-09 | Final deck/onboarding and guidance matching GC-05–08 capabilities | Model/seat/region storage isolation; pending features and media gaps remain explicit |
| GC-10 | Source-artifact regional provenance with submitter identity kept separate | Unchanged PLI methodology and Blue orientation dependency |
| GC-11 | Persisted staffing model and separately labeled derived compatibility model in exports | Preserve historical NULLs, original roles, artifact ownership, revisions and distinct counts |
| GC-12 | Fresh stage-specific positive/negative authorization, hosted and three-model compatibility evidence | Old results retain their actual revision/model; incomplete workflows remain blockers |

GC-05 must not wait for GC-06 to enable orientation submission. GC-05–07 each own
the minimum White Cell flow, UI controls, reads, adapter/mock and additive server
changes needed to complete their own acceptance. GC-08 is subsequent integration,
not the first implementation of those flows. Each capability owner updates the
temporary notice when enabling its workflow; GC-09 completes participant guidance.
GC-04A's own hosted/race/cleanup tooling is delivered before foundation sign-off;
GC-12 extends it rather than supplying a missing prerequisite retroactively.

Read the latest definitions before replacing shared capability/ownership/read
helpers. The SQL suite above describes the foundation: after a later prompt
intentionally enables an operation, version that expectation and add its scoped
positive/negative checks. Preserve the original foundation output and re-run all
unchanged isolation, seat and history invariants. Do not reuse a blanket-denial
assertion as a final-system contract or silently call an old result current evidence.

For this dependency-only alignment, the human can run:

```powershell
npm test -- tests/unit/green-regional-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'Green contract alignment regression failed.' }
git diff --check
```

Expected: all specification tests pass, including GC-05/06/07 as deferred
mutation owners with the foundation still read-only, and no whitespace errors.
No new runtime test is needed for this documentation/fixture correction. Existing
contract coverage was updated; no test was executed. These checks do not verify
GC-05 onward or replace the outstanding GC-04A evidence above.

Rollback is containment: stop creating shared-model sessions and use a compatible
frontend for those already created. Keep schema, model, ownership, tombstones and
history. Do not unset a frozen model, relabel participants or reapply old helpers
over active shared sessions. A future correction must be additive.

## Change inventory

GC-04A edits/adds these files. Pre-existing GC-04 legacy-topology edits and their
reported evidence are retained separately.

- Specification: `docs/green-cell-regional-split-prompt-book.md`,
  `docs/architecture/green-regional-contract.md`,
  `docs/architecture/green-regional-contract.json`.
- Server: `data/2026-09-24_gc04a_shared_facilitator.sql`.
- Join/context: `index.html`, `src/core/teamContext.js`, `src/core/seatContext.js`,
  `src/core/config.js`, `src/roles/landing.js`, `src/stores/session.js`,
  `src/stores/participants.js`, `src/services/database.js`.
- Workspace/state: `src/roles/scribe.js`, `src/features/scribe/deckStorage.js`,
  `src/features/scribe/sharedGreenContext.js`.
- Test adapter/config: `src/services/supabaseMock.js`, `playwright.gc04a.config.js`.
- New tests: `tests/unit/gc04a-context.test.js`,
  `src/services/database.shared-green.test.js`,
  `tests/sql/gc04a-shared-facilitator-editor.sql`.
- Extended tests: `tests/unit/green-regional-contract.test.js`,
  `src/roles/landing.join.test.js`, `src/roles/scribe.test.js`,
  `src/services/seatBootstrap.test.js`, `src/services/database.seat-context.test.js`,
  `src/stores/session.test.js`, `src/stores/participants.gc04-context.test.js`,
  `tests/e2e/gc04-regional-context.e2e.js`.
- Operator documentation: this file, `docs/architecture/gc04-regional-context.md`,
  `docs/supabase-setup.md`, `docs/supabase-rollback.md`.

The GC-04/04A closeout correction additionally changes
`scripts/gc04-live-check.mjs`, `scripts/gc04-live-contract.mjs`,
`scripts/gc04-live-browser.mjs`, `scripts/gc04-live-preflight.mjs`,
`tests/e2e/gc04-regional-context.e2e.js`, the prompt book and the GC-04/04A
verification documents (`docs/architecture/gc04-live-verification.md`,
`docs/architecture/gc04-regional-context.md` and this file). It adds
`scripts/gc04a-live-race.mjs`, `scripts/gc04-deck-probe.mjs` and
`tests/unit/gc04a-live-check.test.js`. Participant runtime and migrations are
unchanged by this tooling correction. Test results remain pending.
