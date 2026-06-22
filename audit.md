You are auditing the current repository end to end. Your task is not to fix code yet. Your task is to produce an evidence-based gap assessment that identifies what technical, usability, deployment, documentation, security, testing, and operational gaps are still in play.

Read-only audit rules:
- Do not edit files.
- Do not run destructive commands.
- Do not run `npm run build`, `npm test`, Playwright, deployment commands, or migrations unless the human explicitly authorizes them.
- You may run read-only commands such as `rg`, `Get-Content`, `git status`, `git log`, and file listings.
- If verification requires a command you are not allowed to run, list the exact command and define what pass/fail looks like.
- Do not claim anything passed unless you personally verified it from current evidence.
- Treat stale docs, stale workflow assumptions, and unverifiable deployment state as active gaps.

Repository context to verify:
- The project appears to be a root-level Vite multi-page frontend for Fractured Order / Plenum.
- The GitHub Pages deployment should publish the built `dist/` artifact, not raw source files.
- The live Pages issue previously observed was raw `index.html` serving `./src/main.js` and `./src/roles/landing.js`, causing browser failure on `@supabase/supabase-js`.
- The app depends on Supabase runtime config: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- GitHub Pages workflow is expected at `.github/workflows/deploy-pages.yml`.
- Do not assume README instructions are correct; compare them against actual repo layout.

Audit phases:
1. Orientation
- Read `package.json`, `package-lock.json`, `vite.config.js`, `.env.example`, `.gitignore`, `README.md`, and `.github/workflows/*`.
- Read the main HTML entrypoints: `index.html`, `master.html`, `whitecell.html`, and representative `teams/*/*.html`.
- Read the core app modules under `src/core`, `src/services`, `src/stores`, and `src/roles`.
- Read test coverage under `tests/` and `src/**/*.test.js`.
- Identify stale or contradictory repo instructions.

2. Build and dependency audit
- Determine the required Node/npm version from package metadata and lockfile engines.
- Confirm whether `npm ci` is the correct install path.
- Confirm whether Vite can bundle all entrypoints listed in `vite.config.js`.
- Check for raw browser imports that would fail outside Vite.
- Check whether any source-only paths are being relied on after build.
- Identify missing assets, case-sensitive path risks, and GitHub Pages base-path risks.

3. GitHub Pages deployment audit
- Inspect the Pages workflow for correct source, build, upload, and deploy steps.
- Confirm `VITE_PUBLIC_BASE_PATH` is correctly set for project Pages.
- Confirm `.nojekyll` handling.
- Confirm Pages secrets required by the workflow.
- State how to verify the live site is serving built output.
- Pass condition: live page source contains bundled `assets/*.js`, not `./src/main.js` or other raw source modules.

4. Runtime configuration and Supabase audit
- Trace config loading from environment to runtime validation.
- Identify which values are public browser config versus dangerous backend secrets.
- Confirm the app fails clearly when Supabase config is missing or placeholder.
- Trace anonymous browser auth, session lookup, seat claiming, operator auth, realtime sync, and RPC usage.
- List required Supabase tables, RLS assumptions, RPCs, and auth settings inferred from code.
- Identify any missing migrations/schema documentation or operator setup docs.

5. Frontend usability audit
- Inspect landing, operator access, team role flows, session resume, logout/disconnect, and role redirects.
- Identify missing states: loading, empty, error, retry, disabled, degraded backend, stale session, seat full, unauthorized, offline.
- Check whether participant and operator flows explain failures clearly without exposing sensitive details.
- Check mobile layout, keyboard flow, focus states, form labels, and modal/overlay behavior.
- Identify any content encoding issues, broken characters, or copy that harms usability.

6. Accessibility audit
- Review semantic landmarks, form labels, fieldsets, aria attributes, focus management, keyboard operation, contrast-sensitive UI, live regions, and reduced-motion considerations.
- Flag issues with modals, overlays, toasts, details/summary, dynamic navigation, and loading/error announcements.
- Provide file-level evidence for each finding.

7. Security and privacy audit
- Check for browser-visible secrets beyond expected Supabase anon key.
- Check auth boundary assumptions for operator access, public joins, and RPC calls.
- Check whether privileged operations are routed through RPCs rather than direct table writes.
- Inspect local/session storage use for sensitive data.
- Identify XSS risk from dynamic HTML construction and any missing escaping.
- Identify CORS, RLS, and token handling risks that cannot be proven from frontend code alone.

8. Data integrity and realtime audit
- Trace session state, participant seat claims, heartbeat, stale participant release, game state updates, actions, RFIs, communications, notes, and exports.
- Identify race conditions, duplicate identity handling risks, reconnect behavior, and data loss paths.
- Check whether realtime subscription failures are visible and recoverable.
- Identify any places where local fallback could diverge from backend truth.

9. Testing audit
- Inventory existing unit, integration, and e2e tests.
- Map tests to critical contracts: build output, base path, config validation, Pages deployment, Supabase auth failures, session join, role routing, operator auth, seat limits, realtime sync, export.
- Identify high-value missing tests.
- For each missing test, state the narrow behavior it should pin and the file where it likely belongs.

10. Documentation and operator-readiness audit
- Compare README, `.env.example`, workflow behavior, and actual repo layout.
- Identify stale paths such as references to `platform/` if the app is now root-level.
- Check whether setup docs explain GitHub Pages, Supabase secrets, Supabase auth settings, required RPCs, and session creation.
- Check whether operator runbooks explain live demo setup, failure recovery, and how to verify deployment.

11. Performance and reliability audit
- Inspect bundle splitting, sourcemaps, large inline assets, image sizes, caching assumptions, and realtime subscription volume.
- Identify likely mobile/network bottlenecks.
- Check whether errors are observable through logs, UI notices, or browser console only.
- Recommend lightweight reliability improvements without overengineering.

Output format:
- Start with `Audit Scope` listing what was inspected and what was not.
- Then `Top Findings` with the 10 most important gaps, ordered by severity.
- Then `Gap Register` as a table with columns: ID, Severity, Area, Evidence, Impact, Recommended Fix, Verification.
- Then `Deployment Readiness` with a clear verdict: `blocked`, `partially ready`, or `ready pending verification`.
- Then `Usability Readiness` with a clear verdict.
- Then `Security/Privacy Readiness` with a clear verdict.
- Then `Test Gaps` listing the highest-value missing tests.
- Then `Commands For Human To Run` with exact commands and pass criteria.
- Then `Open Questions / Blockers` for anything that cannot be determined from repo evidence.

Severity definitions:
- Critical: app cannot load, deploy, authenticate, or protect privileged flows.
- High: major user workflow is broken or data can be lost/corrupted.
- Medium: significant usability, maintainability, or test gap.
- Low: cleanup, polish, stale wording, or minor inconsistency.

Evidence rules:
- Every finding must cite a concrete file path and line number where possible.
- If using live-site evidence, include the checked URL, timestamp, observed console/network failure, and what source HTML showed.
- If a gap is inferred, label it as inference and explain the evidence behind it.
- Do not invent missing files, schemas, test results, secrets, or deployment status.