# Repository Audit

## Audit Scope

Read-only audit of the root Vite multi-page app, GitHub Pages workflow, Supabase runtime configuration, frontend UX/accessibility, security/privacy posture, realtime/data flows, tests, SQL setup files, and docs. I did not run `npm ci`, build, tests, Playwright, migrations, or deployment commands.

Current verified/user-provided updates:

- Live URL: `https://ssgwm25.github.io/Fractured-Order/`
- Live HTML checked at `2026-06-22T11:17:10.0907620-04:00` with a read-only HTTP request.
- The deployed landing page serves bundled assets such as `/Fractured-Order/assets/main-BweSCgd5.js` and `/Fractured-Order/assets/supabase-BQbgwcOn.js`.
- The deployed landing page did not serve raw `./src/main.js` or `./src/roles/landing.js`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are user-reported as configured through GitHub repository secrets.
- Supabase function/RPC behavior is user-reported working. The specific live SQL/RLS state was not independently queried from Supabase during this audit.

Local `dist/` exists but remains an ignored local artifact; live readiness evidence comes from the checked GitHub Pages URL above.

## Top Findings

1. README is still stale and points to a non-existent `platform/` setup flow: `README.md:47`, `README.md:79`, `README.md:82`, `README.md:88`.
2. `docs/` is missing even though README claims it exists: `README.md:50`; filesystem check returned `False`.
3. Tests still contain stale expectations: `vite.config.test.js:8` expects `Plenum/index.html`, but `vite.config.js:52-67` has no `plenum` input.
4. Naming/docs tests contradict the current README: `tests/unit/public-naming.test.js:44-47` expects `# Statecraft Sim` text not present in `README.md`.
5. Supabase setup remains operator-risky: `data/updated_supabase_schema.sql:23-24` has broad allow-all policies, while hardening lives elsewhere; `data/COMPLETE_SCHEMA.sql:1252-1263` explains this only in SQL comments.
6. Direct browser writes rely on live RLS being correct: `src/services/database.js:961`, `src/services/database.js:1206`, `src/services/database.js:1329`, `src/services/database.js:1457`, `src/services/database.js:1661`.
7. Public sourcemaps are still enabled: `vite.config.js:50`; local `dist/assets/*.js.map` files exist.
8. Runtime config failure UI uses `alertdialog` markup but does not reuse the accessible modal focus trap: `src/services/supabase.js:402`, compared with `src/components/ui/Modal.js:142-165`.
9. Some form controls are not programmatically labeled/grouped, especially notetaker/facilitator capture forms: `teams/blue/notetaker.html:247-260`, `teams/blue/facilitator.html:341-352`.
10. Realtime degraded state is internal but not persistently surfaced in the shell: errors handled at `src/services/realtime.js:272-312`; visible indicator mostly checks `navigator.onLine` at `src/main.js:148-169`.

## Gap Register

| ID | Severity | Area | Evidence | Impact | Recommended Fix | Verification |
|---|---|---|---|---|---|---|
| G1 | High | Docs/Ops | `README.md:47`, `README.md:79`, `README.md:88` | Operators follow wrong setup path | Rewrite README for the root Vite app and current GitHub Pages/Supabase flow | README has no `platform/` setup references |
| G2 | High | Docs/Ops | `README.md:50`; `docs/` absent | No durable runbook for setup/failure recovery | Add `docs/deployment.md`, `docs/supabase-setup.md`, and `docs/live-demo-runbook.md` | Docs exist and match workflow/env/schema |
| G3 | High | Tests | `vite.config.test.js:8`; `vite.config.js:52-67` | Unit suite likely fails or tests obsolete contract | Update test to assert actual Vite inputs | `npm test -- --run` passes |
| G4 | High | Tests/Docs | `tests/unit/public-naming.test.js:44-47`; `README.md:3` | CI cannot be trusted until naming/docs contract aligns | Decide naming contract, update README/test/package consistently | Naming test passes |
| G5 | High | Supabase/RLS | `data/updated_supabase_schema.sql:23-24`; `data/COMPLETE_SCHEMA.sql:1252-1263` | Wrong SQL file/order can weaken data access | Promote one authoritative setup path and mark legacy files unsafe/stale | Supabase policy query shows no broad allow-all live policies |
| G6 | High | Data Access | `src/services/database.js:961`, `1206`, `1329`, `1457`, `1661` | Direct writes are safe only if live RLS matches hardening SQL | Document/test live RLS expectations or route more writes through RPC | Real Supabase negative-permission checks |
| G7 | Medium | Security/Privacy | `vite.config.js:50` | Public source maps expose source and internal strings | Disable production sourcemaps or document approved exposure | Live `.js.map` returns 404 or policy documents why exposed |
| G8 | Medium | Accessibility | `src/services/supabase.js:402`; `src/components/ui/Modal.js:142-165` | Blocking config failure may not receive focus correctly | Reuse modal focus pattern or focus runtime panel with action control | Unit/Playwright accessibility test |
| G9 | Medium | Accessibility | `teams/blue/notetaker.html:247-260`; `teams/blue/facilitator.html:341-352` | Assistive-tech users lose form context | Add `for`/`id`, `fieldset`/`legend`; repeat for red/green pages | Static test or axe/manual keyboard pass |
| G10 | Medium | Reliability | `src/services/realtime.js:272-312`; `src/main.js:148-169` | Users may act on stale state after channel failure | Surface sync degraded/reconnecting/error state in role UIs | Simulated realtime failure shows persistent warning |
| G11 | Low | Deployment Evidence | Live URL checked: `https://ssgwm25.github.io/Fractured-Order/`; bundled `/Fractured-Order/assets/*.js` served | Raw-source blocker is closed; durable notes still need to record run ID/source snippet | Add live URL, timestamp, and workflow run ID to deployment docs | Hosted smoke check confirms bundled assets |
| G12 | Low | Config Docs | `.env.example:7-8`; `.github/workflows/deploy-pages.yml:22-23` | Anon key secret/build/public boundary can be misunderstood | Document GitHub Secret injection and browser-public anon key | Docs distinguish anon key from service-role secret |

## Deployment Readiness

`partially ready`

The previous raw-source GitHub Pages blocker is closed. The live URL serves bundled `/Fractured-Order/assets/*.js` output rather than raw source modules, and the workflow reads Supabase runtime values from GitHub repository secrets. Deployment remains only partially ready because repo docs/tests are stale, production sourcemaps are enabled, and the live verification should be turned into a repeatable hosted smoke check.

## Usability Readiness

`partially ready`

Core role flows and E2E coverage are substantial. Remaining gaps are specific: runtime config blocker focus handling, incomplete form labeling, and weak persistent degraded-sync UI.

## Security/Privacy Readiness

`partially ready`

No service-role/backend secret exposure was found in inspected source. Supabase anon config is now user-reported as injected through GitHub Secrets, but it remains public browser runtime config after build. Supabase function/RPC behavior is user-reported working. Remaining security risk is mostly operational: proving live RLS/policy state and documenting the authoritative SQL setup path.

## Test Gaps

- Replace stale `vite.config.test.js` `plenum` assertion with actual input coverage.
- Align `tests/unit/public-naming.test.js` with the chosen README/product naming.
- Add docs contract test: README must not reference `platform/`; docs must mention GitHub Pages, Supabase GitHub Secrets, anonymous auth, SQL order, and hosted smoke.
- Add production sourcemap policy test against `vite.config.js`.
- Add runtime config alert focus/accessibility unit test.
- Add static form-label test for all `teams/*/notetaker.html` and `teams/*/facilitator.html`.
- Add sync degraded UI test that simulates `CHANNEL_ERROR` / `reconnect_failed`.
- Add live Supabase SQL verification checklist or real-project smoke for RLS/RPC availability.

## Commands For Human To Run

```powershell
npm ci
```

Pass: dependencies install from `package-lock.json` without lockfile changes.

```powershell
npm test -- --run
```

Pass: all unit tests pass after stale Vite/naming contracts are fixed.

```powershell
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<anon-key>"
$env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"
npm run build
```

Pass: build succeeds; `dist/index.html` references `/Fractured-Order/assets/...` and not `./src/main.js`.

```powershell
npm run test:e2e:smoke
npm run test:e2e:live-demo
```

Pass: local smoke, topology, and role matrix pass.

```powershell
gh run list --workflow deploy-pages.yml --branch main --limit 5
gh run view <run-id> --log
```

Pass: latest Pages run succeeds and logs Supabase secret validation, build, `.nojekyll`, artifact upload, and deploy.

```powershell
Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Pass: deployed HTML references bundled `/Fractured-Order/assets/*.js`; it does not reference `./src/main.js` or `./src/roles/landing.js`.

Supabase SQL verification:

```sql
select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
and proname in (
  'lookup_joinable_session_by_code',
  'authorize_demo_operator',
  'create_live_demo_session',
  'delete_live_demo_session',
  'claim_session_role_seat',
  'heartbeat_session_role_seat',
  'disconnect_session_role_seat',
  'list_active_session_participants',
  'operator_update_game_state',
  'operator_adjudicate_action',
  'operator_answer_request',
  'operator_send_communication',
  'update_proposal_recipient_status',
  'live_demo_research_capture_mode',
  'live_demo_software_build_hash'
);
```

Pass: every listed RPC exists.

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
and policyname ilike '%Allow all operations%';
```

Pass: no broad allow-all policies remain on live demo tables.

## Open Questions / Blockers

- Live deployment URL and deployed asset shape are now verified.
- Supabase function/RPC behavior is user-reported working.
- The exact live Supabase RLS/policy state was not independently queried during this audit.
- I did not run tests, so stale-test failure remains based on static evidence, not an executed test result.
- `audit.md` currently contains the original audit prompt, while `repo-audit.md` contains this generated report; decide which file should be canonical.

## Detailed Fix Prompt

```text
You are Codex working in the Fractured Order / Plenum root Vite repository.

Goal:
Close the remaining repo-side readiness gaps from the updated audit. Do not change gameplay scope, geography, role topology, Supabase authorization semantics, or frontend framework/tooling. Make a focused code + tests + docs change that improves operator readiness, test trust, accessibility, realtime degradation visibility, and public-deployment security posture.

Current state:
- Live GitHub Pages URL is https://ssgwm25.github.io/Fractured-Order/.
- Live HTML has been verified to serve bundled /Fractured-Order/assets/*.js and not raw ./src/main.js.
- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured as GitHub repository secrets for the Pages workflow.
- The Supabase anon key is public browser runtime config after build; do not describe it as a backend secret.
- Supabase function/RPC behavior is reported working. Do not rewrite working RPCs or migrations unless a test proves a current contract mismatch.
- The raw-source GitHub Pages blocker is closed. Preserve that guarantee with docs/tests; do not treat it as an active app-load failure.
- The remaining Supabase work is operator documentation and verification guidance for RLS/RPC state, not changing live auth behavior.

Before editing, read:
- README.md
- .env.example
- .github/workflows/deploy-pages.yml
- vite.config.js
- vite.config.test.js
- tests/unit/public-naming.test.js
- playwright.config.js
- src/core/config.js
- src/services/supabase.js
- src/services/database.js
- src/services/realtime.js
- src/services/sync.js
- src/main.js
- src/components/ui/Modal.js
- teams/blue/facilitator.html, teams/red/facilitator.html, teams/green/facilitator.html
- teams/blue/notetaker.html, teams/red/notetaker.html, teams/green/notetaker.html
- data/COMPLETE_SCHEMA.sql
- data/CURRENT_BUILD_SUPABASE_PATCH.sql
- data/updated_supabase_schema.sql

Required fixes:

1. Documentation/operator readiness
- Rewrite README so it reflects the root-level Vite app, not platform/.
- Remove or correct stale platform/ setup instructions.
- Document local setup using root .env.example, npm ci, npm run dev, and npm run build.
- Document GitHub Pages deployment via .github/workflows/deploy-pages.yml.
- Document the verified live URL: https://ssgwm25.github.io/Fractured-Order/.
- Document that Pages must publish the built dist artifact, never raw source HTML.
- Document required GitHub repository secrets:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - optional PAGES_ENABLEMENT_TOKEN
- Clearly state that the Supabase anon key is safe-to-expose browser config after build and must not be confused with a service-role/backend secret.
- Add or update docs under docs/:
  - docs/deployment.md
  - docs/supabase-setup.md
  - docs/live-demo-runbook.md
- Include hosted source verification for https://ssgwm25.github.io/Fractured-Order/.
- Include Supabase anonymous auth requirement, required RPC checklist, RLS policy query, SQL order, and warning against using legacy broad-policy schema as final live state.
- Include a short "known good live check" section: the page source should contain /Fractured-Order/assets/*.js and must not contain ./src/main.js or ./src/roles/landing.js.

2. Test contract cleanup
- Update vite.config.test.js to assert actual Vite inputs: main, master, whitecell, all team pages, and decks.
- Remove the stale Plenum/index.html expectation unless that file is intentionally restored.
- Update tests/unit/public-naming.test.js or README/package metadata so naming expectations match the intended product contract.
- Add a docs contract test, likely tests/unit/repo-docs-contract.test.js, that fails if README references platform/ setup or platform/.env.example.
- The docs contract test should also assert that deployment docs mention the live URL, GitHub Pages, Supabase GitHub Secrets, anonymous auth, SQL verification, and the browser-public anon-key boundary.

3. Production sourcemap policy
- Disable sourcemaps for production Pages builds unless there is an explicit documented reason to keep them.
- Add a focused config test that pins the sourcemap policy.
- Keep development sourcemaps if useful; the important gate is that public production Pages builds do not publish source maps by default.

4. Runtime config accessibility
- Update renderMissingBackendNotice() in src/services/supabase.js so the blocking config UI has reliable focus behavior.
- Prefer reusing the existing modal focus-management pattern if practical; otherwise add tabindex="-1", move focus to the panel/title, and include an actionable reload/setup control.
- Add a test for role="alertdialog", accessible title/description, and focus behavior.

5. Form accessibility
- Fix facilitator and notetaker HTML across blue/red/green pages.
- Radio groups labeled Type should use fieldset and legend.
- Textareas/range inputs with visual labels must use for/id.
- Add or update a static test to catch unlabeled controls in teams/*/facilitator.html and teams/*/notetaker.html.

6. Realtime degraded UI
- Surface syncService status in the shell or role pages: syncing, synced, offline, error/reconnect failed.
- Degraded/error state must be persistent, not only console output.
- Add a test that simulates realtime CHANNEL_ERROR/reconnect_failed and asserts the user sees a degraded-state message.

7. Supabase schema/runbook clarity
- Do not weaken RLS or privileged RPC boundaries.
- Do not treat data/updated_supabase_schema.sql broad allow-all policies as the final live state.
- Add comments to legacy SQL files only if needed to warn they are not the final production hardening state.
- Operator docs must identify the authoritative current setup path and verification SQL.
- Because Supabase function/RPC behavior is reported working, prefer docs and tests over SQL rewrites.
- The docs must preserve the distinction between:
  - GitHub repository secrets used at build time
  - Supabase anon browser config exposed to clients
  - service-role/backend secrets, which must never be exposed

Verification commands for the human to run:
- npm ci
- npm test -- --run
- $env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="<anon-key>"; $env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"; npm run build
- npm run test:e2e:smoke
- npm run test:e2e:live-demo
- gh run list --workflow deploy-pages.yml --branch main --limit 5
- gh run view <run-id> --log
- Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing | Select-Object -ExpandProperty Content
- Supabase RLS verification SQL from the audit. RPC behavior is reported working, but the docs should still provide the RPC existence query for future operators.

Definition of done:
- Code, tests, and docs are all updated together.
- README no longer points to platform/.
- Tests reflect the actual repo layout.
- Production sourcemaps are disabled or explicitly justified.
- Runtime config blocker and team forms meet basic accessibility expectations.
- Realtime degraded state is visible.
- Supabase setup docs distinguish GitHub repo secrets, browser-public anon config, and backend/service-role secrets.
- Deployment docs record the verified live URL and source-output check.
- Final response lists exact files changed and exact verification commands.
```
