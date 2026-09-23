# GC09 regional Notetaker move-change hosted verification

Read-only fixture audit performed September 23, 2026 against rehearsal project
`gsromgrxgrwwfywaoyme`.

**BLOCKED_NO_LEGITIMATE_FIXTURE.** The requested browser race was not run. This
is additional hosted robustness coverage, not a GC09 implementation-acceptance
criterion or a prerequisite for starting GC10. The result does not pass an
overall operational gate and does not change the prompt-book status.

## Fresh fixture findings

Evidence is retained under
`test-results/gc09-move-race/8a44730e-dc30-40f4-9315-b3c711a78e73/`.
Both Management API queries were submitted with `read_only: true`; the retained
receipts contain their SQL hashes and no credential.

The active-session audit found seven active sessions and six complete Strategic
Orientation gates. All six qualified sessions are legacy unified sessions with
no regional topology, shared/paired model, or regional Notetaker seat. They
cannot exercise either `green_asian_pacific_notetaker` or
`green_europe_notetaker` authorization boundary.

The historical audit found 72 regional sessions and zero active regional
sessions. Three archived shared-model sessions have complete five-team gates.
All three session names are explicitly synthetic, and all fifteen contributing
orientation rows retain explicit synthetic/prerequisite markers:

| Code | Status | Qualification provenance |
| --- | --- | --- |
| `GC04-E9A5553B-B851-4F52-9B18-587C7B437C73` | Archived | Five synthetic orientation rows |
| `GC04-F2C25E5A-8B88-4B91-A211-B04B92BEED0C` | Archived | Five synthetic orientation rows |
| `GC0881B8E539` | Archived | Five synthetic orientation rows; GC08 synthetic-only session |

None is a legitimate GC09 fixture. Reactivating one would violate archive
history and recovery guarantees. Treating its synthetic prerequisites as
participant decisions would violate the verification instruction. No new
orientation, proposal, action, note, capture, seat, move, phase, or session
record was created or changed.

## Unexecuted capability assertions

Without an active legitimate regional fixture, the run cannot honestly assert:

- a move-1 save committed before transition remains persisted;
- a save initiated after transition is rejected or reconciled against move 2;
- a delayed move-1 response cannot repopulate a move-2 editor;
- Asia-Pacific and Europe retain server-enforced note isolation across the move;
- the used fixture is archived after the race.

These behaviors retain unit coverage and related removal-race evidence, but this
run supplies no hosted move-change proof.

## Follow-up fixture lookup

After the fixture dependency was requested again, a separate fresh read-only
lookup completed at `2026-09-23T18:10:47.411Z`. Evidence is retained under
`test-results/gc09-move-race/767446e1-6bcb-429a-b482-5ee5055935be/`.
It again found 72 historical regional sessions, zero active regional sessions,
three qualified archived synthetic sessions and zero usable candidates. None of
the archived qualified sessions has an active regional Notetaker seat. Therefore
both regional seats are unavailable in any lawful target, no lawful move advance
can be attempted, and no archive action is required because no fixture was
opened. The browser workflow was not started.

## Required dependency

Provide one active shared or paired regional session whose orientation gate was
completed through legitimate participant workflow. It must have a current state
that can lawfully advance, both canonical regional Notetaker seats available or
restorable through normal authenticated claims, operator authority for the move
transition, and authorization to archive the fixture after evidence capture.
Do not seed, relabel, promote, or infer orientation decisions to meet this
dependency, and do not reactivate an archived session.

This dependency applies only when the additional hosted move-change race is
resumed. GC10 may proceed using the already implemented GC04A identity/model,
GC05 orientation and GC06 proposal ownership/revision contracts.

## Retained evidence verification

This command verifies retained hashes, counts, provenance markers, and blocker
classification. It does not query the backend or run a browser:

```powershell
$e = 'test-results/gc09-move-race/8a44730e-dc30-40f4-9315-b3c711a78e73'
node --preserve-symlinks --preserve-symlinks-main "$e/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC09 move-change blocker evidence is inconsistent.' }
```

Expected: `BLOCKED_NO_LEGITIMATE_FIXTURE`, `CONSISTENT`, 28 assertions, seven
active sessions, six qualified legacy sessions, zero active regional sessions,
72 historical regional sessions, three qualified archived synthetic sessions,
zero usable fixtures, and `NOT_PASSED_BY_THIS_RUN`.
