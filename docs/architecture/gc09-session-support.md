# GC09 decks, onboarding and session support

Implementation was supplied without executing tests, builds, migrations or
deployments. Subsequent user-run local results and the
[2026-09-21 hosted verification](gc09-hosted-verification.md) are now retained.
**The retained hosted capability checks failed:** regional Notetaker forms used
legacy save paths, and Intercom replacement replayed a previous Storage clip.
The subsequent [runtime repair](gc09-runtime-repairs.md) connects scoped storage
and invalidates stale audio callbacks. The user subsequently reported 205 local
tests passing, and [fresh hosted repair verification](gc09-repair-hosted-verification.md)
verified the repaired paths with explicit coverage limits. The failed receipts
remain unchanged; neither GC09 nor GC08 is declared passed. The prompt-book
status table is unchanged. The
[GC08 handoff](gc08-implementation-handoff.md) retains its original source and
evidence limits; GC09 changes invalidate blanket current-source claims from those
older receipts. Do not update their hashes or overwrite their evidence.

## Implemented guidance and delivery

Start Here now mounts for the shared Green Facilitator. Its guide and the two
regional Scribe guides use confirmed seat context. Paired and unified Green retain
their own staffing and historical ownership instructions. The two existing
region-assigned Notetaker seats remain; no new seat or public join option was
added. The repaired controller loads and saves through the existing authenticated
scoped API, carrying the last confirmed revision. Captures remain in that private
move record and appear locally beside authorized timeline events. Regional manual
saves do not publish private notes to the shared timeline. Unified sessions retain
their legacy ledger and timeline behavior. The linked repair run verifies these
paths; the remaining coverage below is still required.

The current text transcript is rendered from each Green guide's visible title,
body, narrative and details. Green guide narration is explicitly disabled until
matching replacement media is reviewed; the transcript remains keyboard
accessible. The original overview transcript/captions continue to describe the
unchanged video, with a visible historical-media notice. Existing approved MP3s,
allowlists and provenance are untouched. Updated copy does not inherit their
approval. New narration, corrected overview role descriptions and refreshed
historical deck images remain media gaps.

The narration exporter now retains the 14 Green participant transcript profiles
separately under `textOnlyProfiles`, without clip IDs or audio generation entries.
The 21 remaining legacy narration profiles keep their existing generation path.
The deterministic catalog includes all three staffing models without reading or
changing an active participant seat. No export or media generation was run.

The following is the support transcript for the implemented regional workflow:

1. Confirm the session model and your assigned seat. In the shared model, the
   Asia-Pacific Scribe and Europe Scribe work independently with one shared
   Facilitator. Paired sessions retain a Facilitator per region; unified sessions
   retain unified ownership. White Cell controls one global move, phase and timer.
2. Each regional Scribe forecasts Blue, uses the existing orientation catalogue,
   and authors its own orientation and proposals. Forward the completed record
   to the Facilitator. No catalogue, qualifying-orientation rule, Blue prerequisite
   or PLI score changes with staffing.
3. The Facilitator reviews each region's handoff and submits it separately to
   White Cell. Private drafts and notes remain inaccessible. Edit proposals only
   in permitted states. After a return, the originating Scribe corrects the same
   record and hands off its new revision; prior revisions and review remain.
4. Keep negotiations with their source delegation, approved recipient and current
   proposal revision. Replies pass through White Cell review. Another recipient
   or region does not inherit a thread. Coordination needs independently owned
   records and explicit references, not joint ownership or invented decisions.
5. The Facilitator creates/corrects RFIs and sends direct messages to White Cell
   for the owning region. A form retains the region selected when opened.
   Scribes read authorized questions and answers; they cannot create, correct or
   answer RFIs. Reload a stale record before retrying.
6. Keep the existing Asia-Pacific and Europe Notetakers in their assigned regions.
   Dynamics, alliances and captures save privately to the authenticated seat and
   move. Confirm the saved state and reload to check persistence. On a conflict,
   denial or uncertain response, keep your draft text before reloading the saved
   record; compare it before manually retrying. Further writes are blocked until
   successful hydration. A shared Facilitator must not gain those notes by
   switching views. Regional manual saves do not publish a shared snapshot.
7. Enabled Intercom sends live session-wide announcements to Scribes, including
   both regional Green Scribes. Use **Click to play** when autoplay is blocked.
   Ask White Cell for an addressed text message for missed or inaccessible audio.
   Intercom is not a durable inbox or private regional channel.
   A replacement or dismissal stops the previous clip and invalidates its pending
   callbacks. A current Storage clip may refresh its signed URL once; failure
   remains visible. The linked repair run verifies replacement behavior; current
   expired/missing-media and autoplay-denial checks still need fresh coverage.

Intercom's target list now includes the canonical regional Scribes while retaining
all four legacy semantic Scribe roles. Its receiver still checks session and role,
and rejects non-Scribe roles even if inserted into a payload. These checks are
delivery filters, **not authorization**. Existing broadcast transport is unchanged:
it does not establish private-channel membership or cryptographic sender
authenticity. Storage access continues through existing server policies. Do not
send private regional information through Intercom. Introducing authenticated
private broadcast transport would be separate work, not a claim of this patch.
Regional records, deck notices and proposal threads retain their authenticated
active-seat RPC/RLS boundaries.

## Runtime deck, roster and assignment scope

The application loads `decks/green/fractured-order-facilitator-deck.html`.
Five text slides in its actual `SLIDES` payload provide current workflows,
Asia-Pacific and Europe reference sections, and recovery guidance. The runtime
parser/renderer displays these before the retained images, escapes their text,
and uses existing deck navigation. The standalone file also opens the current
guide and has native keyboard-operable slide buttons. The original dated image
payloads remain reference material; Blue-oriented instructions in those images
are explicitly superseded for Green by current text and live forms.

The separately named `fractured-order-green-facilitator-deck.html` remains a
standalone HTML briefing, **not** the app default or a parser-compatible uploaded
`SLIDES` deck. Its membership, handoff, staffing and support copy now match the
documented decision. Its strategic posture examples are discussion prompts, not
replacement orientation catalogue entries.

Documented D-02 / `green-roster-v1` membership is Asia-Pacific: **South Korea
(ROK), Japan, ASEAN**; Europe: **UK, France, EU**. Existing sessions keep their
frozen roster and historical records. This content decision does not create an
exercise-approved database registry entry. Synthetic GC08 fixtures retain their
original label and are not promoted or used as operational approval.

| Session | White Cell deck assignment | Upload namespace and visibility |
| --- | --- | --- |
| Shared regional | One explicitly labeled Shared Green deck, addressed only to `green_shared_facilitator` | Existing model/session/shared-seat key; changing regional view or reloading never chooses a regional or unified upload. Regional sections in this deck are shared reference material, not private assets. |
| Paired regional | Explicit Asia-Pacific only, Europe only, or both (two distinct notices) | Existing session/team/delegation keys. Each notice addresses only its regional Facilitator. Separate current-assignment labels appear in White Cell settings. |
| Unified / historical NULL | Existing unified Green Facilitator assignment | Existing team key and legacy recipient; no regional relabeling. |

The scope control chooses recipients for the existing
`operator_send_communication` RPC. GC07 validates the active operator seat,
model-valid recipient and persisted audience on the server. Scope labels do not
grant authority; forged model/scope combinations fail rather than broadening
the audience. No schema, RPC, policy or migration changes are needed.
Paired sessions require an explicit recipient choice; an empty choice does not
default to both regions. A settings refresh retains the choice only for the same
session, and current deck labels are shown per recipient.

Uploads remain **browser-local IndexedDB**, restricted to the existing deck key.
A sent notice does not transfer HTML or images to another browser/profile.
The shared seat must already exist before White Cell can address its upload key.
Missing/inaccessible uploads or repository overrides retain the default-deck
fallback, with a persistent workspace explanation as well as the existing toast.
When an authenticated seat is removed, cleanup deletes only the key derived from
that seat. This includes the compatible unified `green_scribe` owner as well as
the existing paired and shared paths; unrelated session, team, delegation and
probe records remain. Authorization loss still comes from the server, and local
cleanup does not make a browser hint authoritative.
Use a repository deck for cross-browser access. Do not treat publicly served
repository assets or shared reference sections as private regional storage.
Separate private regional assets inside the shared deck and hosted upload
distribution are not implemented.

## Recovery and unresolved evidence

For denied scope, restore the authenticated seat and check the intended session
and persisted owner. For a stale revision, reload the same record. A revoked seat
can lose its own realtime row visibility; the scheduled heartbeat/restore failure
is the cleanup fallback. Do not promise instantaneous removal or use another
region's seat to bypass denial. Preserve original receipts and failed attempts.

The remaining requirements are separate from this implementation:

- Operational exercise roster registration/approval and activation provenance.
- Remaining hosted edge cases for the repairs, as listed in the repair report.
- Additional regional Notetaker move-change race coverage remains blocked: the fresh rehearsal audit
  found no active legitimate regional fixture with a completed orientation gate.
  See `gc09-move-change-hosted-verification.md`; do not reactivate archived
  synthetic sessions or create prerequisite decisions to manufacture coverage.
  This operational follow-up does not block starting GC10.
- Deployed-frontend verification; this hosted run bound a local build only.
- Hosted Intercom delivery to both regional Scribes (small inline and larger
  storage clips), autoplay fallback, failed/expired media and addressed text
  alternative. Public broadcast filtering is not a private authorization proof.
- Outstanding hosted startup, reconnect and revocation coverage across unified,
  paired and shared sessions; missed-event recovery, recipient-isolated exchanges,
  concurrent regional submissions and stale White Cell reviews.
- Hosted deck-notice audiences and browser/profile upload limitations remain.
  Shared and paired cleanup have retained hosted evidence. The unified cleanup
  repair now has passing focused local regressions and a retained hosted removal,
  denial, exact-key cleanup, reload and archive run documented in
  `gc09-unified-deck-cleanup-repair.md`.
- Manual keyboard, screen-reader, 200% zoom/mobile and reduced-motion acceptance,
  including long text slides, guide focus/teardown and accessible alternatives
  for live voice announcements. Automated checks do not close these requirements.
- Media refresh and owner approval of exact replacement scripts/clips/captions.
  No audio generation or promotion occurred here.

Necessary dependencies outside GC09's initial read list are the three guide
callers (`facilitator.js`, `scribe.js`, `notetaker.js`), White Cell's existing deck
assignment UI, two small presentation helpers, focused regression tests and a
local browser config. The narration exporter also needs the new guide dependency
and text-only exclusion; older workflow browser tests now explicitly minimize the
new shared guide. They implement GC09's stated guidance and scope requirements.
No workflow permissions, roster, PLI, historical data, storage transport or
participant decisions were expanded.

## Files changed for GC09

This inventory excludes pre-existing GC08 working-tree changes.

- Runtime: `src/features/plugins/intercom.js`;
  `src/features/scribe/deckConfig.js`, new `deckAssignment.js`;
  `src/features/onboarding/followAlong.js`, `platformOverview.js`, new `greenGuidance.js`;
  `src/roles/facilitator.js`, `scribe.js`, `notetaker.js`, `whitecell.js`.
- Decks: `decks/green/fractured-order-facilitator-deck.html` and
  `decks/green/fractured-order-green-facilitator-deck.html`.
- Transcript tooling: `scripts/start-here-audio/export-scripts.mjs`,
  `export-scripts.test.js`, `README.md`.
- New tests/config: `tests/unit/gc09-guidance.test.js`,
  `tests/e2e/gc09-guidance.e2e.js`, `playwright.gc09.config.js`.
- Extended tests: `src/features/plugins/intercom.test.js`,
  `src/features/onboarding/followAlong.test.js`, `src/roles/facilitator.test.js`,
  `scribe.test.js`, `whitecell.test.js`; browser readiness updates in
  `tests/e2e/gc05-orientations.e2e.js`, `gc06-proposals.e2e.js`,
  `gc07-messaging.e2e.js`, `gc08-administration.e2e.js`.
- Documentation: this file, `docs/start-here-onboarding.md`, and the historical
  stage pointer in `docs/architecture/gc04a-shared-facilitator.md`.

## Exact human-run verification

Run from the repository root. These are instructions, not recorded results.
Retain output with a new source manifest/build receipt. Do not rerun old complete-
source verifiers by altering their sealed digests.

```powershell
npm test -- tests/unit/gc09-guidance.test.js src/features/plugins/intercom.test.js src/features/onboarding/followAlong.test.js tests/unit/facilitator-decks.test.js tests/unit/start-here-role-coverage.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/notetaker.test.js src/roles/whitecell.test.js src/features/scribe/deckStorage.test.js tests/unit/gc04a-context.test.js src/core/seatContext.test.js src/features/onboarding/audioGuide.test.js src/features/onboarding/startHereAudioManifest.test.js scripts/start-here-audio/export-scripts.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC09 focused regressions failed.' }
npm test -- src/services/database.gc05-orientations.test.js src/services/database.gc06-proposals.test.js src/services/database.gc07-messaging.test.js src/services/database.gc08-administration.test.js src/services/database.shared-green.test.js src/services/database.regional-security.test.js src/services/database.green-storage.test.js src/services/supabaseMock.revocation.test.js src/stores/participants.gc04-context.test.js src/features/communications/targeting.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC04A-GC08 compatibility regressions failed.' }
```

Expected: every selected test passes with no skips. New assertions cover actual
Green deck parsing/rendering and escaped text, documented roster, all staffing
models, regional Scribe delivery, shared guide mounting, text-only transcripts,
explicit White Cell recipients and unchanged shared/regional upload namespaces.
Existing cleanup, revision, recipient-isolation and compatibility cases must
remain green. No SQL migration is required by this change.

With existing Playwright Chromium installed and port 4174 free, run local browser
coverage. Unset hosted routing explicitly for this local mock run and restore the
environment afterward. Each invocation uses a fresh output directory, preserving
GC08 evidence and earlier failures:

```powershell
$gc09OldBase = $env:VITE_PUBLIC_BASE_PATH
$gc09OldTarget = $env:PLAYWRIGHT_BASE_URL
$gc09OldRun = $env:GC09_EVIDENCE_RUN
try {
    Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
    $env:GC09_EVIDENCE_RUN = [guid]::NewGuid().ToString()
    foreach ($gc09Base in @('/', '/Fractured-Order/')) {
        $env:VITE_PUBLIC_BASE_PATH = $gc09Base
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "GC09 build failed for $gc09Base" }
        node --preserve-symlinks --preserve-symlinks-main node_modules/@playwright/test/cli.js test --config playwright.gc09.config.js
        if ($LASTEXITCODE -ne 0) { throw "GC09 browser checks failed for $gc09Base" }
    }
} finally {
    $env:VITE_PUBLIC_BASE_PATH = $gc09OldBase
    $env:PLAYWRIGHT_BASE_URL = $gc09OldTarget
    $env:GC09_EVIDENCE_RUN = $gc09OldRun
}
```

Expected: four new GC09 browser cases and the GC04A/GC05–GC08 compatibility
cases all pass at both bases, with no skips or retries. Reports are under
`test-results/gc09-browser/<run-id>/<root-or-project-base>/`. The new cases check
all three target guides, keyboard transcripts, no stale audio, shared view/reload
behavior and standalone regional deck sections. Existing suites exercise removal,
IndexedDB cleanup, private working state, handoffs, RFIs and recipient threads.
These synthetic browser results would not establish hosted or manual acceptance.
