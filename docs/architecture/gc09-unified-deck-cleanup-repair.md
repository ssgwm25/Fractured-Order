# GC09 unified uploaded-deck cleanup repair

Implementation supplied September 23, 2026. No test, build, migration,
deployment, or hosted browser command was executed by the agent. The user then
reported the focused local regression command passing on September 23, 2026:
4 test files and all 22 tests passed. The first hosted command stopped before
the build because its dedicated credential variable was unset; it created no
fixture or hosted evidence. The runner now reuses the existing secure local
operator credential when an explicit GC09 override is absent.

The next user-run fresh build succeeded, but retained hosted run
`27a5e481-9da0-4994-915a-277d85a2deef` failed because the harness required the
full label `Green Team Facilitator` while the valid unified workspace displayed
`Facilitator`. The trace proves the join completed, but the harness stopped before
reading the seat or seeding IndexedDB. Its teardown then opened the archive
dialog and waited for `Archive Session` instead of the actual `Archive` button,
causing the global timeout. Session
`3c4bd948-5405-49cb-8359-0dc0a1ab5875` / `GC09UC27A5E4819D` therefore remained
active. This is failed harness evidence, not cleanup-capability evidence. The
next retained run, `e8f55319-7993-47a9-ac6f-050f51d28dbb`, successfully
archived that session, created and joined a fresh unified fixture, and proved
the expected `green_scribe` role, `unified_v1` model, topology version 1, and
exact `scribe-deck:<session-id>:green` key. It stopped before removal because
the harness matched the same seat-specific remove control in both the session
detail and participants overview. Its own session
`c01a7686-d4a4-41e6-9c08-cddd9c5908c1` / `GC09UCE8F5531979` was archived in
`finally`. The runner now scopes the control to `#participantsListDetail`.
Both hosted failures are retained as harness evidence; neither demonstrates
the repaired cleanup after a real removal. The earlier
failed hosted evidence remains unchanged under
`test-results/gc09-edges/c8402293-e61e-43e3-b0af-35f4209b99fe/`.

The third user-run fresh build and focused hosted check passed on September 23,
2026. Evidence is retained under
`test-results/gc09-unified-cleanup/1754875f-57b9-4f9e-9c19-ca9df5f6cefb/`.
The attachment identifies the rehearsal project, unified topology version 1,
the compatible `green_scribe` seat and exact unified deck key. It records the
owned key present before removal, absent after real Game Master removal and
still absent after reload, while the unrelated probe remains. The workspace
reported validation loss, the browser contacted only the configured rehearsal
Supabase host, and the synthetic session was archived.

## Change and boundary

`src/features/scribe/deckStorage.js` now recognizes the legacy unified Green
Facilitator owner, whose compatible role identifier is `green_scribe`, when the
confirmed seat-cleanup event fires. It uses the existing
`getSeatDeckStorageKey(seat)` path, so the deletion target remains exactly
`scribe-deck:<session-id>:green` for unified sessions.

Paired keys still include `asian_pacific` or `europe`. The shared key still
includes `shared_facilitator_v1` and the shared seat ID. The cleanup path does
not scan the object store, delete by prefix, clear the database, or delete a
unified deck when another unified role is removed. Server removal, restore and
heartbeat authorization remain unchanged. No schema, RPC, policy, migration,
roster, participant decision, artifact revision or historical record changes.

The focused storage regression exercises real request completion semantics in a
small IndexedDB substitute. It requires the unified key to be deleted, three
unrelated keys to remain, and removal of the separate unified Green Scribe seat
(`green_facilitator` under the legacy inversion) to leave the Facilitator deck
untouched. Existing paired cleanup remains pinned.

The local browser regression joins a unified Green Facilitator through the
normal UI, writes an actual IndexedDB record plus an unrelated probe, simulates
revocation through the existing mock transport, waits for the normal heartbeat
fallback, and checks denial plus exact cleanup.

## Human-run local verification

Run from the repository root:

```powershell
npm test -- src/services/seatBootstrap.deck-cleanup.test.js src/features/scribe/deckStorage.test.js src/core/seatContext.test.js src/services/supabaseMock.revocation.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC09 unified cleanup unit regressions failed.' }

$oldBase = $env:VITE_PUBLIC_BASE_PATH
$oldTarget = $env:PLAYWRIGHT_BASE_URL
$oldRun = $env:GC09_EVIDENCE_RUN
try {
    Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
    $env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
    $env:GC09_EVIDENCE_RUN = [guid]::NewGuid().ToString()
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'GC09 local cleanup build failed.' }
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc09.config.js tests/e2e/gc04-regional-context.e2e.js
    if ($LASTEXITCODE -ne 0) { throw 'GC09 local cleanup browser regression failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $oldBase
    $env:PLAYWRIGHT_BASE_URL = $oldTarget
    $env:GC09_EVIDENCE_RUN = $oldRun
}
```

Expected: all selected Vitest cases pass. The GC04/GC04A browser file passes
without skips or retries, including `unified Green Facilitator removal deletes
only its browser-local uploaded deck`. Its owned record is absent after removal;
the unrelated probe remains. These local results do not establish hosted Auth,
RPC, realtime or deployed-frontend behavior.

## Retained hosted verification and reproduction

Use the same rehearsal project as the retained GC09 run. Keep the operator code
in the local process environment and do not paste it into reports. The runner
accepts `GC09_REHEARSAL_OPERATOR_ACCESS_CODE` as an explicit override, then falls
back to the existing secure `.env.local` keys `GC09_REHEARSAL_OPERATOR_ACCESS_CODE`,
`GC08_OPERATOR_ACCESS_CODE`, or `OPERATOR_CODE` in that order. It never writes
the resolved value to reports or attachments. The runner
creates one clearly labeled unified synthetic session, joins the existing
`green_scribe` seat, writes the exact browser-local deck key and an unrelated
probe, removes the seat through the real Game Master UI, checks denial and
cleanup across reload, and archives the owned fixture in `finally`. Unified
creation does not add, relabel or promote a roster approval.

```powershell
$oldBase = $env:VITE_PUBLIC_BASE_PATH
$oldTarget = $env:PLAYWRIGHT_BASE_URL
$oldRun = $env:GC09_UNIFIED_CLEANUP_RUN
$oldProject = $env:GC09_REHEARSAL_PROJECT_REF
$oldAbandoned = $env:GC09_ABANDONED_SESSION_ID
$run = [guid]::NewGuid().ToString()
try {
    Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
    $env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
    $env:GC09_UNIFIED_CLEANUP_RUN = $run
    $env:GC09_REHEARSAL_PROJECT_REF = 'gsromgrxgrwwfywaoyme'
    Remove-Item Env:GC09_ABANDONED_SESSION_ID -ErrorAction SilentlyContinue

    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'GC09 hosted cleanup build failed.' }
    node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc09-unified-cleanup.config.js
    if ($LASTEXITCODE -ne 0) { throw 'GC09 hosted unified cleanup check failed.' }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $oldBase
    $env:PLAYWRIGHT_BASE_URL = $oldTarget
    $env:GC09_UNIFIED_CLEANUP_RUN = $oldRun
    $env:GC09_REHEARSAL_PROJECT_REF = $oldProject
    $env:GC09_ABANDONED_SESSION_ID = $oldAbandoned
}
```

Expected: one test passes without skips or retries. The JSON/HTML report and
trace-on-failure are retained under
`test-results/gc09-unified-cleanup/<run-id>/`. The attached result must identify
project `gsromgrxgrwwfywaoyme`, role `green_scribe` through the joined session
receipt, the exact unified deck key, `archived: true`, `syntheticOnly: true`, and
`exerciseApproval: false`. Before removal both `own` and `retained` are true;
after removal and again after reload the result is `{ own: false, retained: true }`.
The attachment should report `abandonedSessionId: null`; both earlier fixtures
are already archived and must not be reactivated or rewritten.
The browser must contact only the configured rehearsal Supabase project for
hosted API traffic.

If the test fails after creating a session and reports `archived: false`, archive
only the session code recorded in that run's attachment through Game Master
Session Management. Preserve the failed report and attachments; do not reuse the
run ID or rewrite the earlier GC09 edge evidence.

Retained run `1754875f-57b9-4f9e-9c19-ca9df5f6cefb` closes the demonstrated
unified cache-cleanup defect. The Notetaker move-change race, exercise activation, manual accessibility,
deployed-frontend verification, physical media audibility/media-owner approval,
browser-local upload distribution limitation and stale narration/image media
remain separate. Do not mark GC09 or GC08 passed from this result and do not
change the prompt-book status table.
