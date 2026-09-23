# GC09 hosted verification — 2026-09-21

**Result: failed capability checks. Neither GC09 nor GC08 is passed.**
The rehearsal verified source/build binding, regional delivery, deck audiences,
and current text guidance, but demonstrated two runtime defects: regional
Notetaker persistence is not wired to scoped storage, and replacing a Storage
Intercom clip can replay the previous clip. No application fix was made during
this verification. The prompt-book status table remains unchanged.

## Evidence identity and authority

Evidence directory:
`test-results/gc09-live/224fdbf7-7105-4d34-a472-fc7ee088c349/`.
Target: `gsromgrxgrwwfywaoyme`; frontend:
`http://127.0.0.1:4174/Fractured-Order/`.

The user first nominated historical contention session
`GC08C4B4DF56ABB99463897DA1285E235B46C2`. Read-only inspection found it archived;
it was not reactivated. The user then explicitly authorized **new GC09-only
shared, paired and unified synthetic sessions**, using the unchanged GC08
synthetic roster, with archive and evidence retention afterward.
`fixture-authorization.json`, `nominated-fixture-read.json` and the original
conversation record distinguish that authorization from exercise approval.

No roster approval was inserted, edited, or promoted. The original version
`green-roster-v172430443271577141009078629179796019649` retains its GC08-only
synthetic provenance; the separate GC09 reuse authorization does not rewrite it.
Membership remains ROK/Japan/ASEAN and UK/France/EU, with South Korea → ROK.

| Model | Session ID | Code | Final state |
| --- | --- | --- | --- |
| Shared | `b38cf9bd-0674-457b-a621-b2045e2a1450` | `GC09224FDBF7S` | Archived |
| Paired | `5f9f660a-7a13-42b9-863e-bf991ae9d824` | `GC09224FDBF7P` | Archived |
| Unified | `e4124988-f808-479b-8263-6329a390365d` | `GC09224FDBF7U` | Archived |

The shared session was created through the normal GC08 UI. Compatibility
sessions used the authenticated legacy creation RPC; paired configuration used
the existing authenticated setup RPC before joins. Both Notetakers used their
existing canonical roles through authenticated claims and normal seat-validated
deep links; no public join option or extra seat was added. No action, orientation,
proposal, participant decision, PLI score, migration or deployment was created.

## Source, build and retained local reports

- HEAD: `1acf872b682618c7000b66ec5a88288f18248797`, with uncommitted changes.
  The hash alone is not the source identity.
- Tested source digest:
  `7ff81ed9a988ef86250b1be7fc8816547b2c7af8032df0a0c41fd7d067524f3b`.
  `build-intent.json` and `build-binding.json` retain the per-file inventory.
- A fresh isolated Vite build reproduced all **57 HTML/JS/CSS/JSON files** in
  the existing distribution without replacing it. All 57 served files matched,
  and the bundle identifies the rehearsal project. This scope excludes separate
  binary media. It is a local frontend with a hosted backend, not deployment proof.
- Fresh backend inspection found **16 installed function definitions and ACLs**
  unchanged from retained GC08 evidence, with all **67 database/edge source files**
  unchanged. `compatibility-definitions.json` additionally captures existing
  proposal-thread/messaging functions and policies. No migration was reapplied.
- Copied original browser reports retain **22 passes at each base path**, zero
  retries/skips, from run `6e6eb2f3-1881-48b2-806d-6454cae91701`.
  `local-regression-retention.json` records their hashes and the user-reported
  **392 + 126 unit passes**. Machine-readable unit reports were not supplied.
  Those earlier runs lacked a contemporaneous source manifest; this later
  reproducibility check does not retroactively establish their complete source
  identity. No unit or compatibility suite was rerun in this verification.
- The two verification documentation files were changed after the workflow.
  `end-source.json` records that documentation-only difference; original build
  and GC08 receipts retain their original hashes.

## Observations and capability gaps

| Check | Evidence | Result and limit |
| --- | --- | --- |
| Real Intercom fan-out | `intercom-inline.json`, `intercom-storage.json`, `final-intercom-observations.json` | Both regional Scribes received the same announcement IDs over hosted WebSockets. An 18,448-byte inline clip and a 118,912-byte Storage clip reached playback completion. Chromium synthetic microphone input was used; no human audibility/content assessment. |
| Replacement clip lifecycle | `final-intercom-observations.json` | **Defect:** subsequent inline announcements caused both receivers to request the earlier Storage object again, show an error, then return to playback. See analysis below. Delivery reach alone is not an Intercom acceptance pass. |
| Autoplay alternative | `intercom-autoplay.json` | Fresh browser with no user activation showed “Click to play”; keyboard activation completed playback. CDP observation used `userGesture: false` so inspection did not grant activation. Earlier unsuccessful automation attempts are retained. |
| Addressed text alternative | `response-text-diagnostic.json`, `addressed-text-alternative.json`, `final-audience-shared.json` | Separate synthetic text alternatives persisted for each Scribe; each authenticated Scribe read only its addressed text. These are direct communications, not proposal-thread exchange coverage. |
| Deck assignments | `deck-GC09-*.json`, `deck-reads-*.json`, `final-deck-reads-*.json`, `before-archive.json` | Shared assignment reaches only the shared Facilitator; paired assignments reach their own regional Facilitator; explicit “both” creates two separate notices. Unified recipient remains `green_scribe`. |
| Server scope enforcement | `deck-server-boundaries.json` | Foreign deck ID reads return no rows. Paired → shared audience and Scribe → operator send return `42501`. Browser filtering is not counted as authorization. |
| Uploaded deck scope | `operator-browser-upload-keys.json`, `upload-fallback-*.json`, `shared-deck-reload.json` | One shared-seat key, two separate paired region keys. Other profiles receive notices but not bytes and show the persistent default-deck fallback. Shared view switch/reload preserves its assignment. This is not hosted upload distribution or private shared-deck asset storage. |
| Onboarding | Eight `hosted-guide-*.json` files | Shared, paired, unified and both Notetaker role summaries/text transcripts verified, narration disabled, keyboard transcript opening and minimization observed. Stale overview media stays labeled historical. |
| Existing Notetakers | `notetaker-claim-*.json`, `notetaker-workflow-*.json` | **Defect:** both assigned roles join, but dynamics and Quick Capture writes fail. Reload loses entered notes; scoped and legacy readbacks remain empty. No persistence pass. |
| Cleanup and history | `archive-receipts.json`, `before-archive.json`, `archived-readback.json`, `database-final.json` | All three sessions archived; 11 communications and existing seat identities retained. No action records were invented. Other session and approval digests remain equal from pre-workflow through post-archive. Installed definitions/ACLs remain unchanged. |

### Regional Notetaker cause

`src/roles/notetaker.js` still hydrates legacy `notetaker_data` and calls
`database.saveNotetakerData` for dynamics, alliance data and capture append.
The observed dynamics POSTs to `/rest/v1/notetaker_data` fail with
`23514 / GC02_SHARED_NOTES_FORBIDDEN` in both regions. Captures POST to
`/rest/v1/timeline` without delegation attribution and fail with
`23514 / GC02_GREEN_DELEGATION_REQUIRED`. Both observed payloads use move 1,
phase 1; this was not merely an invalid move-zero write.

The server boundary correctly prevents legacy shared storage and unattributed
regional writes. The existing `fetchScopedNotetakerData` /
`saveScopedNotetakerData` API is not connected to these controller paths.
Guidance currently overstates usable persistence. Do not rely on the regional
Notetaker forms until the scoped hydrate/save/revision and capture paths are
implemented and verified. Preserve the two seats and unified compatibility;
do not relax triggers or retrofit historical shared JSON.

### Intercom replacement cause

The original Storage clip is
`intercom-1790021901800-334fe224-9d99-49ba-97a1-f3c8b1e5678e.webm`.
After new inline broadcasts at approximately 20:23:21Z and 20:26:35Z, both Scribes
make new sign/download requests for **that earlier object**, and enter
error → playing → played states over roughly its eight-second duration.
This supports stale-clip replay, not just a harmless visual warning.

In `src/features/plugins/intercom.js`, `loadAndPlayAudio` attaches an error
callback capturing its announcement. `cleanupAudio` clears the previous audio
source without removing its listeners or invalidating its callbacks.
`handleAudioError` can therefore refresh and load the captured previous Storage
announcement after a replacement arrives. A generation/announcement guard and
listener cleanup need narrow regression coverage, including delayed URL refresh,
replacement and teardown. Do not change the session-wide transport or private
message boundaries to repair this lifecycle defect.

### Other retained observations

One unified operator workspace showed “Session validation lost”; a normal reload
restored the same authenticated seat with HTTP 200, and the unified deck send then
succeeded. The trigger was not isolated. Retain this limitation for reconnect
coverage rather than claiming an uninterrupted unified run.

The driver also retained selector/claim-envelope mistakes, a corrected read-only
SQL column error, and an initial sandbox build failure. An offline verifier
initially counted one source assertion only in read mode, causing a summary
comparison failure; its original script/summary/manifest are retained under
`initial-*`, and the final verifier counts it consistently. These are automation
diagnostics, not hidden successful attempts. The final receipts distinguish them
from the two demonstrated product defects.

## Required next work and separate requirements

The concrete next implementation task is to repair **regional Notetaker scoped
persistence/captures and Intercom stale-announcement cleanup**, with code, narrow
tests and corrected guidance, then rerun affected local and hosted checks against
a newly bound source/build. This is a necessary runtime dependency beyond a
guidance-only change; it was identified but not silently implemented here.

Still separate: exercise approval/activation; manual screen-reader, keyboard,
zoom/mobile and reduced-motion acceptance; refreshed media and owner approval;
deployed frontend verification; deliberate expired/missing media checks; hosted
upload cleanup/revocation and the complete startup/reconnect/revocation matrix;
recipient-isolated proposal exchanges, missed events, concurrent submissions and
stale White Cell reviews. Existing thread sources/server policies were preserved;
this run did not create synthetic participant proposal decisions to fill those
coverage gaps. Browser-local uploads still do not transfer files across profiles.

## Human verification

The offline verifier checks hashes, source drift, retained local reports,
successful observations, both reproduced defects and archive preservation. It
does not rerun the browser/database or grant a gate pass:

```powershell
$gc09Evidence = 'test-results/gc09-live/224fdbf7-7105-4d34-a472-fc7ee088c349'
node --preserve-symlinks --preserve-symlinks-main "$gc09Evidence/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC09 evidence integrity verification failed.' }
```

Expected: evidence integrity consistent, both defects retained,
`scopeResult: FAILED_CAPABILITY_CHECKS`, both overall gates `NOT_PASSED_BY_THIS_RUN`,
and all three synthetic sessions archived. A missing/changed receipt or runtime
source drift must fail integrity verification. Exact local rerun commands remain
in [GC09 session support](gc09-session-support.md#exact-human-run-verification).
No new application tests were added in this verification-only task.
