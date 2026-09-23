# GC08 hosted recovery verification — September 22, 2026

## Task and result

This GC08 verification task is complete. **GC08 acceptance is not complete.**
The run found one actual preservation defect: operator removal in a unified
session deletes the historical seat and its display-name snapshot. Regional
removal retains those records. The final result is **FAILED_CAPABILITY_CHECKS**
with consistent evidence, 188 successful verification/diagnostic assertions and
one capability failure. A diagnostic assertion confirming the failure is not a
passing preservation check.

GC09 implementation and its previously verified repairs remain complete for
their recorded scope. This task did not start GC10, change application code,
apply migrations, rerun unit/SQL suites, or deploy anything. Neither overall gate
is passed, and the prompt-book status table is unchanged. The earlier
[GC08 handoff](gc08-implementation-handoff.md) remains a historical assessment;
this fresh finding qualifies its earlier statement that no unfixed capability
gap was known.

## Evidence and binding

Retain the complete directory outside Git under the repository artifact policy:

`test-results/gc08-recovery/8e25db29-c40c-4042-8c0c-9c4b707437f6/`

| Item | Evidence |
| --- | --- |
| Result and integrity | `verification-summary.json`, `artifact-manifest.json`, `verify-evidence.mjs` |
| Current source and fresh build | `build-intent.json`, `build-receipt.json`, `build.log`, `end-source.json`; isolated `dist/` |
| Actual served bytes | `served-binding.json`: all 314 built files, including media, matched |
| Backend definitions, policies and registry | `database-before.json`, `database-after.json`, their retained SQL; `administration-functions.json` |
| Private receipt boundary | `receipt-boundary-before.json`, `receipt-boundary-after.json`; RLS, no anon/authenticated SELECT, immutable trigger |
| Authenticated browser/RPC workflows | `checks.json`, numbered `request-*.json`, `response-workflow-*.json`, `recovery-*.json`, screenshots |
| Removal and cleanup | `revocation-*.json`, `whitecell-recovery-*.json`; corrected shared checks use `shared-repeat` filenames |
| Committed history | `readback-before-archive.json`, `readback-archived.json`, `unified-retention.json` |
| Cleanup | Three `archive-*.json` receipts; `auth-signouts.json`: 22 successful global sign-outs |
| Prior failed evidence preserved | `failed-run-before.json` and final verifier inventory comparison against the complete GC09 failed run `224fdbf7-7105-4d34-a472-fc7ee088c349` |

Project: `gsromgrxgrwwfywaoyme`. Frontend:
`http://127.0.0.1:4174/Fractured-Order/`.
HEAD: `1acf872b682618c7000b66ec5a88288f18248797`, with existing uncommitted work.
Build source digest:
`78d6f6cfb9035cd2a64d9e77de400d8fca8067721ed5a5cbcf33f1fb5113e550`.
That complete source inventory equals the final source inventory of the repaired
GC09 run `41a88932-6821-495b-a9f2-9447b195cec0`. Only this verification document
is allowed to differ between this run's build and final source seal.

All three installed GC08 administration function bodies match current migration
source after CRLF normalization; execute boundaries are retained. Captured
definitions/policies, approval records and unrelated session rows—including
NULL-coded sessions—were unchanged across the run. This establishes installed
behavior, not a newly supplied original migration-execution receipt.

The unchanged roster
`green-roster-v172430443271577141009078629179796019649` remains explicitly
synthetic. No approval was added or promoted. Its membership remains ROK, Japan,
ASEAN; UK, France, EU, with South Korea mapped to ROK.

| Model | Session | Final status |
| --- | --- | --- |
| Shared | `GC088E25DB29S` / `2f0e728a-1a72-4df2-8e98-f0b9c833abb8` | Archived |
| Paired | `GC088E25DB29P` / `6dade3b7-a9d0-4868-85a1-bc304eb23479` | Archived |
| Unified | `GC088E25DB29U` / `03f901e6-72d8-44d7-89b9-67a3d4fc7091` | Archived |

Shared creation used the normal Game Master UI. Paired/unified setup used the
existing authenticated creation/configuration RPCs before joins. This is not a
new claim of paired creation through a UI selector. All browsers used the real
backend; no mock backend, fabricated server result or browser role override
conferred authority.

## Verified coverage

| Coverage | Shared | Paired | Unified |
| --- | --- | --- | --- |
| Authenticated startup | Three Green roles, Blue/Red recipients, White Cell Lead | Four Green roles, Blue/Red recipients, White Cell Lead | Two legacy Green roles, Blue/Red recipients, White Cell Lead |
| Proposal and recipient threads | Both regional workflows; separate Blue/Red rounds | Both regional workflows; separate Blue/Red rounds | Legacy workflow; separate Blue/Red rounds |
| Orientation/RFI compatibility | Regional orientation return/resubmit, RFI return/correct/answer and direct-message isolation | Same, with paired ownership denials | Legacy RFI creation/answer, NULL delegation retained |
| Concurrent submission and stale review | Two actual HTTP submissions from shared Facilitator; separate records; stale review denied | Independent regional submissions; stale review denied | Existing unified revision/return contract |
| Missed-event recovery and reload | All five participant workspaces plus White Cell Lead | All six participant workspaces plus White Cell Lead | All four participant workspaces plus White Cell Lead |
| Green removal | All three role types; corrected shared repeat | All four role types | Both legacy role types |
| White Cell removal | Lead | Lead | Lead |

Recovery used real browser offline/online transitions. White Cell sent targeted
messages while participant browsers were offline; Blue submitted an RFI while
White Cell was offline. The actual application's subsequent GET responses and
rendered DOM proved recovery. Reload retained seat identity. Captured regional
snapshots excluded foreign ownership, and Blue/Red snapshots excluded the
opposite recipient thread. Private draft content was absent from tested timeline
reads. Regional scope was checked through authenticated reads and writes, not
only DOM filtering.

Removal used the real operator RPC and normal timers. Workspace DOM and scoped
local/session storage were cleared; regional Facilitator IndexedDB probes were
deleted while unrelated probes remained. Removed identities received empty
private-table reads and authorization denials on restore and writes. Removed
White Cell Leads also lost review authority. Immediate realtime delivery to a
revoked identity is not asserted: heartbeat fallback remains necessary.

Every session retained one clock. Archival preserved actions, RFIs,
communications, reviews, timeline rows, topology/roster and **the seat rows still
present immediately before archive**. This narrower archive result must not be
used to conceal the unified removal failure below.

## Actual GC08 capability gap: unified removal loses seat-name history

The installed `operator_remove_session_participant` delegates unified sessions
to `gc03_legacy_remove`. The legacy function executes
`DELETE FROM public.session_participants`; the regional branch instead marks
seats inactive/revoked. Relevant source:

- `data/2026-09-19_green_regional_authorization.sql`, unified removal branch.
- `data/2026-04-17_white_cell_backend_alignment.sql`, underlying legacy deletion.
- `data/2026-08-26_session_role_name_snapshots.sql`, snapshot column and insert/update trigger.

The new unified fixture began with five seats. After removing its two Green
seats and White Cell Lead, only the two recipient seats remained. Missing IDs:

| Role | Deleted seat |
| --- | --- |
| `green_facilitator` | `a45884ba-8fc8-4d6d-aa06-11054f0cb183` |
| `green_scribe` | `07870217-53b6-4a2b-820d-9e829dba18ed` |
| `whitecell_lead` | `c9d9f277-c20f-4b0c-b534-3fdaee6ebfdd` |

Startup, removal responses, independent committed readbacks and installed
trigger definitions are retained. The captured immutable research audit events
contain no replacement `display_name_snapshot`. Browser receipts preserve this
test's evidence, but are not an application-side historical retention solution.
All original paired/shared seat-name snapshots survived removal and archive.

**Exact next implementation task:** close the unified removal retention gap with
an additive, forward-only database change. Preserve legacy authorization,
capacity/rejoin behavior and RPC response compatibility; retain immutable
session-role identity/name evidence and ensure removed users cannot recover
authority. Add narrow regression/SQL coverage for both unified Green roles and
White Cell, regional non-regression, and subsequent archive. Do not reconstruct
already deleted history, relabel unified sessions or reactivate these fixtures.
Then obtain fresh hosted removal/readback evidence on new fixtures.

That implementation and migration work expands this verification-only task; no
migration was authored or executed here. This is a GC08 retention requirement,
not a missing dependency for implementing GC09's already verified repairs.

## Retained harness failures

The initial sandbox build failure remains in `build-error.log`; the elevated
fresh build succeeded. A transport helper initially tried to JSON-parse an empty
PATCH response; the corrected helper requests `return=representation` and handles
empty bodies. The stopped attempt remains recorded.

The first shared Scribe cleanup probes omitted the shared-model suffix from their
storage keys. Those keys were outside the application's confirmed-seat namespace,
so retention was expected. The failed results and diagnosis remain intact. Three
new identities claimed the same now-vacant shared roles; none of the revoked
seats was reactivated. Corrected checks use separate `shared-repeat` receipts.
The shared session consequently retains nine historical seats, never an expanded
active role roster. This harness correction does not explain away the separate,
server-confirmed unified deletion defect.

## Human verification and remaining acceptance

From the repository root, verify retained evidence without network requests or
another database run:

```powershell
$e = 'test-results/gc08-recovery/8e25db29-c40c-4042-8c0c-9c4b707437f6'
node --preserve-symlinks --preserve-symlinks-main "$e/verify-evidence.mjs"
if ($LASTEXITCODE -ne 0) { throw 'GC08 evidence integrity verification failed.' }
```

Expected: exit 0, `evidenceIntegrity: CONSISTENT`, 188 recorded assertions and
`scopeResult: FAILED_CAPABILITY_CHECKS` naming the unified retention defect.
Both gates remain `NOT_PASSED_BY_THIS_RUN`. Exit 0 verifies the retained result
and hashes; it does **not** mean the capability or gate passed. Source/artifact
drift must fail verification. Preserve this directory; do not reseal it to hide
future changes or rerun its browser commands against archived fixtures.

Still separate: operational roster approval/activation; manual accessibility;
deployed frontend verification; original migration-execution provenance; other
operator roles, recipient removal and longer outage/session-expiry coverage.
No new independent two-connection proposal contention proof or broad regression/
SQL rerun is claimed. Existing GC08 creation contention receipts remain separate.

GC09's browser-local uploaded-deck fallback, stale narration/text guidance and
remaining hosted edge coverage remain as documented in
[the repaired GC09 verification](gc09-repair-hosted-verification.md). This run
does not repeat media expiry/autoplay denial, uncertain or overlapping Notetaker
saves, or pending-operation move/revocation races. Existing Notetaker seats,
represented membership, PLI behavior and earlier evidence were not changed.
