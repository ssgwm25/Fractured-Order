# GC09 Notetaker and Intercom repairs

Implementation only. No tests, builds, migrations or deployments were run for
this repair. GC09 and GC08 remain unpassed; the prompt-book status table is
unchanged. The failed hosted run and its historical report remain unchanged at
`test-results/gc09-live/224fdbf7-7105-4d34-a472-fc7ee088c349/` and
[GC09 hosted verification](gc09-hosted-verification.md).

Subsequent evidence: the user reported 66 focused and 139 compatibility tests
passing. The [fresh hosted repair verification](gc09-repair-hosted-verification.md)
then verified both repaired paths against the rehearsal backend with 57 scope
assertions and explicit limitations. These later results do not rewrite the
implementation-time statement above or close either overall gate.

## Scope and behavior

The regional Notetaker controller previously hydrated and wrote the legacy shared
ledger, and attempted direct timeline inserts. The retained run recorded
`GC02_SHARED_NOTES_FORBIDDEN` and `GC02_GREEN_DELEGATION_REQUIRED`. Adding a browser
delegation field would not be a sufficient repair: the later GC04A authority
trigger also excludes Notetakers from direct timeline writes.

The controller now uses `fetchScopedNotetakerData` and `saveScopedNotetakerData`
for topology 2. Hydration requires the confirmed session seat and an exact
seat/move response. Saves carry the last acknowledged revision, including zero
only after successful empty hydration. Dynamics, alliance saves and captures are
serialized within the loaded seat/move; each preserves the other persisted
sections. Failed hydration cannot produce a blank replacement write. A conflict,
denial, malformed acknowledgement or unknown commit stops further writes until
reload. Pending callbacks cannot populate a different move, replaced seat or
destroyed/revoked workspace. Copy unsaved text before reloading, then compare it
with the saved record before retrying; do not blindly duplicate a capture after
a lost response.

The existing RPC derives ownership from the authenticated active seat. Browser
checks reject unexpected responses but do not grant authority. The inspected
server chain is `2026-09-18_green_regional_storage.sql`,
`2026-09-19_green_regional_authorization.sql`, the terminal conflict repair
`2026-09-20_gc03_terminal_revision_conflicts.sql`, and the later authority
replacement `2026-09-24_gc04a_shared_facilitator.sql`. No SQL, policies, grants,
revision rules or service API changed.

Captures persist in `scoped_notetaker_data.observation_timeline`, displayed
beside authorized events for the current move in the owner's workspace. Regional
manual saves do **not** publish private notes to the shared timeline. Both
existing Green Notetaker seats remain; no new seat, join option or permission was
added. Other existing Notetakers in topology-2 sessions use the same scoped API
because the legacy ledger is also forbidden there. Unified sessions keep their
existing ledger, capture and manual timeline paths.

Intercom now detaches audio listeners before clearing `src`. Announcement
generation and audio identity guard URL resolution, refresh completion, playback
promises, ended/error callbacks and dismissal timers. Replacement, dismissal and
teardown invalidate the old work. The current Storage clip retains one signed-URL
refresh attempt and the current clip retains click-to-play on autoplay denial.
Public session broadcast targeting and server Storage policies are unchanged.

Necessary scope beyond the original guidance-only GC09 change is the Notetaker
controller's scoped persistence wiring and truthful private-capture guidance.
Shared timeline publication for regional Notetakers would require a separate
server permission/product decision; this repair does not add it. Deck assignment,
recipient-isolated threads, roster, PLI scoring and historical evidence are
unchanged. Synthetic fixtures have not been promoted to exercise approval.

## Files and regression coverage

- `src/roles/notetaker.js`: scoped hydration, serialized revision writes,
  private captures, stale-context guards and corrected in-app instructions.
- `src/features/plugins/intercom.js`: listener teardown and callback lifetime.
- `src/features/onboarding/greenGuidance.js`: correct private-save/capture text,
  including the text transcript generated from it.
- `src/roles/notetaker.gc09.test.js`: both regional seats, empty/failed hydration,
  preservation across concurrent saves/captures, conflict/denial/lost response,
  move and seat invalidation, and unified compatibility.
- `src/features/plugins/intercom.test.js`: clear-src error reproduction,
  queued callbacks, late URL/play promises, in-flight refresh replacement,
  dismissal/destruction, timer cleanup, current refresh and autoplay fallback.
- `tests/unit/gc09-guidance.test.js`: no shared-publication promise in regional
  Notetaker guide text.
- This document and `gc09-session-support.md`: current recovery instructions
  and evidence limitations. The failed hosted report is historical and unedited.

## Exact human-run local verification

Run from the repository root. Create a new report directory, preserving earlier
results. These commands are instructions, not recorded results:

```powershell
$gc09RepairRun = Join-Path 'test-results/gc09-repairs' ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $gc09RepairRun -Force | Out-Null
git rev-parse HEAD | Set-Content "$gc09RepairRun/head.txt"
git status --short | Set-Content "$gc09RepairRun/status.txt"
$gc09RepairFiles = @('src/roles/notetaker.js', 'src/roles/notetaker.gc09.test.js', 'src/features/plugins/intercom.js', 'src/features/plugins/intercom.test.js', 'src/features/onboarding/greenGuidance.js', 'tests/unit/gc09-guidance.test.js', 'src/services/database.js', 'package.json', 'package-lock.json')
Get-FileHash -Algorithm SHA256 -LiteralPath $gc09RepairFiles | Select-Object Path, Hash | ConvertTo-Json | Set-Content "$gc09RepairRun/selected-source-hashes.json"
npm test -- src/roles/notetaker.gc09.test.js src/roles/notetaker.test.js src/features/plugins/intercom.test.js tests/unit/gc09-guidance.test.js --reporter=default --reporter=json --outputFile="$gc09RepairRun/focused.json" 2>&1 | Tee-Object "$gc09RepairRun/focused.log"
if ($LASTEXITCODE -ne 0) { throw 'GC09 repair regressions failed.' }
npm test -- src/services/database.green-storage.test.js src/services/database.regional-security.test.js src/services/database.shared-green.test.js src/services/database.gc05-orientations.test.js src/services/database.gc06-proposals.test.js src/services/database.gc07-messaging.test.js src/services/database.gc08-administration.test.js src/services/supabaseMock.revocation.test.js src/stores/participants.gc04-context.test.js src/core/seatContext.test.js src/features/communications/targeting.test.js --reporter=default --reporter=json --outputFile="$gc09RepairRun/compatibility.json" 2>&1 | Tee-Object "$gc09RepairRun/compatibility.log"
if ($LASTEXITCODE -ne 0) { throw 'GC04A-GC08 compatibility regressions failed.' }
```

Expected: every selected test passes, with no skips. Regional controller tests
must call scoped APIs with sequential expected revisions, never legacy note or
timeline writes. Both region reloads retain dynamics, alliances and captures;
failed and stale requests do not overwrite or leak data. Intercom tests must
show no old-clip refresh/replay after replacement while preserving current-clip
recovery. These are mocked runtime regressions, not hosted authorization proof.
The selected hash inventory is deliberately not a full source/build seal.

For the wider GC09 suite and both-base browser compatibility, use the exact
commands in [session support](gc09-session-support.md#exact-human-run-verification)
and retain their new reports. Those browser tests do not establish the repaired
Notetaker persistence or real-media lifecycle on the hosted backend.

## Evidence still required

The old offline verifier binds the failed run to its original source digest.
After these repairs it should reject current-source drift. Do not change its
manifest, verifier or hashes to make it pass, and do not reactivate its archived
sessions. New verification needs a new source/build/served-asset seal and new
authorized fixtures with their original synthetic labels.

Fresh hosted checks must cover both existing regional Notetakers (shared and
paired sessions): hydration, dynamics and alliance manual/autosaves, all capture
types, reload persistence, simultaneous section writes, stale revision from a
second authenticated tab, uncertain response recovery, move change and seat
revocation during a pending request. Retain requests, denials, revisions and
committed readbacks. Confirm the other Notetaker and shared Facilitator cannot
read these private rows, and retain a unified compatibility pass. No regional
Notetaker should POST to `notetaker_data` or `timeline`.

On both regional Scribe browsers, send a Storage clip followed by inline clips.
Force the previous clip's error and a delayed signed-URL response after
replacement; confirm the old clip neither signs again from a stale callback nor
replays. Also cover dismiss/teardown, autoplay click-to-play, and a deliberately
expired/missing current clip. Retain timestamped media/network observations with
tokens redacted; an already-issued request may finish but must not replace audio.

Carry forward separately: operational exercise approval/activation, manual
keyboard/screen-reader/zoom/mobile/reduced-motion acceptance, deployed-frontend
verification, and outstanding hosted reconnect/revocation, recipient-thread,
missed-event, concurrent-submission and stale-review coverage. Uploads remain
browser-local IndexedDB with default-deck fallback; assignment messages do not
transfer uploaded files. Green narration remains text-only, and the historical
overview/media gaps require refreshed, approved media. Neither this repair nor
passing its local tests closes those requirements.
