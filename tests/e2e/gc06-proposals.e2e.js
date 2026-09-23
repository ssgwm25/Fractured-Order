import { expect, test } from '@playwright/test';
import { enableE2EMockBackend } from './support/mockBackend.js';
import { buildAppUrl } from './support/rehearsalRuntime.js';
import { serializeProposalDetails } from '../../src/features/actions/proposalDetails.js';

// Synthetic UI rehearsal. Real handoff/review authorization is exercised by the
// separate rollback-only SQL suite, not by these seeded browser state changes.
async function openSharedWorkspace(context, page, returned = false) {
    await enableE2EMockBackend(context);
    await page.goto(buildAppUrl());
    await page.waitForFunction(() => Boolean(globalThis.__ESG_E2E_BACKEND__));
    const details = serializeProposalDetails({ originators: ['UK'], objective: 'Synthetic regional proposal', intendedPartners: 'Blue and Red',
        recipientTeams: ['blue', 'red'], focusSectors: ['Agriculture'], supplyChainFocusDecision: 'No', timingAndConditions: 'Synthetic conditions', scribeHandoff: 'Forwarded' });
    await page.evaluate(({ details, returned }) => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        const now = new Date().toISOString();
        state.tables.sessions.push({ id: 'gc06', name: 'GC06 synthetic', session_code: 'GC06TEST', status: 'active',
            session_classification: 'live_exercise', is_protected: false, session_topology_version: 2,
            green_seat_model: 'shared_facilitator_v1', green_roster_version: 'synthetic-only', green_roster_snapshot: { asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU'], aliases: {} } });
        state.tables.game_state.push({ id: 'gc06-game', session_id: 'gc06', move: 1, phase: 1, timer_seconds: 5400, timer_running: false });
        for (const region of ['asian_pacific', 'europe']) state.tables.actions.push({
            id: `gc06-${region}`, session_id: 'gc06', team: 'green', delegation_id: region, move: 1, phase: 1,
            status: 'draft', workflow_state: returned ? 'returned_to_team' : 'forwarded_to_facilitator',
            artifact_type: 'proposal', mechanism: 'Proposal', expected_outcomes: 'Synthetic outcome', sector: 'Agriculture',
            revision_number: returned ? 2 : 1, row_version: returned ? 3 : 1,
            proposal_handoff_revision: returned ? null : 1, review_notes: returned ? 'Synthetic correction requested' : null,
            is_deleted: false, goal: `Synthetic ${region} proposal`, ally_contingencies: region === 'europe' ? details : details.replace('["UK"]', '["ROK"]'), created_at: now, updated_at: now
        });
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    }, { details, returned });
    await page.locator('#sessionCode').fill('GC06TEST');
    await page.locator('#displayName').fill('Synthetic Facilitator');
    await page.locator('#checkSessionBtn').click();
    await expect(page.locator('#joinStatus')).toContainText('regional Green');
    await page.locator('[data-team="green"]').click();
    await page.locator('[data-role-surface="scribe"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#sessionRoleLabel')).toContainText('Shared Facilitator');
    // GC09 supplies a real shared-seat guide. Close it through the keyboard before workflow checks.
    await expect(page.locator('.follow-along')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.follow-along')).toHaveAttribute('data-minimized', 'true');
    await page.locator('#teamActionReviewViewBtn').click();
}

async function openRegion(page, region) {
    await page.locator('#sharedGreenWorkingRegion').selectOption(region);
    await page.locator(`[data-slide-key="action-gc06-${region}"]`).first().click();
}

test('one shared workspace submits both proposals independently and retains deferred notices', async ({ context, page }) => {
    await openSharedWorkspace(context, page);
    await expect(page.locator('#sharedGreenWorkflowNotice')).toContainText('Create RFIs and message White Cell for the selected region');
    for (const region of ['asian_pacific', 'europe']) {
        await openRegion(page, region);
        const button = page.locator(`[data-scribe-action-submit][data-action-id="gc06-${region}"]:visible`).first();
        await button.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Submit', exact: true }).click();
        await expect.poll(() => page.evaluate((region) => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
            .find((a) => a.id === `gc06-${region}`).status, region)).toBe('submitted');
        if (region === 'asian_pacific') expect(await page.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
            .find((a) => a.id === 'gc06-europe').status)).toBe('draft');
    }
});

test('returned proposal exposes notes and waits for its Scribe before corrected resubmission', async ({ context, page }) => {
    await openSharedWorkspace(context, page, true);
    await openRegion(page, 'europe');
    await expect(page.locator('.scribe-own-proposal-slide')).toContainText('Synthetic correction requested');
    await expect(page.locator('.scribe-own-proposal-slide')).toContainText('corrected proposal handoff');
    await expect(page.locator('[data-scribe-action-submit][data-action-id="gc06-europe"]:enabled')).toHaveCount(0);
    // Simulate delivery of the separately tested Scribe handoff revision.
    await page.evaluate(() => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        const action = state.tables.actions.find((a) => a.id === 'gc06-europe');
        action.proposal_handoff_revision = 2; action.row_version = 4;
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    });
    await page.reload();
    await page.locator('#teamActionReviewViewBtn').click();
    await openRegion(page, 'europe');
    await page.locator('[data-scribe-action-submit][data-action-id="gc06-europe"]:visible').first().click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => page.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
        .find((a) => a.id === 'gc06-europe').workflow_state)).toBe('resubmitted');
});
