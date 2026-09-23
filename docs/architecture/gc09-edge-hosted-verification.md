# GC09 hosted edge verification — 2026-09-23

**FAILED_CAPABILITY_CHECKS with consistent retained evidence.** This run found
one implementation defect: removing a unified `green_scribe` seat denies the
workspace but leaves that seat's browser-local uploaded-deck record in IndexedDB.
Shared and paired deck owners delete their own records correctly. No application
code was changed because the request required demonstrated defects to be reported
before implementation scope expands.

This result does not mark GC09 or GC08 passed, does not change the prompt-book
status table, and does not start another implementation prompt.

## Subsequent source repair — hosted verification retained

The failed evidence above remains unchanged. A later source change extends the
existing seat-cleanup listener to the compatible unified `green_scribe` deck
owner. It still derives the exact browser key from the removed seat: unified
`scribe-deck:<session>:green`, paired keys retain their delegation, and the shared
key retains its model and seat ID. It does not enumerate or clear unrelated
IndexedDB records. Narrow storage and browser regressions now require the unified
owner's key to disappear while a different-session, regional, other-team, or
probe record remains.

The user subsequently reported the focused storage and seat regressions passing:
4 files and all 22 tests passed. Two fresh builds also succeeded, although their
hosted runs stopped on harness selectors before the Game Master removal. Those
failed runs are retained separately, and the second archived both owned
fixtures. A third fresh build and hosted run passed. Its retained attachment
records the exact unified key present before removal, absent after removal and
still absent after reload while an unrelated probe remains. It also records
workspace validation loss, unified topology version 1, the compatible
`green_scribe` role, the sole rehearsal network host and successful fixture
archive. Evidence is under
`test-results/gc09-unified-cleanup/1754875f-57b9-4f9e-9c19-ca9df5f6cefb/`.
The historical `FAILED_CAPABILITY_CHECKS` result below remains unchanged as the
original defect evidence; the separate focused run verifies its repair.

## Bound source and target

Evidence is retained under
`test-results/gc09-edges/c8402293-e61e-43e3-b0af-35f4209b99fe/`.
The isolated build uses HEAD `1acf872b682618c7000b66ec5a88288f18248797`
with uncommitted work and source digest
`5e32855467c654498aadcabf914fbf5a89d3f3c99a4d0f8b5c14f126480fcffc`.
All 314 built files matched the bytes served from
`http://127.0.0.1:4174/Fractured-Order/`, and the bundle identifies rehearsal
project `gsromgrxgrwwfywaoyme`.

The existing immutable roster approval
`green-roster-v172430443271577141009078629179796019649` retained its explicit
GC08 synthetic-only label. No approval was added, relabeled or promoted to
exercise approval. Installed function definitions, ACLs, table RLS, policies,
triggers, the roster record, the approvals digest and unrelated-session digest
match the pre-run readback.

The four earlier evidence directories named in `prior-evidence-inventories.json`
were inventoried before the build and are unchanged. The first interrupted edge
attempt and all later harness corrections are also retained rather than rewritten.

## Satisfied requirements

| Requirement | Hosted result |
| --- | --- |
| Intercom autoplay denial | Both regional Scribes entered native Chromium `blocked` state under a real user-activation policy. Keyboard activation played the current inline clip. No playback success was stubbed. |
| Expired current clip | A real Storage URL with a one-second token was delivered after expiration. Each Scribe received HTTP 400 `InvalidJWT`, made exactly one successful signing refresh, received HTTP 206 audio, and played the current clip. |
| Missing current clip | One authenticated synthetic broadcast referenced a deliberately missing path without deleting evidence. Both Scribes received a real Storage HTTP 400 and a dismissible “missing or expired” state. |
| Lost Notetaker responses | In both regions under shared and paired models, a committed dynamics response and a committed capture response were dropped. The UI retained the draft, blocked blind retry, and reload recovered exactly one new revision/capture. |
| Simultaneous section saves | Dynamics and alliance submits were started together for all four regional Notetaker paths. The client serialized them, sent revisions in order and retained both sections after reload. |
| Notetaker removal races | Commit-before-removal returned HTTP 200 and retained the committed row. Removal-before-request returned HTTP 403 / `42501` and left the row unchanged. Both orders ran across both regions and both models. Late responses did not restore editors; the page showed validation loss while retaining ordinary rejoin hints. |
| Browser-local fallback and reload | Shared, paired Asia-Pacific, paired Europe and unified assignments showed the default deck with the explicit cross-profile warning when the uploaded file was absent. In the uploader's browser profile, the assigned 65-slide deck survived reload. |
| Deck isolation | Shared region switching retained one shared deck. Paired Scribes received only their role-specific assignment and loaded only their own storage key. Unified retained the legacy `green_scribe` assignment shape. |
| Shared/paired removal cleanup | Removal denied each deck workspace, deleted only the removed seat's key, retained other keys still present in that profile, and stayed denied after reload. |
| Unified removal cleanup repair | A fresh focused hosted run removed the compatible unified `green_scribe` seat through Game Master, denied the workspace, deleted only `scribe-deck:<session>:green`, retained the unrelated probe, kept the key absent after reload and archived the fixture. |
| Evidence preservation | All six owned sessions are archived. Notes, actions, communications, timeline events, Storage object metadata, seat snapshots and unified removal history remain in committed readback. |

The browser checks used real hosted requests and native audio. Recordings use
Chromium's synthetic microphone tone, so they establish transport and playback
events, not human audibility or media-owner acceptance.

## Operational and release follow-up

The following work is carried forward and does not block starting GC10. GC09's
prompt acceptance covers accurate guidance, deck/RFI workspace behavior,
regional view isolation, announcement delivery and compatible-session guidance;
it does not require this additional move-change race.

1. **Move-change race remains blocked by fixture availability.** A fresh read-only
   audit on September 23 found seven active sessions and six complete orientation
   gates, but every qualified active session is legacy unified. Across 72
   historical regional sessions, zero are active; the only three complete gates
   belong to archived synthetic sessions whose five orientation rows are all
   marked synthetic. No archived session was reactivated and no participant
   decision was created. The machine-checkable blocker evidence and exact
   dependency are in `gc09-move-change-hosted-verification.md`.
2. Operational exercise approval and activation, manual keyboard/screen-reader/
   zoom/mobile/reduced-motion review, a deployed frontend check, physical media
   audibility and media-owner approval remain separate requirements.
3. Browser-local upload remains a deliberate limitation: assignment notices do
   not transfer files. Historical narration and image media remain stale until
   approved replacements exist.

## Reproduce retained evidence checks

Run from the repository root:

```powershell
$gc09EdgeEvidence = 'test-results/gc09-edges/c8402293-e61e-43e3-b0af-35f4209b99fe'
node --preserve-symlinks --preserve-symlinks-main "$gc09EdgeEvidence/attempt-2/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC09 edge evidence verification failed.' }
```

Expected: `FAILED_CAPABILITY_CHECKS`, consistent artifact hashes, six archived
sessions, the unified-cache defect, the move-race evidence gap, and both overall
gates `NOT_PASSED_BY_THIS_RUN`. This command verifies retained evidence; it does
not rerun the browser or database.
