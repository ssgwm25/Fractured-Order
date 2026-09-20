# GC-06 hosted backend and concurrency rehearsal

The runner creates its own three isolated sessions, configures their Green
staffing through the existing backend RPCs before any seat is claimed, exercises
the workflow and archives the sessions. GC-08 creation screens are unnecessary.
No existing exercise is converted. No new migration is included in this tooling.

Status: the human-run local-frontend/hosted-backend rehearsal below passed.
The agent inspected its saved evidence without running tests, builds, hosted
requests, SQL, migrations or deployments. Deployed-URL verification remains
separate. Earlier GC-06 reports retain their earlier source and scope.

## Verified human-run evidence: 2026-09-20

The supplied Vitest 1.6.1 output reports **114 tests passed across four files**:
GC-06 live runner 33, GC-05 live runner 60, GC-06 SQL runner 3 and proposal mock
regressions 18. Start time was `01:15:24`, duration `2.47s`; the terminal summary
does not itself include a date, source hash or timezone.

The agent then read the saved report and manifest for run
`03f94fbd-aeeb-480a-8fd2-b944426d1a51`. The report is at
`test-results/gc06-live/03f94fbd-aeeb-480a-8fd2-b944426d1a51/results.json`, with SHA-256
`096c73f3c0a156fd3541b7e006db0dea5ec00e0f470799dc286f6bbbbd1e8854`.
It records:

- UTC start `2026-09-20T05:16:50.568Z`, finish `2026-09-20T05:19:32.812Z`.
- Project `gsromgrxgrwwfywaoyme`, PostgreSQL 17.6; target
  `local-assets-hosted-auth-rpc`, URL `http://127.0.0.1:4174/Fractured-Order/`.
- Source HEAD `59810bc807ef76b45c3d3d4d0f31c78bbe4aeb7b`, with the worktree
  content separately captured. Its before/after source digest matches:
  `eb018923bde122c021e3c7c91b69b023afe3876043367d19c27af93caf7740b4`.
  The five runner modules and new test file still matched their recorded hashes
  when inspected. This documentation update is subsequent to that source snapshot.
- 56 matched local build assets, 18 distinct Auth users and 18 successful sign-outs.
- `passed`, `workflowPassed`, `racesPassed` and `cleanupPassed` all true; no
  recorded run/cleanup error. The report contains 548 request records and 37
  labelled check records, not 548 independent assertions.
- RLS enabled on all seven checked tables; identical before/after database
  function/policy fingerprints. Shared and paired orientation return/resubmission
  checks and the shared RFI/direct-message denials are included.

| Race | Connection A | Connection B | B wait (ms) | Recorded outcome |
| --- | --- | --- | --- | --- |
| Regional drafts | 1207107 | 1207106 | 1171.262 | Distinct regional artifacts |
| Identical retry | 1207110 | 1207111 | 1039.346 | Same artifact returned |
| Stale submission | 1207114 | 1207113 | 1022.176 | One winner, stale competitor rejected |

Both sides report matching connection pairs, A observed B blocked, and each race
has a separate committed-state receipt. These are real PostgreSQL connections
using simulated identity claims; hosted participant workflows use real Auth tokens.

| Model | Archived session ID | Retained actions | Retained communications |
| --- | --- | --- | --- |
| Shared | `366684d6-892a-4c2d-b96f-6dfbf4d28083` | 8 | 22 |
| Paired | `9ac04d3f-7623-4fc4-8343-4ea043157e29` | 4 | 22 |
| Unified | `7e026d5b-df24-4b91-8e5f-5b5daf3e6a89` | 1 | 10 |

Independent cleanup receipts show all three archived, zero active seats, zero
remaining grants for fixture users, unchanged artifact/thread/review/action-log
and pre-closure research-history counts/digests, and one SESSION_CLOSED event each.
All five main proposals completed revision two; the unified proposal retained
null delegation. Individual artifact and thread IDs remain in the report.

This supplies the previously missing hosted-backend workflow, connection-race
and archival-cleanup evidence for this candidate. No cleanup retry or migration
rerun is needed for this successful run. It does not establish deployed-URL or
human browser/accessibility evidence, operational roster approval or migration
execution receipts. Full acceptance remains a separate human decision. Preserve
this run directory unchanged. Before a future run, repeat prepare/build/seal:
recording this evidence changes documentation included in the source fingerprint.

## What the runner does

| Fixture | Authenticated users | Ownership |
| --- | --- | --- |
| Shared Facilitator | Two regional Scribes, one shared Facilitator, White Cell, Blue and Red | Separate Asia-Pacific and Europe proposals |
| Paired Facilitators | Two regional Scribes, two matching Facilitators, White Cell, Blue and Red | Original four-seat regional handoff |
| Unified Green | Original Green author/reviewer roles, White Cell, Blue and Red | Null delegation, unchanged legacy role mapping |

There are 18 separate real Supabase anonymous Auth users. Each token is confirmed
through `/auth/v1/user`; participant operations use that user's public-key/Bearer
requests to the real PostgREST backend. These are authenticated synthetic users,
not named human staff accounts or service-role impersonation. Auth tokens and the
Management API personal access token stay in memory and are redacted from reports.

Fixture names begin `GC06 SYNTHETIC REHEARSAL`; session IDs, codes, Auth user IDs,
seat IDs and staffing models are recorded in `manifest.json`. A unique registry
version contains only the approved represented members: ROK/Japan/ASEAN and
UK/France/EU, with the South Korea alias. Its approval/source labels explicitly
say synthetic rehearsal, not exercise approval. Shared and paired sessions freeze
that roster; the unified fixture retains its legacy null regional-roster fields.

Setup is one transaction. Temporary session-scoped Game Master grants allow the
existing configuration RPCs to run, then are removed before joins. White Cell
gets only its fixture's grant. Setup/cleanup use a run-specific advisory lock so
a timed-out setup cannot be mistaken for an absent fixture while still writing.

For both regional models the runner saves simultaneous drafts with the same
client key; verifies isolation, invalid-originator and wrong-region denials;
forwards, edits and submits; rejects stale/double submissions; approves Blue;
returns the artifact; checks revision increment, preserved prior approval and
cleared handoff; corrects and resubmits; and separately approves Blue and Red.
Both recipients negotiate through White Cell, with round two returned through
the originating Facilitator. Released responses must be visible to the owning
Scribe and hidden from the other Scribe/recipient. Direct RLS writes to private
drafts and forged artifact/thread ownership/type/recipient metadata are tested.
Shared RFI/direct-message creation remains denied. Regional orientations get a
separate handoff, submission, return and correction regression, including a
proposal-RPC attempt against an orientation artifact. Unified behavior retains
its historical thread keys and approval-root uniqueness.

Three additional SQL races use two concurrently dispatched Management API
requests, each with its own transaction. They test different regions with the
same key, identical draft retries, and competing submissions of the same version.
The transactions execute RPCs as `authenticated`, using simulated JWT claims of
the already verified hosted users. Their evidence is explicitly labelled as
simulated identity SQL; it is separate from the real Auth HTTP workflow evidence.
Both requests must settle before cleanup. Matching, distinct PostgreSQL backend
PIDs, observed lock blocking, at least 500 ms of measured waiting, correct outcomes,
and an independent committed-state query are required. Reusing one connection or
merely starting two promises cannot pass. A duplicate retry must return one row;
a stale submission must fail with PT409 while the winner changes the row once.

## Prerequisites

- Use a rehearsal Supabase project with the existing migration chain installed
  through `2026-09-27_gc06_released_thread_round_order.sql`, including GC-04A,
  GC-05 and the September 26 GC-06 migration. Keep **RLS enabled**. If these are
  already installed, do not rerun them for this runner.
- Existing Node/npm dependencies, Git and outbound HTTPS must work. The runner
  adds no dependency and does not install anything.
- `.env.local` must contain this project's existing `VITE_SUPABASE_URL` and
  public `VITE_SUPABASE_ANON_KEY`. No service-role or secret key is accepted as
  the public key. The runner prompts for a Supabase **personal access token**
  with Management API database-query access. Do not put it in `VITE_*` settings.
- Anonymous Auth must be enabled for this rehearsal project, with capacity for
  18 new identities. Rate limits, disabled sign-in or CAPTCHA requirements can
  block provisioning. Do not relax production settings to force a pass. Partial
  provisioning is recorded and successful identities are signed out; no session
  setup occurs until all 18 identities have been confirmed.
- Keep the candidate source unchanged throughout prepare/build/seal/run. Dirty
  worktrees are allowed and recorded using HEAD, status and file SHA-256 hashes,
  including untracked source. Changing source invalidates the build receipt.

## Human-run commands

First run the narrow runner tests. They use fake responses and generated SQL
strings; they do not call Supabase or execute SQL.

```powershell
Set-Location 'C:\Users\ssnguna\Local Sites\Fractured-Order'
npm test -- tests/unit/gc06-live-check.test.js tests/unit/gc05-live-check.test.js tests/unit/gc06-sql-runner.test.js src/services/database.gc06-proposals.test.js
if ($LASTEXITCODE -ne 0) { throw 'GC06 verification-runner regressions failed. Stop here.' }
```

Pass: every selected test passes without skips. Runner regressions cover fixture
containment, exact roster membership, legacy seat receipts, zero-row RLS denials,
failed/partial cleanup, preserved history, missing prerequisites, stale receipts,
distinct connections, both-request settlement and committed-state verification.

For a local frontend with the **real hosted backend**, use the following in
terminal 1. This is the shortest path to exercising the missing workflows; it
does not require publishing a deployment or creating a session through the UI.

```powershell
Set-Location 'C:\Users\ssnguna\Local Sites\Fractured-Order'
$env:VITE_PUBLIC_BASE_PATH = '/Fractured-Order/'
node scripts/gc06-live-check.mjs prepare
if ($LASTEXITCODE -ne 0) { throw 'GC06 source capture failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'GC06 build failed.' }
node scripts/gc06-live-check.mjs seal
if ($LASTEXITCODE -ne 0) { throw 'GC06 build sealing failed.' }
node tests/e2e/support/staticServer.mjs dist 4174
```

Keep terminal 1 running. In terminal 2:

```powershell
Set-Location 'C:\Users\ssnguna\Local Sites\Fractured-Order'
$env:GC06_BASE_URL = 'http://127.0.0.1:4174/Fractured-Order/'
node scripts/gc06-live-check.mjs --local
if ($LASTEXITCODE -ne 0) { throw 'GC06 rehearsal failed. Preserve the printed evidence directory and inspect cleanup status.' }
```

The terminal prints the run UUID, target project, fixture IDs, evidence directory
and progress. Enter the personal access token at its hidden prompt. An existing
`SUPABASE_ACCESS_TOKEN` environment variable is also supported by the shared
operator tooling; it is never written into a build or evidence payload.

To collect evidence against a **deployed URL**, first build for that exact base
and seal it. Replace the prompt's answer with your actual HTTPS app directory,
including its trailing slash:

```powershell
Set-Location 'C:\Users\ssnguna\Local Sites\Fractured-Order'
$env:GC06_BASE_URL = Read-Host 'Deployed HTTPS app directory URL, including trailing slash'
$env:VITE_PUBLIC_BASE_PATH = ([uri]$env:GC06_BASE_URL).AbsolutePath
node scripts/gc06-live-check.mjs prepare
if ($LASTEXITCODE -ne 0) { throw 'GC06 source capture failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'GC06 build failed.' }
node scripts/gc06-live-check.mjs seal
if ($LASTEXITCODE -ne 0) { throw 'GC06 build sealing failed.' }
```

Publish **that exact `dist`** using the project's existing release process, retain
its deployment receipt, and wait until the supplied URL serves it. The runner
does not deploy. A separately rebuilt CI bundle needs its own matching source/
build receipt; do not label unrelated local output as the deployed artifact.
Then, in the same configured terminal:

```powershell
node scripts/gc06-live-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'GC06 hosted rehearsal failed. Preserve results and inspect cleanup status.' }
```

Before creating users, the runner verifies the source/build receipt and compares
every built HTML/JS/CSS/JSON file with the tested URL, recording hashes and HTTP
ETag/Last-Modified headers. It also requires a built JavaScript asset to identify
the same hosted Supabase project. Missing/mismatched assets stop the rehearsal.
This checks asset parity, not visual rendering or a browser click-through.

## Results and recovery

Every run writes under `test-results/gc06-live/<run-uuid>/`, which is ignored by
Git. Keep the entire directory, including failures:

- `manifest.json`: exact fixture, roster, Auth-user and seat identities.
- `results.json`: source/build/deployed-asset records; project/database identity;
  installed function fingerprints, policies and RLS state before/after; timestamped
  HTTP responses; artifact IDs/revisions; workflow and race outcomes; cleanup and
  Auth sign-out results. No passing verdict is emitted for a partial run.
- Individually named SQL files: exact statements and hashes recorded before
  dispatch, including setup, races and independent cleanup reads.
- `cleanup.sql`: guarded archive script for the recorded fixtures. Prefer the
  recovery command below because it also checks presence and retains receipts.

Pass requires exit code zero and `passed`, `workflowPassed`, `racesPassed`, and
`cleanupPassed` all true. All three sessions must be archived, with zero active
seats and zero grants for the fixture users. Proposal, communication, workflow
review, action-log and pre-closure research-history counts/digests must remain
unchanged, with one added SESSION_CLOSED event per newly archived session.
The synthetic roster, Auth identities and historical rows are retained. Auth
sessions are signed out; closed seats and removed grants deny access immediately
even while an already issued access JWT awaits expiry. This is archival cleanup,
not deletion of historical evidence.

On a failed run, cleanup still runs. Ctrl+C requests orderly interruption and
cleanup after current requests settle; leave the terminal open. A killed process,
lost network or machine shutdown may require recovery. Use the printed run UUID:

```powershell
$gc06Run = Read-Host 'Run UUID printed by the failed GC06 rehearsal'
node scripts/gc06-live-check.mjs cleanup $gc06Run
if ($LASTEXITCODE -ne 0) { throw 'GC06 cleanup remains unconfirmed. Retain the receipt for inspection.' }
```

Recovery validates the manifest and exact database fixture labels/models/roster,
refuses partial sets or unrelated grants, and writes `cleanup-retry-<uuid>.json`.
It does not rewrite the original result or turn a failed rehearsal into a pass.
If setup never committed, recovery requires no fixture roster or grants to exist.
A recovery process has no original Auth refresh tokens: it archives/revokes
fixture authority but cannot sign out those original Auth sessions. That remains
visible in the interrupted run; do not claim a completed sign-out receipt.

## Evidence boundaries

A passing runner supplies hosted Auth/RPC workflow, actual SQL contention, source/
asset/database fingerprints, and independently confirmed archival cleanup. Local
mode is labelled `local-assets-hosted-auth-rpc`, not a deployment result. Race
identity simulation and real hosted Auth requests are reported separately.

It does not mark the GC-06 acceptance gate passed, create operational roster
approval, prove migration execution receipts, automate named staff browser
sign-in, or replace accessibility/mobile and orientation-completion-gate checks.
Retain the migration/deployment receipts and current prerequisite/unit/browser/
SQL evidence described in [the GC-06 implementation record](gc06-regional-proposals.md).
Installed function fingerprints establish what was tested, not a fabricated
migration ledger. Run this candidate and review its fresh results before sign-off.

Scope addition: five Node verification modules, narrow unit regressions and this
runbook. No runtime permission change, PLI change, roster expansion, new database
object or GC-08 creation surface is introduced.
