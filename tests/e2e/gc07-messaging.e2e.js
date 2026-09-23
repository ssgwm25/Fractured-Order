import { expect, test } from '@playwright/test';
import { enableE2EMockBackend } from './support/mockBackend.js';
import { buildAppUrl } from './support/rehearsalRuntime.js';

async function joinShared(context, page) {
    await enableE2EMockBackend(context);
    await page.goto(buildAppUrl());
    await page.waitForFunction(() => Boolean(globalThis.__ESG_E2E_BACKEND__));
    await page.evaluate(() => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        state.tables.sessions.push({ id: 'gc07', name: 'GC07 synthetic', session_code: 'GC07TEST', status: 'active',
            session_classification: 'live_exercise', is_protected: false, session_topology_version: 2,
            green_seat_model: 'shared_facilitator_v1', green_roster_version: 'synthetic-only',
            green_roster_snapshot: { asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU'] } });
        state.tables.game_state.push({ id: 'gc07-game', session_id: 'gc07', move: 1, phase: 1, timer_seconds: 5400, timer_running: false });
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    });
    await page.locator('#sessionCode').fill('GC07TEST');
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
}

test('shared Facilitator creates two distinct regional RFIs and messages, retained after reload', async ({ context, page }) => {
    await joinShared(context, page);
    for (const region of ['asian_pacific', 'europe']) {
        await page.locator('#sharedGreenWorkingRegion').selectOption(region);
        await page.locator('#rfiViewBtn').click();
        await page.locator('[data-facilitator-new-rfi]:visible').click();
        await page.locator('#rfiQuestion').fill(`Synthetic ${region} question for White Cell?`);
        await page.locator('[data-rfi-checkbox="category"]').last().check();
        await page.locator('#rfiForm button[type="submit"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#rfiForm')).toHaveCount(0);
        await expect.poll(() => page.evaluate((region) => globalThis.__ESG_E2E_BACKEND__.dump().tables.requests
            .filter((r) => r.session_id === 'gc07' && r.delegation_id === region).length, region)).toBe(1);
        await page.locator('#communicationsViewBtn').click();
        await page.locator('[data-facilitator-new-communication]:visible').click();
        await page.locator('#facilitatorCommunicationMessage').fill(`Synthetic ${region} coordination`);
        await page.getByRole('button', { name: 'Send Message', exact: true }).click();
        await expect(page.locator('#facilitatorCommunicationMessage')).toHaveCount(0);
    }
    await page.reload();
    await expect(page.locator('#sharedGreenWorkingRegion')).toHaveValue('europe');
    await page.locator('#communicationsViewBtn').click();
    await expect(page.locator('.facilitator-thread')).toContainText('Synthetic europe coordination');
    await expect(page.locator('.facilitator-thread')).not.toContainText('Synthetic asian_pacific coordination');
    await page.locator('#sharedGreenWorkingRegion').selectOption('asian_pacific');
    await expect(page.locator('#communicationsViewBtn')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.facilitator-thread')).toBeVisible();
    await expect(page.locator('.facilitator-thread')).toContainText('Synthetic asian_pacific coordination');
    await expect(page.locator('.facilitator-thread')).not.toContainText('Synthetic europe coordination');
});

test('returned RFI correction uses the same regional record and revision', async ({ context, page }) => {
    await joinShared(context, page);
    // Synthetic delivery only; actual White Cell return is covered in SQL/RPC tests.
    await page.evaluate(() => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        state.tables.requests.push({ id: 'gc07-returned', session_id: 'gc07', team: 'green', delegation_id: 'europe',
            query: 'Synthetic original European question?', categories: ['Other'], move: 1, phase: 1,
            status: 'pending', workflow_state: 'returned_to_team', revision_number: 2, review_notes: 'Synthetic clarification needed',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    });
    await page.reload();
    await page.locator('#sharedGreenWorkingRegion').selectOption('europe');
    await page.locator('#rfiViewBtn').click();
    const editButton = page.getByRole('button', { name: 'Edit and Resubmit', exact: true });
    // Both layouts must expose the actual pointer target; no forced click.
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
        await page.setViewportSize(viewport);
        await editButton.click({ trial: true });
        const layout = await page.evaluate(() => {
            const context = document.querySelector('.shared-green-context').getBoundingClientRect();
            const record = document.querySelector('.facilitator-rfi-workspace').getBoundingClientRect();
            return { contextBottom: context.bottom, recordTop: record.top, recordLeft: record.left,
                recordRight: record.right, viewportWidth: innerWidth };
        });
        expect(layout.recordTop).toBeGreaterThanOrEqual(layout.contextBottom);
        expect(layout.recordLeft).toBeGreaterThanOrEqual(0);
        expect(layout.recordRight).toBeLessThanOrEqual(layout.viewportWidth);
    }
    await editButton.click();
    await expect(page.locator('#rfiForm')).toContainText('revision 2');
    await page.locator('#rfiQuestion').fill('Synthetic corrected European question?');
    await page.locator('#rfiForm button[type="submit"]').click();
    await expect(page.locator('#rfiForm')).toHaveCount(0);
    const records = await page.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump().tables.requests.filter((r) => r.session_id === 'gc07'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'gc07-returned', delegation_id: 'europe', revision_number: 2, workflow_state: 'resubmitted' });
});
