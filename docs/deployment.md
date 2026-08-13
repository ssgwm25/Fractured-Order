# Deployment

This project deploys as a root-level Vite multi-page app through GitHub Pages.

Builds and rehearsals must follow the
[repository artifact policy](repository-artifact-policy.md): keep generated
build, browser-test, coverage, recording, report-build, and local evidence
output out of Git. Curated published artifacts under `pli/deliverables/` remain
trackable and are not deployment output.

## Migration-First Release Order

Rehearse every release in a dedicated, non-production Supabase project. Apply
database changes first, in the 37-step dated order documented in
`docs/supabase-setup.md`, ending at
`data/2026-08-13_action_notification_delivery.sql`. Record the project reference,
final migration identifier, operator, and UTC completion time. Verify RPCs,
RLS, append-only review/thread records, RFI history, and research-export
reconciliation before advancing.

Deploy the matching frontend second from one clean commit. Record the commit
SHA and the deployed asset evidence, then run the complete rehearsal matrix
against the dedicated live project. Run the same matrix against the
deterministic mock from that same commit and declared migration state; a mock
pass cannot substitute for the live Supabase pass.

For containment, roll back the frontend first and leave additive schema,
`artifact_workflow_reviews`, proposal thread rounds, and accepted RFI history
intact. Follow `docs/supabase-rollback.md`; do not reverse dated migrations in a
live or shared environment.

## Current-Head Evidence Contract

A release evidence bundle is current only when it contains all of the
following from the candidate head:

- the clean source commit SHA and the deployed frontend commit SHA, which must
  match
- the verified final migration identifier
  `2026-08-13_action_notification_delivery`
- the dedicated rehearsal deployment URL, unique run ID, UTC start/end times,
  and operator
- mock and live-Supabase results produced from the same commit and migration
  state
- Playwright reports and `playthrough-diagnostics.json`, plus the downloaded
  schema `1.9.0` / format revision `10` research archive and its passed manifest
  reconciliation

An uncommitted working-tree run is useful development feedback but is not
current-head release evidence. Historical reports, screenshots, archives, or
session rows never satisfy a current candidate gate, even when they previously
passed.

## Explicit Release Blockers

Do not release when any of these is true:

- the rehearsal project is missing a migration, its final migration identifier
  differs, or its RPC/RLS verification is incomplete
- the hosted frontend commit cannot be proven to match the clean candidate
  commit, or hosted assets are stale
- either the deterministic-mock matrix or the live-Supabase matrix fails, is
  skipped, uses another commit/migration state, or lacks current-head artifacts
- workflow/revision reconciliation fails; return notes, reviewers, timestamps,
  recipient approvals, immutable proposal rounds, notification metadata, or
  RFI return/resubmission/answer history are missing
- a current decision surface exposes an outcome badge, a notification is
  duplicated after startup/reconnect, dismissal does not persist, or recipient
  proposal threads leak across teams
- rollback readiness has not been rehearsed as frontend-first containment with
  additive schema and accepted history preserved

## GitHub Pages Workflow

The deployment workflow is `.github/workflows/deploy-pages.yml`.

Required repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional repository secret:

- `PAGES_ENABLEMENT_TOKEN`, used only when the workflow must bootstrap GitHub Pages publishing.

The Supabase anon key is browser-public runtime configuration. GitHub stores it as a repository secret so the workflow can inject it at build time, but after the Vite build it is visible to browser clients. Do not use a service-role key or any backend-only credential in a `VITE_*` variable.

## Pull-Request Frontend Validation

`.github/workflows/frontend-ci.yml` is the secretless frontend validation gate
for every push and pull request. It runs on Node 20 and executes, in order,
`npm ci`, `npm run verify:repo-artifacts`,
`npm test -- --run`, `npm run test:coverage`, and `npm run build`.

The production compilation receives only the exact, non-secret CI placeholder
URL and anon value declared in the build step. An inline guard rejects changes
to those values. The validation job references no production or repository
secret, has only read access to repository contents, and has no deployment or
identity-token permission.

Coverage output and the production `dist` bundle are uploaded with the
candidate SHA in their artifact names. Both upload steps run even when a check
fails, so reviewers retain whatever diagnostic output was produced. Superseded
runs for the same pull request or branch are cancelled automatically.

Local validation uses the same command sequence:

```powershell
npm ci
npm run verify:repo-artifacts
npm test -- --run
npm run test:coverage
npm run build
```

Pass: all five commands succeed; the `Frontend validation` workflow has no
secret reference, deployment action, or write permission; and its coverage and
build artifact uploads execute under `always()`.

## Deterministic Browser Gates

The same workflow runs two secretless Playwright gates after `Frontend
validation` succeeds:

- every pull request runs `npm run test:e2e:smoke` against the local
  deterministic backend
- every push whose ref GitHub marks protected runs the complete
  `npm run test:e2e:rehearsal` matrix against that same backend

Each browser job installs Chromium explicitly. CI permits a retry only on a
protected ref so that a first-attempt failure retains retry diagnostics, but
the custom gate reporter still fails a test that retries to success. Any
skipped test fails either job. A shared fixture observes every page created by
the suites and fails on any console error or uncaught page error.

The job summary records the browser actor count, created session count, retry
count, skipped count, unexpected browser-error count, and diagnostic filenames.
The HTML report, JSON diagnostics, failure screenshots, traces, and videos are
uploaded only as GitHub access-controlled workflow artifacts named
`playwright-smoke-<sha>` or `playwright-rehearsal-<sha>`. They are retained for
14 days and are never published through GitHub Pages. Missing diagnostic output
fails the artifact step instead of reusing historical evidence.

Local verification:

```powershell
npx playwright install chromium
npm run test:e2e:smoke
npm run test:e2e:rehearsal
```

Pass: both commands use the local deterministic backend and finish with zero
skipped tests, zero retries, zero unexpected console/page errors, and a fresh
diagnostic JSON attachment for every test. The complete rehearsal summary
reports 60 browser actors across seven created sessions; the smoke summary
reports one browser actor and one created session.

## Build Contract

The workflow must publish the built `dist` artifact. It must not publish raw source HTML that points directly at `./src/main.js` or role modules.

Local production build:

```powershell
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<anon-key>"
$env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"
npm run build
```

Pass:

- `dist/index.html` exists.
- built HTML references `/Fractured-Order/assets/*.js`
- built HTML does not reference `./src/main.js`
- built HTML does not reference `./src/roles/landing.js`
- production source maps are not emitted by default

## Hosted Source Verification

Known live URL:

```text
https://ssgwm25.github.io/Fractured-Order/
```

Check hosted source:

```powershell
Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Pass:

- page source contains `/Fractured-Order/assets/`
- page source does not contain `./src/main.js`
- page source does not contain `./src/roles/landing.js`

## Workflow Verification

```powershell
gh run list --workflow deploy-pages.yml --branch main --limit 5
gh run view <run-id> --log
```

Pass:

- latest run succeeds
- Supabase secret validation passes
- `npm ci` runs
- `npm run build` runs
- `.nojekyll` is added to `dist`
- Pages artifact upload and deploy complete

## Failure Handling

Participants and facilitators see recovery-oriented copy only: check the connection, try again, or contact the exercise facilitator. The blocking notice must not display Supabase error text, environment variable names, project references, or setup instructions. Use browser/operator logs to identify the corresponding technical cause.

- Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`: add repository secrets and rerun the workflow.
- Placeholder Supabase values: replace placeholders with the real project URL and anon key.
- Raw-source hosted HTML: verify the workflow uploaded `dist`, not the repository root.
- Pages not enabled: enable Pages manually for GitHub Actions or provide `PAGES_ENABLEMENT_TOKEN`.
