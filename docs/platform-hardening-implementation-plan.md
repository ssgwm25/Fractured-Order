# Plan

This plan closes the non-PLI platform gaps identified in the August 2026 audit through small, independently reviewable commits. The implementation order establishes reproducible verification first, then changes authorization and data lifecycle behavior, and finally addresses product quality, observability, repository hygiene, and structural technical debt.

## Scope

- In: deployment gates, White Cell session authorization, archive-first session lifecycle, greenfield Supabase provisioning, release evidence, accessibility and security automation, design-system reconciliation, monitoring and schema drift, repository hygiene, canonical role identifiers, and decomposition of oversized frontend controllers.
- Out: all PLI adjudication, PLI reports, PLI SME workflow, PLI Edge Functions, PLI CI, PLI data model, and other PLI-specific gaps. Exercise geography, team topology, scoring logic, and content design are also unchanged.

## Planning conventions

- Every step below is intended to be one mergeable commit unless its migration and application changes must be atomic.
- Commands are for the human implementer to run. A step is not complete until every listed command exits successfully and its manual pass conditions are recorded.
- Database changes are forward-only after they accept live writes. Application rollback must preserve additive columns, archive proofs, and audit records.
- New configuration requires aligned changes to `.env.example`, the deployment workflow, and the relevant operator documentation.
- New failure modes require safe structured logging, bounded metadata, and an operator response documented in a runbook.
- Current action, proposal, RFI, Strategic Orientation, and research-export contracts must remain backward compatible unless a step explicitly introduces an additive version.
- PLI files and behavior must not be changed as part of this plan.

## Target release gates

A production deployment may start only when all of the following are true:

1. The candidate worktree is clean and the candidate SHA matches the deployed SHA.
2. Unit, coverage, build, mock smoke, full deterministic rehearsal, accessibility, security, database reset, RLS isolation, and schema-drift checks pass for that SHA.
3. The dedicated rehearsal backend reports the required migration identifier.
4. The hosted live-backend rehearsal passes from the same SHA and migration state.
5. The release evidence bundle validates and contains no missing, stale, or mismatched artifact.
6. No release-blocking security, accessibility, data-loss, or database-drift finding remains open.

## Action items

- [ ] Complete Workstream 1: remove tracked dependencies and generated artifacts.
- [ ] Complete Workstream 2: add mandatory test and release gates.
- [ ] Complete Workstream 3: establish reproducible greenfield database provisioning.
- [ ] Complete Workstream 4: correct White Cell session scoping.
- [ ] Complete Workstream 5: replace hard deletion with archive-first soft deletion.
- [ ] Complete Workstream 6: produce current-head mock/live evidence bundles.
- [ ] Complete Workstream 7: add accessibility and security automation.
- [ ] Complete Workstream 8: resolve the recorded design-system defects.
- [ ] Complete Workstream 9: add production monitoring and database-drift detection.
- [ ] Complete Workstream 10: reduce role-identifier and large-controller technical debt.
- [ ] Run the final integrated release gate and record honest blockers.

---

## Workstream 1 — Remove tracked dependencies and generated artifacts

### Step 1.1 — Define the repository artifact policy

Changes:

- Expand `.gitignore` to exclude `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `.playwright-mcp/`, coverage output, local evidence bundles, generated recordings, and temporary report build files.
- Add `docs/repository-artifact-policy.md` defining which source, lock, fixture, migration, and intentionally published binary artifacts may be committed.
- Explicitly retain curated deliverables under `pli/deliverables/` without changing any PLI behavior.
- Add a short artifact-policy reference to `README.md` and `docs/deployment.md`.

Tests and verification:

```powershell
git check-ignore node_modules/.vite/vitest/results.json
git check-ignore test-results/.last-run.json
git check-ignore .playwright-mcp/page-example.yml
git check-ignore dist/index.html
git check-ignore coverage/index.html
npm test -- --run tests/unit/repo-docs-contract.test.js
```

Pass: every generated path is ignored, source fixtures remain trackable, and the documentation contract test passes.

Commit:

- Title: `chore: define repository artifact policy`
- Description: `Document the source-versus-generated artifact boundary and ignore dependency, build, browser-test, coverage, recording, and local evidence output without changing runtime behavior.`

# Completed 8/12/2026

### Step 1.2 — Remove generated content from the Git index

Changes:

- Remove tracked `node_modules/`, `.playwright-mcp/`, and `test-results/` content from the Git index while leaving the developer's local files recoverable through a fresh install or test run.
- Remove any tracked `dist/`, coverage, or temporary report output discovered by the artifact-policy scan.
- Do not remove authored fixtures, sample reports, codebook evidence, or intentional release documentation.
- Record before/after tracked-file counts in the commit description.

Tests and verification:

```powershell
npm ci
npm test -- --run
npm run build
$trackedGenerated = git ls-files node_modules .playwright-mcp test-results dist coverage
if ($trackedGenerated) { throw "Generated files remain tracked:`n$trackedGenerated" }
git status --short
```

Pass: install, unit tests, and build succeed; no generated directory remains tracked; only the intended removal and policy changes appear in Git status.

Commit:

- Title: `chore: remove tracked dependencies and test artifacts`
- Description: `Delete generated dependency and browser-test output from version control, preserving only reproducible source, lockfiles, fixtures, and curated deliverables.`

# Completed 8/12/2026

### Step 1.3 — Enforce the artifact boundary in CI

Changes:

- Add `scripts/verify-repository-artifacts.mjs` with an explicit denylist and allowlist.
- Make the script fail on tracked dependency folders, runtime secrets, test output, build output, browser storage, recordings, and unapproved generated reports.
- Add `verify:repo-artifacts` to `package.json`.
- Add focused tests for path normalization, Windows separators, nested artifacts, and approved curated binaries.

Tests and verification:

```powershell
node --check scripts/verify-repository-artifacts.mjs
npm run verify:repo-artifacts
npm test -- --run tests/unit/repo-docs-contract.test.js scripts/verify-repository-artifacts.test.js
```

Pass: the clean repository passes and a test fixture containing each prohibited path fails with a clear filename and remediation message.

Commit:

- Title: `ci: reject tracked generated artifacts`
- Description: `Add a cross-platform repository check that blocks dependencies, build output, browser artifacts, local evidence, recordings, and secrets from re-entering version control.`

# Completed 8/12/2026
---

## Workstream 2 — Add mandatory test and release gates before deployment

### Step 2.1 — Add pull-request validation for the frontend

Changes:

- Add `.github/workflows/frontend-ci.yml` for pushes and pull requests affecting application, tests, styles, HTML, package metadata, or workflows.
- Run `npm ci`, repository-artifact verification, unit tests, coverage generation, and the production build on Node 20.
- Upload coverage and build summaries as artifacts even when a later check fails.
- Add concurrency cancellation for superseded commits.
- Keep secrets out of pull-request jobs by using validated placeholder browser configuration only for build-time compilation.

Tests and verification:

```powershell
npm ci
npm run verify:repo-artifacts
npm test -- --run
npm run test:coverage
npm run build
```

Pass: every command succeeds locally and the workflow has no deployment permission or production secret dependency.

Commit:

- Title: `ci: add mandatory frontend validation`
- Description: `Gate pull requests with clean installs, repository hygiene, the complete Vitest suite, coverage generation, and a production Vite build.`

# Completed 8/12/2026

### Step 2.2 — Add deterministic browser smoke and rehearsal jobs

Changes:

- Extend `frontend-ci.yml` with Playwright browser installation and separate smoke and full deterministic rehearsal jobs.
- Run smoke on every pull request and the complete deterministic rehearsal on protected-branch pushes.
- Upload the HTML report, diagnostics JSON, screenshots, traces, and videos only as access-controlled CI artifacts.
- Fail when a test is skipped, retried to success on a protected branch, or produces an unexpected console/page error.
- Add a summary step listing actor count, session count, test retries, and diagnostic artifact names.

Tests and verification:

```powershell
npx playwright install chromium
npm run test:e2e:smoke
npm run test:e2e:rehearsal
```

Pass: smoke and rehearsal pass against the deterministic backend with zero skipped tests, zero retries, and no unexpected console or page errors.

Commit:

- Title: `ci: gate changes with browser rehearsals`
- Description: `Run the deterministic Playwright smoke path on pull requests and the full multi-actor rehearsal on protected-branch candidates, retaining diagnostics for review.`

# Completed 8/12/2026

### Step 2.3 — Decouple deployment from unverified pushes

Changes:

- Change `.github/workflows/deploy-pages.yml` to run only after the required validation workflow succeeds for the exact candidate SHA, or through a manually approved release workflow.
- Remove direct deployment authorization from an unverified `main` push.
- Add a GitHub `production` environment with required reviewers and a deployment concurrency group that does not cancel an active production deployment midway.
- Verify the downloaded build artifact SHA before deployment instead of rebuilding unrelated source.
- Record candidate SHA, artifact digest, initiating actor, and workflow run ID in the deployment summary.

Tests and verification:

```powershell
npm test -- --run vite.config.test.js tests/unit/repo-docs-contract.test.js
npm run build
git diff --check
```

Pass: the deployment job has an explicit successful validation dependency, deploys a digest-verified artifact from the same SHA, and cannot run from a failed or missing validation result.

Commit:

- Title: `ci: require validated artifacts for Pages deployment`
- Description: `Replace push-to-production behavior with an approved deployment that consumes the exact artifact produced by successful candidate validation.`

### Step 2.4 — Enforce coverage and release-policy thresholds

Changes:

- Add initial, evidence-based coverage thresholds to Vite/Vitest configuration for statements, branches, functions, and lines.
- Set thresholds no lower than the current measured baseline; require each later change to maintain or improve them.
- Add a ratcheting script that rejects threshold reductions without an explicit policy-file change and reviewer acknowledgement.
- Add branch-protection documentation naming every required check.

Tests and verification:

```powershell
npm run test:coverage
npm test -- --run vite.config.test.js tests/unit/repo-docs-contract.test.js
npm run verify:release-policy
```

Pass: coverage fails below the recorded thresholds, threshold reductions are detected, and required branch checks are documented by exact workflow/job name.

Commit:

- Title: `test: enforce coverage and release policy`
- Description: `Establish non-regressing coverage thresholds and a machine-readable release policy that names every mandatory validation check.`

---

## Workstream 3 — Establish reproducible greenfield database provisioning

### Step 3.1 — Introduce a pinned local Supabase toolchain

Changes:

- Add the Supabase CLI as a pinned development dependency or pin its exact version in the repository bootstrap scripts.
- Add `supabase/config.toml` for local Postgres, Auth, Realtime, and Storage behavior required by the platform.
- Add package scripts for `db:start`, `db:stop`, `db:reset`, `db:lint`, and `test:db`.
- Document Docker and CLI prerequisites without embedding credentials.
- Configure synthetic-only local seed data.

Tests and verification:

```powershell
npm ci
npx supabase --version
npm run db:start
npm run db:lint
npm run db:stop
```

Pass: the pinned CLI version is repeatable, local services start and stop, linting succeeds, and no real project identifier or credential is required.

Commit:

- Title: `build: pin the local Supabase toolchain`
- Description: `Add a reproducible local Supabase environment and standard database commands for schema reset, linting, integration tests, and clean teardown.`

### Step 3.2 — Create the reviewed pre-ledger base migration

Changes:

- Create a new baseline migration under `supabase/migrations/` containing only the pre-ledger tables, types, constraints, extensions, and minimal functions required before `2026-04-07`.
- Derive it through review of historical snapshots, but do not copy superseded broad policies or claim a deprecated snapshot is current.
- Add table and function ownership explicitly.
- Revoke broad default privileges and enable RLS before exposing tables.
- Add a manifest mapping every baseline object to its reviewed source and intended current owner.

Tests and verification:

```powershell
npm run db:reset
npm run db:lint
npm run test:db -- --suite baseline
npm test -- --run src/services/database.migration.contract.test.js
```

Pass: an empty local database reaches the pre-ledger state from one reviewed migration, has no allow-all policy, and exposes only the expected baseline objects.

Commit:

- Title: `db: add reviewed greenfield base migration`
- Description: `Define the minimal secure schema required before the dated ledger, with explicit ownership, RLS, privilege revocation, and object provenance.`

### Step 3.3 — Convert the dated ledger into canonical migrations

Changes:

- Copy the 33 authoritative dated migrations into `supabase/migrations/` using unique sortable timestamps that preserve documented same-day ordering.
- Keep `data/` copies temporarily as read-only compatibility references and add a checksum map proving each canonical migration matches its source.
- Add a script that fails when ledger order, count, filename, or checksum diverges.
- Record the final migration identifier in a database metadata table queried by release tooling.
- Do not include deprecated consolidated snapshots in the canonical path.

Tests and verification:

```powershell
npm run verify:migration-ledger
npm run db:reset
npm run db:lint
npm run test:db -- --suite schema-contract
npm test -- --run src/services/database.migration.contract.test.js tests/unit/repo-docs-contract.test.js
```

Pass: a clean reset applies the baseline plus all 33 migrations in order and the database reports the expected final migration identifier.

Commit:

- Title: `db: canonicalize the forward migration ledger`
- Description: `Move the reviewed dated ledger into the Supabase migration path, preserve same-day order, verify source checksums, and expose the applied schema identifier.`

### Step 3.4 — Add greenfield and upgrade-path integration tests

Changes:

- Add database integration tests that provision from zero, seed synthetic sessions, and exercise required RPC, RLS, trigger, Realtime-publication, and Storage contracts.
- Add a second fixture representing the last supported pre-current migration and verify forward upgrade without rewriting immutable workflow history.
- Check grants for `anon`, `authenticated`, and service roles explicitly.
- Add a destructive-policy scan that fails on allow-all policies, authenticated direct writes to immutable tables, or missing RLS.
- Publish sanitized schema-test logs in CI.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite greenfield
npm run test:db -- --suite upgrade
npm run test:db -- --suite rls
npm run test:db -- --suite storage
```

Pass: greenfield and supported upgrade paths reach the same schema fingerprint and all negative authorization cases fail closed.

Commit:

- Title: `test: verify greenfield and upgrade database paths`
- Description: `Exercise schema creation, supported upgrades, RPCs, triggers, RLS, grants, Realtime publication, and Storage from disposable local databases.`

---

## Workstream 4 — Correct White Cell session scoping

### Step 4.1 — Specify the authoritative operator boundary

Changes:

- Add `docs/operator-authorization-contract.md` defining Game Master as cross-session and each White Cell or SME grant as exact-session and exact-role.
- Inventory every use of `live_demo_has_operator_grant`, every privileged RPC, and every operator-facing table policy.
- Classify each operation as global Game Master, session-scoped White Cell, session-scoped SME, or participant-owned.
- Add a machine-readable authorization matrix consumed by contract tests.
- Document that browser storage is presentation state, never authorization evidence.

Tests and verification:

```powershell
npm test -- --run src/services/database.privileged.test.js src/services/database.policy.test.js tests/unit/repo-docs-contract.test.js
npm run verify:authorization-matrix
```

Pass: every privileged RPC and policy appears exactly once in the matrix and no White Cell operation is classified as implicitly global.

Commit:

- Title: `docs: define the operator authorization boundary`
- Description: `Document and machine-map cross-session Game Master authority versus exact-session White Cell, SME, and participant permissions.`

### Step 4.2 — Enforce session-scoped White Cell reads and writes in SQL

Changes:

- Add a forward migration changing `live_demo_can_read_session()` to call `live_demo_has_operator_grant('whitecell', requested_session_id)`.
- Update every White Cell-capable RPC to pass its requested session into the grant helper.
- Keep Game Master cross-session access explicit.
- Reject mismatches among requested session, artifact session, participant-seat session, and grant session before any mutation.
- Add safe audit rows for rejected cross-session privileged attempts without recording access codes or participant content.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite whitecell-session-isolation
npm test -- --run src/services/database.privileged.test.js src/services/database.policy.test.js src/services/database.seats.test.js src/services/database.migration.contract.test.js
```

Pass: White Cell can operate only inside its granted session, cross-session reads and mutations fail, and Game Master retains intended global administration.

Commit:

- Title: `security: scope White Cell grants to one session`
- Description: `Require exact-session White Cell grants in RLS helpers and privileged RPCs while retaining explicit cross-session Game Master authority.`

### Step 4.3 — Align the browser and deterministic mock with the scoped contract

Changes:

- Remove or disable White Cell controls that enumerate, create, select, or delete unrelated sessions.
- Ensure White Cell session management renders only the currently granted session.
- Require reauthorization when navigating to another session.
- Update `supabaseMock.js` to enforce the same session boundary rather than granting broader test-only access.
- Add explicit empty, authorization-expired, and reauthorization-required states.

Tests and verification:

```powershell
npm test -- --run src/roles/whitecell.test.js src/services/supabaseMock.test.js src/services/database.seats.test.js src/stores/session.test.js
npm run test:e2e:smoke
npm run test:e2e:realtime
```

Pass: White Cell never sees another session through UI or mock data, session switching requires a new grant, and cross-session Realtime data remains isolated.

Commit:

- Title: `fix: align White Cell UI with session-scoped grants`
- Description: `Limit White Cell browser and mock behavior to the authorized session and provide explicit reauthorization states for session changes.`

---

## Workstream 5 — Replace hard deletion with archive-first soft deletion

### Step 5.1 — Define the archive and retention contract

Changes:

- Add `docs/session-archive-retention.md` defining active, completed, archived, purge-eligible, and purged states.
- Define the minimum archive proof: session ID, export schema version, format revision, manifest digest, archive digest, reconciliation status, candidate SHA, migration identifier, exporter grant, and UTC timestamp.
- State that purge is unavailable until an owner approves a retention duration and recovery procedure.
- Define whether archived sessions remain readable to Game Master and are hidden from participant joins.
- Add incident and legal-hold behavior without inventing a retention duration.

Tests and verification:

```powershell
npm test -- --run tests/unit/repo-docs-contract.test.js src/features/export/researchExport.test.js
git diff --check
```

Pass: lifecycle transitions, required proof fields, legal holds, read behavior, and the absence of automatic purge are unambiguous.

Commit:

- Title: `docs: define archive-first session retention`
- Description: `Specify the evidence required before archival, archived-session visibility, legal holds, recovery, and the policy decision required before purge.`

### Step 5.2 — Add immutable archive proof and soft-archive schema

Changes:

- Add an append-only `session_archive_proofs` table and additive archive metadata on `sessions` if the existing status fields are insufficient.
- Add `register_session_archive_proof()` to validate a passed research manifest and bind it to the session, exporter, build SHA, and migration identifier.
- Add `archive_live_demo_session()` that requires Game Master authority, the latest valid proof, a matching session code confirmation, and no legal hold.
- Change session status to `archived`; do not delete dependent evidence.
- Deny update/delete of archive proofs to browser roles.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite session-archive
npm test -- --run src/services/database.migration.contract.test.js src/services/database.privileged.test.js
```

Pass: archival fails without valid proof, succeeds atomically with valid proof, preserves all dependent row IDs, blocks joins, and leaves archive proofs immutable.

Commit:

- Title: `db: add immutable archive-first session lifecycle`
- Description: `Persist validated archive proofs and replace evidence-destroying deletion with an atomic Game Master-only transition to archived status.`

### Step 5.3 — Replace deletion UI and service calls with archive workflow

Changes:

- Replace `deleteSession()` with an archive flow that first generates and validates the research archive, calculates its digest, registers proof, and then requests archival.
- Require typed session-code confirmation after archive creation.
- Show progress, retry, digest, download confirmation, and explicit failure states.
- Never mark the session archived when export generation, reconciliation, proof registration, or archive RPC fails.
- Rename UI copy, API methods, errors, tests, and runbook instructions from delete to archive.

Tests and verification:

```powershell
npm test -- --run src/roles/gamemaster.test.js src/roles/gamemaster.live.test.js src/services/database.privileged.test.js src/features/export/researchExport.test.js src/core/errors.test.js
npm run test:e2e:smoke
npm run build
```

Pass: no browser control calls the hard-delete RPC, failed export/proof steps preserve the active session, and successful archival retains evidence and hides the session from joins.

Commit:

- Title: `feat: replace session deletion with verified archival`
- Description: `Generate and register a reconciled research archive before a typed-confirmation soft archive, with fail-closed recovery at every step.`

### Step 5.4 — Remove browser execution rights from hard purge

Changes:

- Revoke authenticated execution of `delete_live_demo_session` or replace it with a function that always rejects and directs operators to archival.
- Reserve any future purge function for a server-only maintenance role and require retention eligibility, absence of legal hold, a second approval, and a fresh backup proof.
- Add a recovery runbook for unarchiving without rewriting evidence.
- Add a database test proving browser identities cannot hard-delete sessions or archive proofs.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite session-purge-denial
npm test -- --run src/services/database.migration.contract.test.js tests/unit/repo-docs-contract.test.js
```

Pass: `anon` and `authenticated` cannot execute a hard purge, archived evidence remains queryable by authorized Game Master, and the recovery procedure is tested.

Commit:

- Title: `security: remove browser session purge authority`
- Description: `Revoke hard-delete execution from browser roles and document controlled recovery and future retention-governed purge requirements.`

---

## Workstream 6 — Produce a complete current-head mock/live evidence bundle

### Step 6.1 — Define a versioned release-evidence manifest

Changes:

- Add `docs/release-evidence-schema.md` and a JSON Schema for the evidence manifest.
- Require source SHA, deployed SHA, build artifact digest, migration identifier, deployment URL, run IDs, UTC timestamps, operator, mock/live results, retry/skip counts, diagnostics digests, accessibility/security results, and research archive manifest digest.
- Define fail-closed rules for missing, stale, mismatched, manually edited, or cross-SHA evidence.
- Keep access codes, browser storage, session content, and participant names out of the manifest.

Tests and verification:

```powershell
npm test -- --run tests/unit/repo-docs-contract.test.js scripts/release-evidence-schema.test.js
npm run verify:evidence-schema
```

Pass: valid fixtures pass and fixtures with a missing artifact, mismatched SHA, stale timestamp, skipped test, retry, or failed reconciliation are rejected.

Commit:

- Title: `docs: define the release evidence manifest`
- Description: `Create a versioned, privacy-safe evidence schema that binds deployment, database, mock, live, accessibility, security, and research artifacts to one candidate SHA.`

### Step 6.2 — Build the evidence collector and validator

Changes:

- Add scripts that collect existing test reports and diagnostics into `output/release-evidence/<run-id>/` without committing them.
- Hash every artifact and emit a manifest plus a human-readable summary.
- Add a validator that recomputes hashes, confirms candidate/deployed SHA equality, verifies the migration identifier, and rejects unclean-source runs.
- Make collection deterministic and path-independent across Windows and CI.

Tests and verification:

```powershell
node --check scripts/collect-release-evidence.mjs
node --check scripts/validate-release-evidence.mjs
npm test -- --run scripts/collect-release-evidence.test.js scripts/validate-release-evidence.test.js
npm run verify:release-evidence -- --fixture tests/fixtures/release-evidence/valid
```

Pass: the validator accepts the valid fixture and rejects corrupted, incomplete, dirty-worktree, and mixed-SHA fixtures with actionable messages.

Commit:

- Title: `build: add release evidence collection and validation`
- Description: `Collect, hash, summarize, and fail-closed validate candidate evidence across local and CI environments.`

### Step 6.3 — Automate the deterministic mock evidence leg

Changes:

- Add a workflow job that runs the complete deterministic rehearsal twice only when release-candidate validation is requested.
- Capture both run IDs, reports, diagnostics, console/page errors, actor counts, retry/skip counts, build digest, and research archive reconciliation.
- Fail if the two runs disagree on deterministic artifact counts or workflow outcomes.
- Feed both runs into the release-evidence collector.

Tests and verification:

```powershell
Remove-Item Env:PLAYWRIGHT_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_OPERATOR_ACCESS_CODE -ErrorAction SilentlyContinue
npm run test:e2e:rehearsal
npm run test:e2e:rehearsal
npm run collect:release-evidence -- --leg mock
npm run verify:release-evidence -- --leg mock
```

Pass: both deterministic runs pass without skips/retries, their declared deterministic results agree, and the mock evidence manifest validates.

Commit:

- Title: `ci: capture deterministic release evidence`
- Description: `Run the full mock rehearsal twice and retain hash-bound diagnostics, research reconciliation, and deterministic comparison results for the candidate SHA.`

### Step 6.4 — Automate the approved live rehearsal leg

Changes:

- Add a manually approved staging workflow using a dedicated rehearsal environment and short-lived operator secret.
- Verify hosted source SHA and database migration identifier before creating any session.
- Run the hosted Realtime and full rehearsal suites against synthetic data only.
- Download and validate the research archive, attach sanitized diagnostics, and merge live evidence with the matching mock manifest.
- Always clear synthetic sessions through the archive workflow, never hard deletion.

Tests and verification:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE="<short-lived-rehearsal-code>"
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-run-id>"
$env:PLAYWRIGHT_DEPLOYED_COMMIT=(git rev-parse HEAD).Trim()
$env:PLAYWRIGHT_MIGRATION_STATE="<required-final-migration>"
npm run test:e2e:realtime
npm run test:e2e:rehearsal
npm run collect:release-evidence -- --leg live
npm run verify:release-evidence
```

Pass: hosted source and migration preflights match the candidate, both live suites pass without skips/retries, the research archive reconciles, and the combined manifest validates.

Commit:

- Title: `ci: add approved live release rehearsal`
- Description: `Run synthetic live-backend validation behind environment approval and bind its deployment, schema, Realtime, workflow, and research evidence to the mock-tested candidate.`

---

## Workstream 7 — Add accessibility and security automation

### Step 7.1 — Add automated WCAG scanning across shipped surfaces

Changes:

- Add `@axe-core/playwright` and a `test:e2e:a11y` script.
- Scan landing, Game Master, White Cell, SME shell, and all team-role page templates in representative populated, empty, error, modal, and degraded states.
- Fail on WCAG 2.2 Level A or AA violations; document narrowly justified temporary exceptions with owner and expiry.
- Attach axe JSON and a readable summary to CI.

Tests and verification:

```powershell
npm ci
npm run build
npm run test:e2e:a11y
npm test -- --run tests/unit/ui-source-accessibility.test.js
```

Pass: every shipped surface and required state reports zero unwaived A/AA violations.

Commit:

- Title: `test: add automated WCAG coverage`
- Description: `Run axe against representative states on every shipped role surface and retain machine-readable accessibility findings in CI.`

### Step 7.2 — Add keyboard, zoom, motion, and viewport interaction gates

Changes:

- Add Playwright tests for skip links, complete Tab order, visible focus, modal focus trap/restore, Escape, arrow-key tab/radio behavior, and no keyboard traps.
- Test 200% browser zoom, short-height layout, 375/390-pixel widths, and reduced-motion mode.
- Verify sticky modal footers and primary actions remain reachable without document-level horizontal overflow.
- Cover error, retry, empty, and degraded states, not only happy paths.

Tests and verification:

```powershell
npm run test:e2e:keyboard
npm run test:e2e:responsive
npm run test:e2e:reduced-motion
npm run test:e2e:a11y
```

Pass: keyboard-only workflows complete, focus never escapes dialogs, 200% zoom remains operable, reduced motion suppresses nonessential animation, and no tested viewport overflows.

Commit:

- Title: `test: gate keyboard and responsive accessibility`
- Description: `Verify keyboard navigation, focus management, 200-percent zoom, short and mobile viewports, and reduced-motion behavior across critical workflows.`

### Step 7.3 — Add dependency, secret, and static security scanning

Changes:

- Add a security workflow with dependency review, `npm audit`, CodeQL or Semgrep, and Gitleaks/TruffleHog history scanning.
- Pin tool versions and store reviewed suppressions with owner, rationale, and expiry.
- Fail on exposed secrets, high/critical application findings, prohibited dangerous DOM patterns, or dependency findings above the approved severity threshold.
- Scan built assets for service-role keys, operator codes, private tokens, source maps, and non-public configuration names.
- Keep all PLI files excluded from this workstream unless a scanner necessarily scans the whole repository; do not remediate PLI-specific findings here.

Tests and verification:

```powershell
npm audit --audit-level=high
npm run security:sast
npm run security:secrets
npm run security:bundle
npm test -- --run scripts/security-bundle-scan.test.js
```

Pass: no unsuppressed high/critical application finding, secret, backend credential, operator code, or production source map is present.

Commit:

- Title: `security: automate dependency secret and static scans`
- Description: `Gate candidates with pinned dependency, SAST, history-secret, and browser-bundle scans using reviewable expiring suppressions.`

### Step 7.4 — Add database authorization and staging DAST gates

Changes:

- Extend local database tests with a generated authorization matrix covering anonymous, participant, every team role, White Cell roles, SME roles, and Game Master.
- Exercise allowed and denied CRUD/RPC cases, cross-team access, cross-session access, stale grants, archived sessions, and immutable tables.
- Add an approved OWASP ZAP baseline against the staging deployment, with authenticated browser contexts where supported.
- Prevent DAST from targeting production and sanitize reports before retention.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite authorization-matrix
npm run test:security:rls
npm run test:security:dast -- --target "https://<rehearsal-host>/Fractured-Order/"
```

Pass: every expected denial fails closed, no cross-team/session row is disclosed, and staging DAST reports no high/critical finding.

Commit:

- Title: `security: gate RLS isolation and staging DAST`
- Description: `Exercise the complete browser-role authorization matrix locally and run approved dynamic scanning against the dedicated rehearsal deployment.`

---

## Workstream 8 — Resolve the recorded design-system defects

### Step 8.1 — Consolidate the loader and skeleton system

Changes:

- Choose one authoritative spinner, overlay, inline loader, and skeleton implementation.
- Remove duplicate definitions from either `modals.css` or `loader.css`.
- Load the surviving component stylesheet on every surface that can render loader APIs.
- Preserve reduced-motion behavior and accessible loading labels.
- Add cross-surface DOM/CSS contract tests.

Tests and verification:

```powershell
npm test -- --run src/components/ui/Loader.test.js tests/unit/ui-source-accessibility.test.js tests/unit/repo-docs-contract.test.js
npm run test:e2e:smoke
npm run test:e2e:a11y
```

Pass: all surfaces render the same loader implementation, gray/white variants work, and reduced-motion/accessibility checks pass.

Commit:

- Title: `fix: unify loader and skeleton components`
- Description: `Replace conflicting loader CSS with one accessible token-backed implementation loaded consistently across every platform surface.`

### Step 8.2 — Establish one canonical token scale

Changes:

- Select the numeric `--color-primary-*` scale or the named `--color-navy*` scale as canonical.
- Alias the compatibility scale to canonical tokens instead of duplicating values.
- Replace phantom `--color-warning-soft`, `--color-warning-ink`, `--font-size-xs`, and `--font-size-lg` references with defined tokens.
- Remove dead fallback colors that disagree with the real tokens.
- Add a token-reference validator that fails on undefined custom properties without an approved fallback.

Tests and verification:

```powershell
npm run verify:design-tokens
npm test -- --run tests/unit/design-tokens.test.js tests/font-loading.test.js
npm run build
```

Pass: no unapproved duplicate or undefined token remains and light/dark computed token fixtures match the approved map.

Commit:

- Title: `refactor: canonicalize design tokens`
- Description: `Alias legacy brand tokens to one authoritative scale and remove undefined typography, warning, and stale fallback references.`

### Step 8.3 — Remove shared-class collisions and inline layout duplication

Changes:

- Rename or consolidate conflicting `.section-header` and `.empty-state` definitions according to component ownership.
- Move default `.content-section` visibility into shared CSS while preventing flash-of-uninitialized content.
- Extract White Cell page-scoped styles into a dedicated stylesheet.
- Replace repeated inline layout declarations with documented utility or component classes where behavior is identical.
- Do not perform unrelated visual redesign.

Tests and verification:

```powershell
npm test -- --run tests/unit/ui-source-accessibility.test.js tests/unit/repo-docs-contract.test.js src/main.test.js
npm run test:e2e:smoke
npm run test:e2e:responsive
npm run build
```

Pass: shared classes have one owner, sections hide without flash, every page retains expected layout, and responsive checks pass.

Commit:

- Title: `refactor: remove shared CSS collisions`
- Description: `Give section headers, empty states, content visibility, and White Cell page styles explicit ownership without changing workflow behavior.`

### Step 8.4 — Close dark-mode, contrast, focus, and state defects

Changes:

- Replace raw PLI-external page tints and team indicator colors in shared platform CSS with theme-aware tokens; do not edit PLI-specific behavior.
- Correct the documented primary-button contrast shortfall to WCAG AA.
- Standardize `:focus-visible`, focus-ring width, and token usage for buttons, inputs, clickable cards, header controls, and navigation.
- Ensure lifecycle states remain textually distinguishable and not color-only.
- Add automated contrast fixtures and visual snapshots for light/dark critical states.

Tests and verification:

```powershell
npm run test:e2e:a11y
npm run test:e2e:keyboard
npm run test:visual -- --theme light
npm run test:visual -- --theme dark
npm test -- --run tests/unit/design-tokens.test.js
```

Pass: automated contrast meets AA, focus treatment is consistent, dark-mode snapshots contain no unthemed surfaces, and state meaning is available without color.

Commit:

- Title: `fix: close theme contrast and focus defects`
- Description: `Apply theme-aware colors, AA contrast, consistent focus-visible rings, and non-color-only state treatments across shared platform UI.`

### Step 8.5 — Replace the audit with a closed verification record

Changes:

- Re-run every check in `docs/style-audit.md` against the new source.
- Create a dated closure record mapping every finding to its commit and automated test.
- Leave unresolved product-choice questions explicitly open rather than marking them fixed.
- Update the source audit only through an appended status section; preserve its original evidence.

Tests and verification:

```powershell
npm run verify:design-tokens
npm run test:e2e:a11y
npm run test:e2e:responsive
npm run test:visual
npm test -- --run tests/unit/repo-docs-contract.test.js
```

Pass: every former blocker/high finding is either verified closed or retained as an explicit release blocker with owner and evidence.

Commit:

- Title: `docs: record design-system audit closure`
- Description: `Map each recorded styling finding to its implementation and automated verification while preserving any genuinely unresolved decision as a blocker.`

---

## Workstream 9 — Add production monitoring and database-drift detection

### Step 9.1 — Define privacy-safe telemetry and alert ownership

Changes:

- Add `docs/production-monitoring.md` defining monitored user journeys, severity, ownership, response times, and escalation paths.
- Define an allowlist of telemetry fields and a denylist covering session codes, access codes, participant names, action content, RFI content, communications, recordings, and browser storage.
- Select the monitoring provider before implementation; default to a browser error provider with a public DSN and server-side filtering.
- Define release, environment, route/surface, sanitized error code, request correlation ID, and connectivity state tags.
- Document monitoring-disabled and provider-outage behavior as non-blocking to deterministic workflows.

Tests and verification:

```powershell
npm test -- --run tests/unit/repo-docs-contract.test.js src/utils/logger.test.js
npm run verify:telemetry-schema
```

Pass: the schema contains no sensitive-content field, every alert has an owner and response, and monitoring failure cannot block session writes.

Commit:

- Title: `docs: define privacy-safe production monitoring`
- Description: `Specify telemetry allowlists, sensitive-data exclusions, severity ownership, response procedures, and fail-safe monitoring behavior.`

### Step 9.2 — Add browser error and release monitoring

Changes:

- Add a small monitoring adapter initialized from optional validated configuration.
- Capture uncaught errors, unhandled rejections, startup failure codes, sync degradation duration, failed privileged actions, archive failures, and build release identifiers.
- Scrub messages and breadcrumbs before dispatch; fall back to existing safe logger behavior when monitoring is absent.
- Update `.env.example`, deployment secrets/configuration, CSP/connect-src policy, and runbooks together.
- Add sampling and rate limits to prevent event storms.

Tests and verification:

```powershell
npm test -- --run src/services/monitoring.test.js src/main.test.js src/services/sync.test.js src/core/config.test.js
npm run security:bundle
npm run build
```

Pass: synthetic errors arrive with release/environment tags, prohibited data is scrubbed, rate limits work, and an unavailable provider does not interrupt the app.

Commit:

- Title: `feat: add privacy-safe browser monitoring`
- Description: `Report sanitized frontend failures, degraded synchronization, archive errors, and release identity through an optional rate-limited monitoring adapter.`

### Step 9.3 — Add hosted health and workflow monitoring

Changes:

- Add a scheduled workflow checking hosted HTML, built asset resolution, anonymous-auth availability, a non-sensitive health RPC, and expected migration identifier.
- Validate that the hosted asset manifest corresponds to the expected deployed SHA.
- Alert through GitHub workflow failure and the selected operational notification route.
- Add bounded retry/backoff and distinguish deployment, DNS, Auth, database, and schema failures.
- Never create or mutate a real exercise session during health checks.

Tests and verification:

```powershell
npm test -- --run scripts/health-check.test.js
npm run health:check -- --target "https://<rehearsal-host>/Fractured-Order/"
npm run health:check -- --fixture tests/fixtures/health/degraded
```

Pass: healthy staging succeeds, every degraded fixture fails with the correct bounded failure code, and logs expose no credential or participant data.

Commit:

- Title: `ops: monitor hosted application health`
- Description: `Schedule non-mutating checks for hosted assets, anonymous Auth, database reachability, schema identity, and deployed commit with actionable failure classification.`

### Step 9.4 — Detect database schema and policy drift

Changes:

- Generate a canonical schema fingerprint covering tables, columns, constraints, functions, triggers, RLS policies, grants, publications, and Storage policies.
- Add a read-only drift script that compares rehearsal/production metadata to the candidate fingerprint.
- Run drift detection before live rehearsal, before production deployment, and on a schedule.
- Fail closed on missing or unexpected security-sensitive objects; allow only reviewed additive operational metadata.
- Store fingerprints and sanitized diffs in the release evidence bundle.

Tests and verification:

```powershell
npm run db:reset
npm run db:fingerprint
npm run test:db -- --suite drift
npm run verify:db-drift -- --target rehearsal
```

Pass: the canonical local database matches, fixtures with altered policy/function/grant state fail, and the rehearsal comparison produces a clean fingerprint or an explicit blocker.

Commit:

- Title: `ops: add fail-closed database drift detection`
- Description: `Fingerprint schema, functions, triggers, RLS, grants, Realtime, and Storage and block release when hosted state differs from the reviewed candidate.`

---

## Workstream 10 — Reduce role-identifier and large-controller technical debt

### Step 10.1 — Centralize the legacy-to-canonical role mapping

Changes:

- Define canonical semantic role IDs for Scribe, Facilitator, Notetaker, White Cell, SME, Game Master, and Observer in `teamContext.js`.
- Move every legacy inverted identifier conversion into one compatibility adapter.
- Prohibit new direct comparisons against inverted `*_facilitator`/`*_scribe` meanings outside the adapter.
- Add a static rule that detects new legacy-role branching.
- Document route names as compatibility URLs, not role authority.

Tests and verification:

```powershell
npm test -- --run src/core/teamContext.test.js src/core/navigation.test.js tests/unit/public-naming.test.js
npm run verify:role-identifiers
npm run build
```

Pass: all role parsing and display tests use canonical semantics, legacy routes still resolve, and no new direct inverted-role branch is allowed.

Commit:

- Title: `refactor: centralize canonical role semantics`
- Description: `Introduce one authoritative role model and contain legacy Scribe/Facilitator inversion inside a tested compatibility adapter.`

### Step 10.2 — Add canonical role fields for new database writes

Changes:

- Add nullable canonical `role_surface` and `team_id` fields or an equivalent normalized identity envelope without rewriting historical rows.
- Populate canonical fields on all new seat claims and operator grants server-side.
- Continue reading legacy `role` for historical rows, clearly identifying fallback use.
- Add constraints that reject contradictions between canonical and legacy fields on new writes.
- Include canonical and legacy identity fields in research exports with explicit provenance.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite canonical-roles
npm test -- --run src/services/database.seats.test.js src/services/database.migration.contract.test.js src/features/export/researchExport.test.js
```

Pass: new rows carry canonical semantics, legacy rows remain readable without synthetic backfill, and contradictory role identities fail closed.

Commit:

- Title: `db: persist canonical role identity for new seats`
- Description: `Add server-owned semantic role fields for new participants and grants while retaining explicitly labeled legacy fallback for historical rows.`

### Step 10.3 — Migrate role controllers and policies to canonical semantics

Changes:

- Update landing, navigation, session store, database service, RLS helper inputs, and deterministic mock to use canonical role surfaces internally.
- Preserve existing public URLs and storage-key reads through adapters.
- Write canonical storage keys for new sessions and support one-way import of legacy keys.
- Update every role-matrix and RLS isolation test before removing any legacy write path.
- Roll out behind a temporary compatibility flag if live rehearsal cannot atomically coordinate frontend and migration deployment.

Tests and verification:

```powershell
npm test -- --run src/roles/landing.join.test.js src/stores/session.test.js src/core/navigation.test.js src/services/database.seats.test.js src/services/database.policy.test.js src/services/supabaseMock.test.js
npm run test:e2e:live-demo:matrix
npm run test:e2e:rehearsal
```

Pass: every role joins, reloads, writes, and reads with canonical semantics; legacy sessions still work; and no route or cross-role authority changes unexpectedly.

Commit:

- Title: `refactor: use canonical roles across runtime boundaries`
- Description: `Move browser state, routing, mock behavior, database calls, and authorization tests to semantic roles while retaining bounded legacy compatibility.`

### Step 10.4 — Establish controller size and dependency boundaries

Changes:

- Add ESLint with complexity, maximum-lines, import-cycle, and no-restricted-import rules calibrated to prevent new debt without forcing an unsafe one-shot rewrite.
- Record temporary file-specific exceptions for `researchExport.js`, `whitecell.js`, `facilitator.js`, and `scribe.js`, each with a decreasing target and expiry.
- Define dependency direction: components → features → stores/services → core, with role controllers acting only as composition roots.
- Add `lint` and `verify:architecture` scripts to mandatory CI.

Tests and verification:

```powershell
npm run lint
npm run verify:architecture
npm test -- --run tests/unit/architecture-contract.test.js
npm run build
```

Pass: new violations fail, existing exceptions are explicit and ratcheted, and no circular dependency is introduced.

Commit:

- Title: `chore: enforce frontend architecture boundaries`
- Description: `Add lint, complexity, file-size, cycle, and dependency-direction checks with expiring ratchets for the four oversized modules.`

### Step 10.5 — Decompose the research export module

Changes:

- Split export schema/columns, normalization, reconciliation, derived metrics, HTML rendering, LaTeX rendering, ZIP packaging, and download orchestration into focused modules.
- Preserve schema `1.9.0`, format revision `10`, file names, ordering, hashes, legacy labeling, and manifest behavior exactly.
- Add golden fixtures comparing every generated text/binary entry before and after extraction.
- Keep the public barrel API stable.

Tests and verification:

```powershell
npm test -- --run src/features/export/researchExport.test.js src/services/database.research-export.test.js src/features/export/exportAdminData.test.js
npm run verify:research-export-golden
npm run build
```

Pass: golden archives are byte-identical where timestamps are fixed, reconciliation counts match, and no consumer import changes outside the documented barrel.

Commit:

- Title: `refactor: modularize research export generation`
- Description: `Extract schema, normalization, metrics, renderers, reconciliation, and archive packaging while preserving the complete export contract and public API.`

### Step 10.6 — Decompose White Cell by workspace

Changes:

- Extract game controls, review queues, communications, notifications, session administration, plugins, and export orchestration into feature controllers.
- Keep `whitecell.js` as lifecycle and dependency composition only.
- Inject stores/services rather than importing hidden singletons inside extracted logic where practical.
- Preserve all DOM IDs, navigation behavior, notification identity, and review transaction ordering.

Tests and verification:

```powershell
npm test -- --run src/roles/whitecell.test.js src/roles/whitecell.pli.test.js src/services/database.privileged.test.js src/stores/workflowReconciliation.test.js
npm run test:e2e:smoke
npm run test:e2e:rehearsal
npm run verify:architecture
```

Pass: all non-PLI White Cell workflows are unchanged, PLI tests remain untouched and passing as compatibility checks, and `whitecell.js` meets its ratcheted size target.

Commit:

- Title: `refactor: split White Cell workspace controllers`
- Description: `Move White Cell workspaces into focused feature controllers while preserving DOM, review, notification, export, and session behavior.`

### Step 10.7 — Decompose Scribe and Facilitator controllers by workflow

Changes:

- Extract Strategic Orientation, actions, proposals, RFIs, communications, projection/deck, notification, and workspace-navigation controllers.
- Share pure view models and render helpers where semantics are identical; keep role-specific authorization and copy separate.
- Preserve create/edit/return/resubmit prepopulation, proposal thread isolation, unread behavior, and projection restoration.
- Reduce each composition-root controller to lifecycle, subscriptions, and feature wiring.

Tests and verification:

```powershell
npm test -- --run src/roles/facilitator.test.js src/roles/facilitator.live.test.js src/roles/scribe.test.js src/features/actions/proposalRecipientState.test.js src/features/notifications/workflowNotifications.test.js
npm run test:e2e:smoke
npm run test:e2e:rehearsal
npm run verify:architecture
```

Pass: role workflows and exact persisted payloads remain unchanged, notifications remain deduplicated, and both controllers meet their ratcheted size targets.

Commit:

- Title: `refactor: split team workflow controllers`
- Description: `Extract team orientation, action, proposal, RFI, communication, projection, and notification workflows into tested feature modules.`

### Step 10.8 — Retire canonical-role compatibility writes after live proof

Changes:

- After at least one complete live rehearsal proves canonical writes and legacy reads, stop writing inverted role IDs for new sessions.
- Retain legacy read adapters and labels for historical sessions.
- Add telemetry for legacy fallback usage with session content excluded.
- Update docs and remove the temporary compatibility feature flag only after evidence validates.
- Do not rewrite historical role rows.

Tests and verification:

```powershell
npm run db:reset
npm run test:db -- --suite canonical-roles
npm test -- --run src/core/teamContext.test.js src/stores/session.test.js src/services/database.seats.test.js
npm run test:e2e:live-demo:matrix
npm run test:e2e:rehearsal
npm run verify:release-evidence
```

Pass: new sessions contain only canonical write semantics, historical fixtures use labeled fallback, and the live evidence bundle shows no routing or authorization regression.

Commit:

- Title: `refactor: stop legacy role writes for new sessions`
- Description: `Complete the canonical-role rollout by ending inverted writes while retaining observable, read-only compatibility for historical session data.`

---

## Final integrated release gate

### Step 11.1 — Run and record the complete local candidate gate

Changes:

- Make no behavior changes in this commit.
- Update the release record with the clean candidate SHA, final migration identifier, tool versions, test run IDs, and evidence manifest path.
- Record any failure as a blocker; do not mark the plan complete based on historical output.

Tests and verification:

```powershell
$candidateSha = (git rev-parse HEAD).Trim()
$dirty = git status --porcelain
if ($dirty) { throw "Release candidate worktree is not clean." }
npm ci
npm run verify:repo-artifacts
npm run lint
npm run verify:architecture
npm test -- --run
npm run test:coverage
npm run build
npm run db:reset
npm run db:lint
npm run test:db
npm run test:e2e:smoke
npm run test:e2e:rehearsal
npm run test:e2e:a11y
npm run test:e2e:keyboard
npm run test:e2e:responsive
npm run security:sast
npm run security:secrets
npm run security:bundle
npm run collect:release-evidence -- --leg mock
npm run verify:release-evidence -- --leg mock
```

Pass: every command succeeds on a clean SHA with zero skipped/retried release tests and a valid mock evidence manifest.

Commit:

- Title: `docs: record local platform hardening gate`
- Description: `Record the clean candidate SHA, final schema state, tool versions, complete local verification results, and validated deterministic evidence manifest.`

### Step 11.2 — Run and record the complete live candidate gate

Changes:

- Make no behavior changes in this commit.
- Deploy the already validated artifact to the dedicated rehearsal environment after approval.
- Run the live health, drift, Realtime, full rehearsal, accessibility, and DAST gates.
- Merge live evidence with the matching mock evidence and record the go/no-go decision.
- Archive all synthetic rehearsal sessions through the verified archive workflow.

Tests and verification:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://<rehearsal-host>/Fractured-Order/"
$env:PLAYWRIGHT_OPERATOR_ACCESS_CODE="<short-lived-rehearsal-code>"
$env:PLAYWRIGHT_REHEARSAL_RUN_ID="<unique-run-id>"
$env:PLAYWRIGHT_DEPLOYED_COMMIT=(git rev-parse HEAD).Trim()
$env:PLAYWRIGHT_MIGRATION_STATE="<required-final-migration>"
npm run health:check -- --target $env:PLAYWRIGHT_BASE_URL
npm run verify:db-drift -- --target rehearsal
npm run test:e2e:realtime
npm run test:e2e:rehearsal
npm run test:e2e:a11y -- --target $env:PLAYWRIGHT_BASE_URL
npm run test:security:dast -- --target $env:PLAYWRIGHT_BASE_URL
npm run collect:release-evidence -- --leg live
npm run verify:release-evidence
```

Pass: the hosted SHA and migration identifier match the candidate, every live gate passes without skips/retries, synthetic sessions are archived with proof, and the combined evidence manifest validates.

Commit:

- Title: `docs: record live platform hardening gate`
- Description: `Record the approved rehearsal deployment, schema fingerprint, live workflow results, accessibility and security evidence, archive cleanup, and final go/no-go decision.`

## Open questions

- Which monitoring provider and operational notification channel will own production alerts? Decide before Step 9.2; the telemetry contract remains provider-neutral.
- What retention period and two-person approval policy apply to archived sessions? Until approved, hard purge remains unavailable.
- Which protected branch and GitHub environment names will represent release-candidate, rehearsal, and production? Decide before Step 2.3 so required checks can use stable names.

## Completion definition

This plan is complete only when every workstream has current-head code, focused tests, synchronized documentation, and reproducible evidence; the final live evidence manifest validates; and no required gate is waived, skipped, stale, or satisfied by a historical run. PLI-specific work remains explicitly deferred and is not a condition of this plan's completion.
