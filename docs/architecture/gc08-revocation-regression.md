# GC08 revocation delivery and workspace cleanup regression

The current-source regression run under
`test-results/gc08-regression/8724247f-e64f-43c5-aa11-6df7b7a318c4`
failed the GC04A shared-seat removal browser check at both URL bases. Its
15-second assertion expected an immediate invalidation after a simulated
revocation. Those failed receipts remain unchanged.

## Cause and correction

Regional realtime reads require the authenticated identity's active session
seat. Once that seat is revoked, `regionalCanRead` in `supabaseMock.js` rejects
its own changed seat row. This matches the active-seat requirement in the SQL
read helpers; permitting that payload in the mock would bypass the boundary.

The application already has a second path: `participantsStore.startHeartbeat`
runs every 30 seconds. A revoked seat's heartbeat is denied; the authenticated
restore RPC also denies the revoked identity. `sendHeartbeat` invalidates the
confirmed seat, notifies subscribers and stops renewing. The main subscriber
removes the workspace, sync reset clears protected stores, and seat cleanup
clears scoped local/session storage and its uploaded IndexedDB deck. Unrelated
deck records and server history remain intact. This scheduled fallback is not
a guarantee of immediate delivery or a wall-clock SLA for throttled/offline tabs.

A separately labeled diagnostic run of the unchanged browser test, with a
45-second observation window, completed all cleanup assertions in 34.9 seconds.
Its trace is retained under
`test-results/gc08-revocation/406a46cc-0b5f-4459-ad6b-88e74a5305d5`.
That diagnostic is not a passing receipt for the original 15-second suite.

The correction installs Playwright's clock before application timers and
advances one normal 30-second heartbeat interval after the simulated revocation.
The cleanup assertion still has its original 15-second timeout. No refresh,
direct invalidation call, privileged realtime payload, or fabricated RPC result
is injected. The workspace, both scoped storage areas, deleted owned deck and
retained unrelated deck assertions all remain required.

This is a test synchronization correction. Application behavior, heartbeat
cadence, server authorization and migrations do not change. Immediate push
notification to revoked identities would require a separately designed and
verified mechanism; it is not part of this fix.

## Narrow regression coverage

- `src/services/supabaseMock.revocation.test.js`: paired and shared seats receive
  an authorized update, lose their realtime/read access on revocation, are
  denied heartbeat and restore, and retain their historical seat identity/name.
- `src/stores/participants.gc04-context.test.js`: without a delivered event,
  the next scheduled heartbeat invalidates on denied restore and stops future
  heartbeats. Covers a regional Scribe, shared Facilitator and both White Cell
  roles alongside existing offline/rejoin tests.
- `tests/e2e/gc04-regional-context.e2e.js`: actual rendered workspace and browser
  storage cleanup through the existing heartbeat fallback.

## Human-run verification

From the repository root:

```powershell
npm test -- src/services/supabaseMock.revocation.test.js src/stores/participants.gc04-context.test.js src/services/seatBootstrap.test.js src/services/seatBootstrap.deck-cleanup.test.js src/core/seatContext.test.js src/stores/session.test.js src/services/sync.test.js src/services/realtime.test.js
if ($LASTEXITCODE -ne 0) { throw 'Revocation regressions failed.' }
```

Expected: every listed test passes without skips, including both transport
cases and all four scheduled heartbeat cases. These are mock/local contracts.

For browser verification, use the retained GC08 regression runner in a new
directory so Playwright cannot overwrite earlier evidence:

```powershell
$gc08Prior = 'test-results/gc08-regression/8724247f-e64f-43c5-aa11-6df7b7a318c4'
$gc08Next = 'test-results/gc08-regression/' + [guid]::NewGuid().ToString()
New-Item -ItemType Directory -Path $gc08Next | Out-Null
Copy-Item -LiteralPath "$gc08Prior/run.mjs" -Destination $gc08Next
node --preserve-symlinks --preserve-symlinks-main "$gc08Next/run.mjs" prepare
node --preserve-symlinks --preserve-symlinks-main "$gc08Next/run.mjs" browser
if ($LASTEXITCODE -ne 0) { throw 'Browser regressions failed.' }
```

Expected: fresh builds at `/` and `/Fractured-Order/`; 10 GC04/GC04A,
2 GC08 and 6 GC05–GC07 cases pass at each base (36 total), with no skips or
retries. The runner retains logs, JSON reports, build/source hashes and failure
attachments in that new directory. Port 4174 and installed Chromium are required.
No SQL, migration or deployment command is part of these affected-suite reruns.

Exercise approval, manual accessibility and outstanding hosted coverage remain
separate requirements. Local mock time advancement does not establish hosted
realtime timing, Auth/RLS behavior or deployed frontend acceptance. Do not mark
the GC08 gate passed from these regressions.
