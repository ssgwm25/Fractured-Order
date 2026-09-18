import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function readText(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('repository operator docs contract', () => {
    it('pins secretless pull-request frontend validation and retained artifacts', () => {
        const workflow = readText('../../.github/workflows/frontend-ci.yml');
        const deployment = readText('../../docs/deployment.md');
        const requiredCommands = [
            'npm ci',
            'npm run verify:repo-artifacts',
            'npm test -- --run',
            'npm run test:coverage',
            'npm run build'
        ];

        expect(workflow).toContain('name: Frontend validation');
        expect(workflow).toContain('push:');
        expect(workflow).toContain('pull_request:');
        expect(workflow).toContain("node-version: '20'");
        expect(workflow).toContain('contents: read');
        expect(workflow).toContain('cancel-in-progress: true');
        expect(workflow).toContain('push: {}');
        expect(workflow).toContain('pull_request: {}');

        let priorCommandIndex = -1;
        requiredCommands.forEach((command) => {
            const commandIndex = workflow.indexOf(command);
            expect(commandIndex, `${command} must be present in workflow order`).toBeGreaterThan(priorCommandIndex);
            priorCommandIndex = commandIndex;
        });

        expect(workflow.match(/if: \$\{\{ always\(\) \}\}/g)).toHaveLength(2);
        expect(workflow).toContain('path: coverage/');
        expect(workflow).toContain('path: dist/');
        expect(workflow).toContain('https://frontend-ci-build-only.supabase.co');
        expect(workflow).toContain('frontend-ci-build-only-anon-value');
        expect(workflow).not.toContain('secrets.');
        expect(workflow).not.toContain('pages: write');
        expect(workflow).not.toContain('id-token: write');
        expect(workflow).not.toContain('actions/deploy-pages');

        expect(deployment).toContain('Pull-Request Frontend Validation');
        requiredCommands.forEach((command) => expect(deployment).toContain(`\`${command}\``));
        expect(deployment).toMatch(/no production or repository\s+secret/);
    });

    it('pins deterministic pull-request smoke and protected-branch rehearsal gates', () => {
        const workflow = readText('../../.github/workflows/frontend-ci.yml');
        const playwrightConfig = readText('../../playwright.config.js');
        const deployment = readText('../../docs/deployment.md');
        const automation = readText('../../docs/playthrough-automation.md');

        expect(workflow).toContain('browser-smoke:');
        expect(workflow).toContain("github.event_name == 'pull_request'");
        expect(workflow).toContain('browser-rehearsal:');
        expect(workflow).toContain("github.event_name == 'push' && github.ref_protected");
        expect(workflow.match(/npx playwright install --with-deps chromium/g)).toHaveLength(2);
        expect(workflow).toContain('npm run test:e2e:smoke');
        expect(workflow).toContain('npm run test:e2e:rehearsal');
        expect(workflow).toContain('scripts/write-playwright-summary.mjs');
        expect(workflow).toContain('playwright-report/');
        expect(workflow).toContain('test-results/');
        expect(workflow).toContain('if-no-files-found: error');
        expect(playwrightConfig).toContain('playwrightGateReporter.js');
        expect(playwrightConfig).toContain("trace: process.env.CI ? 'retain-on-failure'");
        expect(deployment).toContain('Deterministic Browser Gates');
        expect(deployment).toContain('GitHub access-controlled workflow artifacts');
        expect(automation).toContain('zero skipped tests, zero retries');
    });

    it('defines the source-versus-generated repository artifact boundary', () => {
        const gitignore = readText('../../.gitignore');
        const policy = readText('../../docs/repository-artifact-policy.md');
        const readme = readText('../../README.md');
        const deployment = readText('../../docs/deployment.md');
        const packageJson = JSON.parse(readText('../../package.json'));
        const verifier = readText('../../scripts/verify-repository-artifacts.mjs');
        const workflow = readText('../../.github/workflows/repository-artifacts.yml');
        const generatedPaths = [
            'node_modules/.vite/vitest/results.json',
            'test-results/.last-run.json',
            '.playwright-mcp/page-example.yml',
            'dist/index.html',
            'coverage/index.html',
            'output/release-evidence/example/manifest.json',
            'recordings/session-recording-example.webm',
            'pli/reports/out/example/report.aux'
        ];

        generatedPaths.forEach((generatedPath) => {
            const ignored = spawnSync(
                'git',
                ['check-ignore', '--no-index', '--quiet', generatedPath],
                { cwd: new URL('../..', import.meta.url) }
            );
            expect(ignored.status, `${generatedPath} must be ignored`).toBe(0);
        });

        [
            'tests/fixtures/example.json',
            'tests/fixtures/example.aux',
            'data/2099-01-01_example_migration.sql',
            'package-lock.json',
            'pli/deliverables/PLI_Master_Codebook.pdf'
        ].forEach((sourcePath) => {
            const ignored = spawnSync(
                'git',
                ['check-ignore', '--no-index', '--quiet', sourcePath],
                { cwd: new URL('../..', import.meta.url) }
            );
            expect(ignored.status, `${sourcePath} must remain trackable`).toBe(1);
        });

        expect(gitignore).toContain('!pli/deliverables/**');
        expect(policy).toContain('dependency lock files');
        expect(policy).toContain('test fixtures');
        expect(policy).toContain('additive, dated migration source');
        expect(policy).toContain('intentionally published binary');
        expect(policy).toContain('pli/deliverables/');
        expect(policy).toContain('npm run verify:repo-artifacts');
        expect(packageJson.scripts['verify:repo-artifacts']).toBe('node scripts/verify-repository-artifacts.mjs');
        expect(verifier).toContain("spawnSync('git', ['ls-files', '-z']");
        expect(verifier).toContain('Remediation:');
        expect(workflow).toContain('npm run verify:repo-artifacts');
        expect(workflow).toContain('scripts/verify-repository-artifacts.test.js');
        expect(workflow).toContain('pull_request:');
        expect(readme).toContain('[repository artifact policy](docs/repository-artifact-policy.md)');
        expect(deployment).toContain('[repository artifact policy](repository-artifact-policy.md)');
    });

    it('documents the four team-specific Strategic Orientation workflows', () => {
        const readme = readText('../../README.md');
        const runbook = readText('../../docs/live-demo-runbook.md');
        const automation = readText('../../docs/playthrough-automation.md');
        const walkthrough = readText('../../Plenum Briefing/Fractured-Order_Functionality-Walkthrough.html');

        expect(readme).toContain("Choose Blue's orientation; forecast Red's orientation");
        expect(readme).toContain("Choose and explain Red's orientation; forecast Blue, Green (Asian Pacific), and Green (Europe)");
        expect(readme).toContain("Forecast Blue; choose Green's orientation");
        expect(readme).toContain("Forecast Blue; choose Industry's orientation");
        expect(runbook).toContain('new records use `Orientation & Forecast`');
        expect(runbook).toContain('no database migration');
        expect(automation).toContain('`forecastActionDescription`');
        expect(walkthrough).toContain('Orientation &amp; Forecast');
    });

    it('documents the root Vite app instead of the obsolete nested setup path', () => {
        const readme = readText('../../README.md');

        expect(readme).toContain('# Fractured Order');
        expect(readme).toContain('root-level Vite');
        expect(readme).toContain('npm run dev');
        expect(readme).toContain('.env.example');
        expect(readme).not.toMatch(/platform\/(?:\.env\.example|index\.html|src|$)/i);
    });

    it('pins deployment and Supabase live-demo verification guidance', () => {
        const deployment = readText('../../docs/deployment.md');
        const supabase = readText('../../docs/supabase-setup.md');
        const runbook = readText('../../docs/live-demo-runbook.md');
        const combined = `${deployment}\n${supabase}\n${runbook}`;

        expect(combined).toContain('https://ssgwm25.github.io/Fractured-Order/');
        expect(combined).toContain('GitHub Pages');
        expect(combined).toContain('repository secrets');
        expect(combined).toContain('VITE_SUPABASE_URL');
        expect(combined).toContain('VITE_SUPABASE_ANON_KEY');
        expect(combined).toMatch(/anonymous auth/i);
        expect(combined).toContain('RPC');
        expect(combined).toContain('RLS');
        expect(combined).toContain('browser-public');
        expect(combined).toContain('service-role');
        expect(combined).toContain('./src/main.js');
        expect(combined).toContain('./src/roles/landing.js');
        expect(combined).toContain('/Fractured-Order/assets/');
        expect(combined).toMatch(/Allow all operations/i);
        expect(supabase).toContain('data/2026-07-29_industry_submission_permissions.sql');
        expect(runbook).toContain('data/2026-07-29_industry_submission_permissions.sql');
    });

    it('documents exact White Cell review RPC signatures and migration-first drift repair', () => {
        const supabase = readText('../../docs/supabase-setup.md');
        const repairSection = supabase.slice(supabase.indexOf('White Cell proposal-review schema drift'));
        const teamNeutralIndex = repairSection.indexOf('data/2026-08-05_team_neutral_artifact_review.sql');
        const facilitatorIndex = repairSection.indexOf(
            'data/2026-08-06_facilitator_rfi_communications.sql',
            teamNeutralIndex
        );
        const recipientThreadsIndex = repairSection.indexOf(
            'data/2026-08-06_proposal_recipient_threads.sql',
            facilitatorIndex
        );

        expect(repairSection).toContain('operator_review_artifact(text,uuid,text,text,bigint,text)');
        expect(repairSection).toContain('operator_review_proposal(uuid,text,text,text,integer)');
        expect(repairSection).toContain('p.oid::regprocedure::text as function_signature');
        expect(repairSection).toContain("notify pgrst, 'reload schema';");
        expect(repairSection).toContain('do not add a browser fallback to an older RPC');
        expect(teamNeutralIndex).toBeGreaterThan(-1);
        expect(facilitatorIndex).toBeGreaterThan(teamNeutralIndex);
        expect(recipientThreadsIndex).toBeGreaterThan(facilitatorIndex);
    });

    it('pins one dated Supabase ledger and deprecates consolidated SQL snapshots', () => {
        const supabase = readText('../../docs/supabase-setup.md');
        const rollback = readText('../../docs/supabase-rollback.md');
        const orderedLedger = [
            'data/2026-04-07_secure_session_join_contract.sql',
            'data/2026-04-08_live_demo_role_seat_contract.sql',
            'data/2026-04-08_live_demo_rls_hardening.sql',
            'data/2026-04-08_facilitator_join_session_access_fix.sql',
            'data/2026-04-08_operator_auth_digest_fix.sql',
            'data/2026-04-09_global_white_cell_role_contract.sql',
            'data/2026-04-16_game_master_remove_session_participant.sql',
            'data/2026-04-17_seat_claim_role_input_normalization.sql',
            'data/2026-04-17_white_cell_backend_alignment.sql',
            'data/2026-06-02_operator_code_runtime_config_table.sql',
            'data/2026-06-03_proposal_response_finalization_lock.sql',
            'data/2026-06-04_research_export_capture.sql',
            'data/2026-06-18_participant_auth_identity_reconcile.sql',
            'data/2026-06-25_industry_team_role_contract.sql',
            'data/2026-06-25_scribe_action_submit_policy.sql',
            'data/2026-06-25_participant_role_resolver_normalization.sql',
            'data/2026-06-25_timer_allocations_game_state.sql',
            'data/2026-06-28_white_cell_plugins_game_state.sql',
            'data/2026-06-28_intercom_storage_bucket.sql',
            'data/2026-07-14_action_artifact_workflow_integrity.sql',
            'data/2026-07-17_pli_adjudications.sql',
            'data/2026-07-20_sme_handoffs.sql',
            'data/2026-07-20_staff_access_code_only.sql',
            'data/2026-07-20_sme_pli_write_hardening.sql',
            'data/2026-07-20_operator_grants_sme_surface.sql',
            'data/2026-07-21_scribe_proposal_submit_policy.sql',
            'data/2026-07-29_sme_handoffs_backfill.sql',
            'data/2026-07-29_industry_submission_permissions.sql',
            'data/2026-07-29_return_action_to_blue.sql',
            'data/2026-08-05_team_neutral_artifact_review.sql',
            'data/2026-08-06_facilitator_rfi_communications.sql',
            'data/2026-08-06_proposal_recipient_threads.sql',
            'data/2026-08-11_requests_responded_by_schema_repair.sql',
            'data/2026-08-12_session_archive_transition.sql',
            'data/2026-08-13_rfi_answer_completion_trigger.sql',
            'data/2026-08-13_strategic_orientation_team_canonicalization.sql',
            'data/2026-08-13_action_notification_delivery.sql',
            'data/2026-08-13_action_notification_type_contract.sql',
            'data/2026-08-14_action_notification_title_snapshot.sql',
            'data/2026-08-15_proposal_forwarding_integrity.sql',
            'data/2026-08-17_game_master_session_retirement.sql',
            'data/2026-08-18_ssg_training_session.sql',
            'data/2026-08-18_training_mastery_progress.sql',
            'data/2026-08-25_sme_pli_packets.sql',
            'data/2026-08-26_decommission_ssg_training.sql',
            'data/2026-08-26_session_role_name_snapshots.sql',
            'data/2026-09-18_green_regional_storage.sql',
            'data/2026-09-19_green_regional_authorization.sql',
            'data/2026-09-20_gc03_terminal_revision_conflicts.sql',
            'data/2026-09-21_gc03_recipient_forward_uniqueness.sql',
            'data/2026-09-22_gc04_session_context.sql'
        ];

        let priorIndex = -1;
        orderedLedger.forEach((migration) => {
            const migrationIndex = supabase.indexOf(`\`${migration}\``);
            expect(migrationIndex, `Missing migration order entry for ${migration}`).toBeGreaterThan(priorIndex);
            priorIndex = migrationIndex;
        });

        [
            'data/COMPLETE_SCHEMA.sql',
            'data/updated_supabase_schema.sql',
            'data/updated_supabase_migration.sql'
        ].forEach((historicalPath) => {
            expect(supabase).toContain(historicalPath);
            expect(rollback).toContain(historicalPath);
        });
        expect(supabase).toContain('deprecated historical snapshots');
        expect(supabase).toContain('returned_to_blue');
        expect(rollback).toContain('There is no reverse SQL order');
        expect(rollback).toContain('Do not manufacture `artifact_workflow_reviews` entries');
    });

    it('pins the distinct current Green and Industry proposal form contracts', () => {
        const runbook = readText('../../docs/live-demo-runbook.md');
        const automation = readText('../../docs/playthrough-automation.md');
        const combined = `${runbook}\n${automation}`;

        expect(runbook).toContain('current Green new-entry form fields:');
        expect(runbook).toContain('Proposal Title, at least one Originator, Objective, Intended Partners, Focus Sectors');
        expect(runbook).toContain('current Industry new-entry form fields:');
        expect(runbook).toContain('Proposal Title, Industry of Focus, Country of Focus, and Proposed Activity');
        expect(combined).toContain('conditional Supply Chain Areas');
        expect(combined).toContain('Timing & Conditions');
        expect(combined).toContain('Expected Outcome(s) & Duration Assessment');
        expect(combined).toContain('revision identity/history across return, edit, and resubmission');

        [
            /Green proposal creation through the Category selector/i,
            /Green proposals retain Category/i,
            /Industry proposal creation through (?:its|an) Instrument of Power/i,
            /Industry proposals show Instrument of Power/i,
            /Instrument of Power replaces Proposal Category/i
        ].forEach((retiredInstruction) => {
            expect(combined).not.toMatch(retiredInstruction);
        });

        const proposalInstructionsUsingRetiredLabels = combined
            .replace(/\r?\n {2}/g, ' ')
            .split(/\r?\n/)
            .filter((line) => /proposal/i.test(line))
            .filter((line) => /Proposal Category|\bDelivery\b|Industry Instrument of Power/.test(line));
        proposalInstructionsUsingRetiredLabels.forEach((instruction) => {
            expect(instruction).toMatch(/neither|no current|historical|compatibility-only/i);
        });
    });

    it('keeps retired proposal fields compatibility-only and explicitly historical', () => {
        const runbook = readText('../../docs/live-demo-runbook.md');
        const automation = readText('../../docs/playthrough-automation.md');
        const proposalDetails = readText('../../src/features/actions/proposalDetails.js');
        const researchExport = readText('../../src/features/export/researchExport.js');

        expect(runbook).toContain('historical export/parser compatibility only:');
        expect(automation).toContain('historical export/parser fixtures remain compatibility-only:');
        [runbook, automation, proposalDetails, researchExport].forEach((contractText) => {
            expect(contractText).toContain('Category (historical)');
            expect(contractText).toContain('Delivery (historical)');
        });
        expect(proposalDetails).toContain('category: normalizeString(parsed.Category)');
        expect(proposalDetails).toContain('delivery: normalizeString(parsed.Delivery)');
    });

    it('pins per-recipient approval and isolated append-only proposal threads', () => {
        const readme = readText('../../README.md');
        const runbook = readText('../../docs/live-demo-runbook.md');
        const automation = readText('../../docs/playthrough-automation.md');
        const walkthrough = readText('../../Plenum Briefing/Fractured-Order_Functionality-Walkthrough.html');
        const playthroughGuides = readText('../../Plenum Briefing/Plenum Playthrough Guides.html');
        const facilitatorController = readText('../../src/roles/scribe.js');
        const currentOperatorText = [
            readme,
            runbook,
            automation,
            walkthrough,
            playthroughGuides,
            facilitatorController
        ].join('\n');

        expect(automation).toMatch(/originating Scribe creates the proposal[\s\S]*actual\s+Facilitator[\s\S]*submits it to White Cell/i);
        expect(automation).toMatch(/White Cell approves\s+each intended recipient independently/i);
        expect(automation).toContain('isolated, append-only response thread');
        expect(automation).toContain('schema `1.9.0` / format revision');
        expect(automation).toContain('passed manifest reconciliation');
        expect(automation).toContain('Full dual-thread verification is part of both the');

        expect(runbook).toContain('data/2026-08-06_proposal_recipient_threads.sql');
        expect(runbook).toMatch(/originating Scribe creates and forwards the draft, then the actual Facilitator submits it to White Cell/i);
        expect(runbook).toContain('separate approval control and lifecycle for each recipient');
        expect(runbook).toContain('the response is appended as round 1 without changing round 0');
        expect(runbook).toContain('the proposing Facilitator can answer it as round 2');
        expect(runbook).toContain('neither team can read or append to the other recipient\'s thread');

        expect(readme).toContain('proposal creation with handoff to the Facilitator');
        expect(readme).toContain('final Strategic Orientation/action/proposal submission');
        expect(readme).toContain('recipient-isolated, append-only multi-round proposal threads');
        [walkthrough, playthroughGuides].forEach((guide) => {
            expect(guide).toContain('Approve each intended recipient independently.');
            expect(guide).toContain('Append the first response in its isolated thread.');
            expect(guide).toContain('append later rounds without overwrites.');
        });
        expect(facilitatorController).toContain('isolated, append-only thread');
        expect(facilitatorController).toContain('later rounds remain in the same thread');

        expect(currentOperatorText).not.toMatch(/Scribe surface directly to White Cell review/i);
        expect(currentOperatorText).not.toMatch(/Records? (?:a )?final response/i);
        expect(currentOperatorText).not.toMatch(/response; it is final/i);
        expect(currentOperatorText).not.toMatch(/Respond to Proposal[\s\S]{0,80}also final/i);
        expect(currentOperatorText).not.toContain('Record one response for each proposal');
        expect(currentOperatorText).not.toContain('Forward to Facilitator (Blue)');
    });

    it('pins migration-first rollout, frontend-first rollback, and the workflow-aware export contract', () => {
        const readme = readText('../../README.md');
        const deployment = readText('../../docs/deployment.md');
        const supabase = readText('../../docs/supabase-setup.md');
        const runbook = readText('../../docs/live-demo-runbook.md');
        const automation = readText('../../docs/playthrough-automation.md');
        const rollback = readText('../../docs/supabase-rollback.md');
        const currentGuidance = `${readme}\n${deployment}\n${supabase}\n${runbook}\n${automation}\n${rollback}`;

        expect(readme).toContain('schema `1.9.0` / format revision `10`');
        expect(deployment).toContain('Migration-First Release Order');
        expect(deployment).toContain('Deploy the matching frontend second from one clean commit');
        expect(deployment).toContain('roll back the frontend first');
        expect(deployment).toContain('Current-Head Evidence Contract');
        expect(deployment).toContain('Explicit Release Blockers');
        expect(deployment).toContain('mock and live-Supabase results produced from the same commit');
        expect(supabase).toContain('Production rollout is migration-first');
        expect(rollback).toContain('frontend-first containment');
        expect(rollback).toContain('proposal thread rounds, recipient');
        expect(rollback).toContain('RFI return/resubmission/answer history');
        expect(runbook).toContain('authoritative review history');
        expect(runbook).toContain('every immutable thread round');
        expect(runbook).toContain('ordered answer history');
        expect(automation).toContain('JSON/CSV/HTML/LaTeX research-archive reconciliation');
        expect(automation).toContain('PLAYWRIGHT_DEPLOYED_COMMIT');
        expect(automation).toContain('PLAYWRIGHT_MIGRATION_STATE');
        expect(automation).toContain('dirty-worktree mock run remains development');
        expect(currentGuidance).not.toContain('Research export schema `1.6.0`');
        expect(currentGuidance).not.toContain('Records a final response');
        expect(currentGuidance).not.toContain('vertical action navigation');
    });
});
