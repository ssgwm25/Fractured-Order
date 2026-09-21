# GC-07: Regional RFIs, communications and notifications

**Implementation ready for the GC-08 handoff in the verified rehearsal scope.**
The human-run normal Auth/concurrency report completed successfully on September
21, 2026, following SQL, unit, compatibility and browser checks. See the
[GC-07 implementation handoff](gc07-implementation-handoff.md) for exact receipts,
source binding, acceptance coverage and remaining release evidence. The human
records prompt status; this document does not mark the prompt book Verified.

The tested environment uses local frontend assets and the hosted Supabase
backend. Full manual acceptance and deployment readiness remain unverified.
Skipped accessibility observations are not completed, and the original migration
application receipt is still unavailable. These limits are distinct from the
verified messaging workflows needed to begin GC-08 implementation. Reproduction
procedures remain in [GC-07 evidence collection](gc07-evidence-follow-up.md).

## Runtime contract

- The shared Green Facilitator creates RFIs and direct messages for an explicit
  region. Paired Facilitators use the same regional RPCs for their own region.
  Authority comes from `auth.uid()` and the active session seat, with the existing
  lease/model checks. Browser roles and selected views do not grant authority.
- `write_regional_rfi` derives the team, move, phase and author on creation.
  Correction requires the persisted session, region, ID, revision and returned
  state. White Cell returns retain immutable review snapshots and increment the
  revision; correction resubmits the same ID and revision. The shared Facilitator
  submits the revision captured when the correction form opened, even if a later
  review arrives while it is open. A stale form must reload before resubmitting.
  The shared Facilitator reads both RFI streams; each Scribe and regional
  Notetaker reads only its own.
  Scribes cannot create, correct or answer RFIs.
- `operator_answer_regional_rfi` requires an active White Cell seat, the existing
  review grant, matching owner and revision, and submitted/resubmitted state.
  The old `operator_answer_request` remains for unified and non-Green requests;
  its private implementation is not browser-callable. Answers and their linked
  communications commit together. Regional creation/resubmission/direct-send RPCs
  also commit timeline evidence atomically.
- `send_regional_direct_message` derives the sender from the seat. The owning
  region is immutable; the destination is White Cell. Creation retry keys include
  session, seat and region. Repeated identical creates return the same record;
  changed retry content conflicts. Correction retries after a lost response must
  first reconcile the existing record; never create a replacement RFI.
- White Cell choices include `green_asian_pacific`, `green_europe`, `green`
  (both regions), and model-valid individual roles. The server persists canonical
  `recipient_scope`, `recipient_delegation_id` and `resolved_delivery_audience`.
  Regional sends require an active White Cell seat as well as the operator grant.
  Linked RFI replies always inherit their persisted source region. Conflicting
  audience metadata is rejected. Individual-role targeting outranks parent team;
  neither the shared Facilitator nor the other Scribe inherits a private Scribe
  message. Proposal-thread authorization remains GC-06's separate contract.
- Blue/Red action requests to inform Green still pass through the existing
  White Cell completion/approval transaction. Their resolved audience is both
  delegations; a delivery failure rolls back completion in SQL and the mock.
  No action request, proposal approval or PLI decision is inferred.
- The shared workspace captures its region when a form opens, labels RFIs and
  notifications by region/revision, and switches to the owning view when a durable
  notice opens. White Cell journal updates and deck assignments use resolved
  audiences. Shared sessions route one deck assignment to the shared seat; paired
  sessions route to each regional Facilitator. Uploaded decks retain the existing
  browser-local IndexedDB transport limitation: a delivery notice does not copy
  the upload to a different browser. Repository deck paths work across browsers.
- Startup history stays silent; persisted notice IDs/read state are unchanged.
  Reconciliation recovers missed events, discards rows absent from the authorized
  server snapshot, preserves realtime changes received during the query, and
  ignores pending snapshots after seat/session cleanup. Existing realtime
  subscriptions and seat invalidation remain the transport boundary. The mock
  filters regional change delivery with the receiving seat's read permissions.
- Changing region keeps the active RFI or Communications workspace on a record
  from that region, or its empty state. The shared context panel sits above the
  stage in a scrolling column so desktop/mobile controls remain reachable.

No roster expansion, historical relabeling, PLI change, GC-08 creation screen or
export redesign is included. Necessary dependencies beyond the prompt's read list
are the request/communication stores, contract fixture, compatibility tests and
setup/rollback ledger. Historical permission profiles remain in the contract.

## Installation and SQL evidence

Use the existing provisioned rehearsal project and the ordered ledger in
`docs/supabase-setup.md`. Confirm migrations through September 27, the approved
session roster binding and GC-04A/05/06 prerequisites. In PowerShell:

```powershell
Get-Content -Raw -Encoding UTF8 'data/2026-09-28_gc07_regional_messaging.sql' | Set-Clipboard
```

Paste into Supabase SQL Editor and run the **entire migration once**, only if it
is absent from the environment's verified migration ledger. Expected: commit
without error, new RPC signatures and restrictive policies installed, no history
backfill. Any `GC07_*_DRIFT` failure rolls back; inspect the installed definitions
instead of weakening the guard or applying older functions.

If a rerun reports `42723: gc07_facilitates already exists`, stop rerunning the
migration. Its helper is present; this alone does not verify full installation.
Keep the error and check the migration receipt. This read-only SQL Editor query
lists the principal GC-07 functions without changing the database:

```sql
SELECT signature, to_regprocedure(signature) IS NOT NULL AS present
FROM (VALUES
    ('public.gc07_facilitates(uuid,text)'),
    ('public.write_regional_rfi(uuid,text,uuid,bigint,text,text[],text)'),
    ('public.send_regional_direct_message(uuid,text,text,text)'),
    ('public.operator_answer_regional_rfi(uuid,text,uuid,bigint,text)'),
    ('public.gc07_message_audience()'),
    ('public.gc07_legacy_answer_request(uuid,text,timestamp with time zone)')
) AS required(signature);
```

Expected: all six entries present. This is an inventory, not a gate result or
definition/ACL verification. Missing entries require inspection of the installed
definitions and original receipt before any repair; do not drop functions or
replace the migration with unconditional `CREATE OR REPLACE` statements.
Run the complete behavioral harness below to verify its RPC/RLS assertions.

The initial supplied harness failed at `stage=setup` because its roster snapshot
omitted the required `aliases` object. The corrected rollback-only fixture uses
the existing `{"South Korea":"ROK"}` alias and unchanged regional members.
`green_roster_approvals_snapshot_check` remains unchanged. The added fixture test
parses that JSON and checks membership, aliases and source-reference shape;
it does not execute SQL.

A subsequent supplied run reached `regional_cycles` and stopped with `42702`:
the local `region` variable collided with `gc07_actors.region` in the Facilitator
lookup. The harness now uses `gc07_region` throughout that cycle and qualifies
actor columns. The unused `sid` local in the later block was removed as well.
The regression checks this separation without changing PostgreSQL conflict
resolution. This is a harness-only repair; do not reapply the migration.
Recopy the corrected harness:

```powershell
Get-Content -Raw -Encoding UTF8 'tests/sql/gc07-regional-messaging-editor.sql' | Set-Clipboard
```

Run the entire copied file as postgres with RLS enabled. Expected: one JSON
`gc07_result` with `result: PASS`, nonzero assertions and all named checks,
followed by rollback. Any error or empty report fails. The harness creates its
own synthetic sessions, approvals and JWT identities; it does not use participant
decisions or establish hosted authentication/concurrent-connection evidence.
Capture the whole report, SQL source hash, database identity, UTC time and cleanup
receipt. Recheck the previous workflow stages on the installed GC-07 schema:

```powershell
Get-Content -Raw -Encoding UTF8 'tests/sql/gc05-regional-orientations-editor.sql' | Set-Clipboard
# Paste and run the entire file, retain results; then copy/run the next file.
Get-Content -Raw -Encoding UTF8 'tests/sql/gc06-regional-proposals-editor.sql' | Set-Clipboard
```

Expected: all assertions pass with rollback. GC-05's RFI read assertion now
recognizes the installed permission stage; its orientation/denied-table-write
checks remain. Older reports retain their original meaning and source revision.

## Exact human-run regressions

From the repository root:

```powershell
npm test -- src/services/database.gc07-messaging.test.js src/services/database.green-storage.test.js tests/unit/gc07-sql-contract.test.js src/features/communications/targeting.test.js src/features/notifications/workflowNotifications.test.js src/stores/communications.test.js src/stores/requests.test.js src/stores/workflowReconciliation.test.js src/services/sync.test.js src/services/realtime.test.js src/roles/scribe.test.js src/roles/whitecell.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC07 regressions failed.' }
npm test -- src/services/database.gc05-orientations.test.js src/services/database.gc06-proposals.test.js src/services/database.shared-green.test.js src/services/database.regional-security.test.js src/services/database.privileged.test.js src/services/supabaseMock.test.js src/features/actions/proposalRecipientState.test.js tests/unit/green-regional-contract.test.js tests/unit/gc05-sql-runner.test.js tests/unit/gc06-sql-runner.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC05/06 or legacy compatibility regressions failed.' }
```

Expected: all selected tests pass without skips. These pin mock/adapter scope,
revision and state rejection, Scribe isolation, recipient precedence, action
notification approval, retries, recovery and legacy behavior. Source-contract
tests validate harness containment only; they do not execute SQL.

Local browser checks require existing Playwright Chromium and free port 4174:

```powershell
$gc07PreviousBase = $env:VITE_PUBLIC_BASE_PATH
try {
    foreach ($gc07Base in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc07Base
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed for $gc07Base" }
        node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc07.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC07 browser checks failed for $gc07Base" }
    }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc07PreviousBase
}
npm run verify:repo-artifacts
if ($LASTEXITCODE -ne 0) { throw 'Repository artifact check failed.' }
```

Expected: six browser cases pass at each base: two GC-07 cases plus the existing
two GC-05 and two GC-06 cases. No failures, retries or skips. The new cases cover
keyboard submission, regional RFI/message creation, reload, view separation and
same-record correction. Browser White Cell delivery is synthetic; it is not
real RLS evidence. Reports go under `test-results/gc07-browser/root/`
and `test-results/gc07-browser/project-base/`.

The supplied root-base browser run passed four GC-05/06 cases and failed both
GC-07 cases: switching region fell back to the deck, and the side-by-side context
panel squeezed the RFI correction button out of reach. The repair adds four
controller cases for populated/empty regional views and desktop/mobile pointer
and layout checks within the correction browser case. The subsequent supplied
run passed all six cases at each base, both builds, and 91 Scribe controller
tests. Preserve the earlier failure; neither mock browser run supplies hosted
Auth or manual screen-reader evidence.

## Operators and outstanding evidence

On `42501`, revalidate the authenticated seat and intended session/region; retain
the error and do not switch seats to bypass it. On `PT409`, reload the persisted
artifact and its revision before retrying. On `23514`, check the workflow state
and audience metadata; do not broaden the audience to force delivery. If an
answer/send appears lost, reconcile the original ID/key before sending again.
Retain returned history. Follow `docs/supabase-rollback.md` for containment.

The SQL rollback receipt and successful normal hosted Auth/concurrency rehearsal
are now recorded in the [handoff](gc07-implementation-handoff.md). They cover
regional messaging, retained GC-05/06 workflows, paired/unified compatibility,
server authorization and the three database contention scenarios for their
recorded source and environment. The earlier failed runs remain unchanged.

Outstanding release evidence is the original migration application provenance
(if recoverable), a deployed frontend receipt, and complete manual observations,
including screen-reader/reduced-motion checks and broader keyboard, layout and
unread-state coverage. The reported shared RFI keyboard/zoom/emulated-mobile and
functional browser observations retain their limited scope. No full manual
validator pass is asserted. GC-08 creation and cross-browser upload transport
are not implemented here; a synthetic roster does not authorize live activation.

## Change inventory

- Server: `data/2026-09-28_gc07_regional_messaging.sql`.
- Runtime: `src/services/database.js`, `src/services/supabaseMock.js`,
  `src/stores/requests.js`, `src/stores/communications.js`, `src/roles/scribe.js`,
  `src/roles/whitecell.js`, `src/features/scribe/sharedGreenContext.js`,
  `src/features/communications/targeting.js`,
  `src/features/communications/SendCommunication.js`,
  `src/features/requests/RfiForm.js`, `src/features/requests/RfiList.js`,
  `src/features/notifications/workflowNotifications.js`, `styles/pages/scribe.css`.
- New tests/config: `src/services/database.gc07-messaging.test.js`,
  `tests/unit/gc07-sql-contract.test.js`, `tests/sql/gc07-regional-messaging-editor.sql`,
  `tests/e2e/gc07-messaging.e2e.js`, `playwright.gc07.config.js`.
- Follow-up tooling: `scripts/gc07-live-check.mjs`, `scripts/gc07-live-contract.mjs`,
  `scripts/gc07-live-workflow.mjs`, `scripts/gc07-live-race.mjs`,
  `scripts/gc07-live-provenance.mjs`, `scripts/gc07-sql-evidence.mjs`,
  `scripts/gc07-manual-evidence.mjs`, `tests/unit/gc07-evidence.test.js`,
  `docs/architecture/gc07-evidence-follow-up.md`.
- Extended tests: `src/services/database.green-storage.test.js`,
  `src/services/database.regional-security.test.js`, `src/roles/scribe.test.js`,
  `src/roles/whitecell.test.js`, `src/features/communications/targeting.test.js`,
  `src/features/notifications/workflowNotifications.test.js`,
  `src/stores/communications.test.js`, `src/stores/requests.test.js`, `src/stores/workflowReconciliation.test.js`,
  `tests/unit/green-regional-contract.test.js`,
  `tests/sql/gc05-regional-orientations-editor.sql`,
  `tests/e2e/gc04-regional-context.e2e.js`, `tests/e2e/gc05-orientations.e2e.js`,
  `tests/e2e/gc06-proposals.e2e.js`.
- Docs: this runbook, `docs/architecture/green-regional-contract.json`,
  `docs/architecture/green-regional-contract.md`, `docs/supabase-setup.md`,
  `docs/supabase-rollback.md`.
