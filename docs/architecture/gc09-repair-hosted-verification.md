# GC09 repair hosted verification — 2026-09-21

**VERIFIED_WITH_LIMITATIONS: 57 scope assertions. Neither GC09 nor GC08's overall
gate is passed.** The repaired Notetaker and Intercom paths were exercised against
the real rehearsal backend. No application code, migration, permission or prompt
status changed during this verification.

## Source, build and target

Evidence directory: `test-results/gc09-live/41a88932-6821-495b-a9f2-9447b195cec0/`.
Project: `gsromgrxgrwwfywaoyme`. Frontend:
`http://127.0.0.1:4174/Fractured-Order/`.

The isolated fresh Vite build used HEAD
`1acf872b682618c7000b66ec5a88288f18248797` with uncommitted changes and source
digest `9aa09a8bef7072f831809242bd34d0cf24ff746795b68626b848ac2448a24142`.
All **314 built files, including media**, matched their served bytes. The bundle
identifies the same hosted project. Source/build inventories and served hashes
are retained. Only this report and the two linked support documents change after
the build; the verifier checks implementation equality and records that document
delta separately from the final whole-source digest.

The installed scoped-notes RPC body matches the September 18 storage migration
with September 20's terminal `PT409` conflict repair, normalizing line endings.
All 67 database/edge source files match the failed run. Definitions, ACLs, RLS,
policies, triggers and roster approvals remain unchanged across fresh preflight
and post-archive reads. Unrelated non-NULL-coded session records also have an
unchanged digest; this is not a checksum of every database table.

The original GC08 synthetic roster was reused under the user's subsequent
authorization for new GC09 synthetic sessions. Its label and approval record are
unchanged. No synthetic fixture was promoted to exercise approval.

## Fresh workflow evidence

| Scope | Observed result |
| --- | --- |
| Both Notetakers in shared and paired sessions | Four `notes-<model>-<region>.json` receipts: empty scoped hydration, manual dynamics save, dynamics autosave, manual alliance save, NOTE/MOMENT/QUOTE captures and reload persistence. Each of the four rows retains three captures. |
| Revision conflict and recovery | Each second authenticated tab loads revision 6; the first tab commits revision 7. The stale save receives HTTP 409 / `PT409`, retains its draft, and sends no further write when Save is clicked again. Reload recovers the winner. All four archived rows remain revision 7. |
| Privacy and server authority | Each normal scoped read returns only its own note row. Direct Europe-to-Asia-Pacific reads return no row and updates receive HTTP 403 in both models. The shared Facilitator reads no scoped notes. Regional controllers never POST to legacy notes or timeline. See `notes-boundary-*.json`. |
| Unified compatibility | `unified-notes.json`: the existing `green_notetaker` role retains legacy notes, manual timeline publication, capture append and reload. One legacy row and two timeline events remain. |
| Normal Intercom replacement | Four real announcements produce eight hosted deliveries: two Storage and two inline clips, each received by both Scribes. Queued old error/ended callbacks are invoked after inline replacement. No further Storage request or old audio recreation occurs. See `media-normal-replacement.json`. |
| Delayed refresh | A current Storage error starts a genuine signed-URL request on each Scribe. Both HTTP 200 responses are held until a newer inline clip arrives. Releasing those unchanged responses neither recreates nor replays the old clip. Native playback events and request timestamps are retained in `media-delayed-refresh.json`. |
| Backend and cleanup | `final-surfaces.json` confirms nine actor surfaces without a mock backend. Database readbacks show no invented participant action records and preserve notes, captures, timeline entries and seat identities through archive. |

Notetaker entry uses authenticated claims of existing canonical roles followed by
normal seat-validated deep links. No public join option or seat capacity was added.
The second tab resumes the same authenticated seat in memory; credentials are
not retained. Media instrumentation observes native Audio objects/listeners.
Recordings use Chromium's fake microphone test tone; encoding, playback and
hosted transport are real. Callback invocation and delayed genuine responses are
explicit fault injection, not fabricated playback/API success. Human audibility
and manual accessibility are not established.

## Preservation

All three new sessions are archived:

| Model | Code | ID |
| --- | --- | --- |
| Shared | `GC0941A88932S` | `425cd4d5-8224-4698-8bfc-3e1b49f420be` |
| Paired | `GC0941A88932P` | `eb8cb299-1c05-47e9-bd9e-136dd7636c05` |
| Unified | `GC0941A88932U` | `0be60942-c5e8-4af8-b7a4-f2f119a4bd9c` |

The entire failed-run directory
`test-results/gc09-live/224fdbf7-7105-4d34-a472-fc7ee088c349/` was hashed before
and after: unchanged. Its failed verdict, archived sessions and verifier remain
historical evidence. The [failed hosted report](gc09-hosted-verification.md) is
also unchanged.

This run retains its automation errors: the initial sandbox-blocked build,
outdated Operator Access selector, dependent creation attempt before login, and
hidden checkbox selector corrected to its visible label. Offline checker
assumptions were corrected too: the guide creates an empty Audio object, and a
signed Storage download also uses `/object/sign/`. The final checker selects
actual clip objects and requires no Storage request after replacement. Earlier
checker versions are retained. No application change or relaxed workflow
expectation was needed.

The user reported **66 focused and 139 compatibility tests passed** before this
run. They were not rerun or retroactively attached to this build's source seal.

## Offline verification

```powershell
$gc09RepairEvidence = 'test-results/gc09-live/41a88932-6821-495b-a9f2-9447b195cec0'
node --preserve-symlinks --preserve-symlinks-main "$gc09RepairEvidence/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC09 repair evidence verification failed.' }
```

Expected: `VERIFIED_WITH_LIMITATIONS`, 57 scope assertions, consistent artifact
hashes/current source, three archived sessions and both gates
`NOT_PASSED_BY_THIS_RUN`. This does not rerun the database or browser. Later
source drift must fail; do not reseal old evidence to hide it.

## Requirements carried forward

- Operational exercise approval and activation; manual keyboard, screen-reader,
  zoom/mobile, reduced-motion and audio-alternative acceptance; deployed frontend.
- Hosted autoplay-denial and deliberate expired/missing current-media checks were
  not repeated here. Neither were uncertain note commits, simultaneous section
  saves, move-change/revocation races or the complete startup/reconnect matrix.
- Recipient-isolated exchanges, missed-event recovery, concurrent submissions and
  stale White Cell reviews remain separate hosted coverage. No proposals were
  created to fill those gaps.
- Uploaded decks remain browser-local IndexedDB with default-deck fallback;
  assignment notices do not transfer files. Green narration remains text-only;
  historical overview/deck media still need approved replacements.

See [runtime repairs](gc09-runtime-repairs.md) and
[session support](gc09-session-support.md). The prompt-book status is unchanged.
