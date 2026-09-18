import { expect, test } from '@playwright/test';
import { enableE2EMockBackend } from './support/mockBackend.js';
import { buildAppUrl } from './support/rehearsalRuntime.js';

// Synthetic browser fixtures only. These are not roster approval or RLS evidence.
test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !['localhost', '127.0.0.1'].includes(new URL(process.env.PLAYWRIGHT_BASE_URL).hostname)),
    'Run mock browser coverage against a local build only.');

async function seed(page, { occupiedRole = null } = {}) {
    await page.goto(buildAppUrl());
    await page.waitForFunction(() => Boolean(globalThis.__ESG_E2E_BACKEND__));
    await page.evaluate(({ occupiedRole }) => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        const now = new Date().toISOString();
        state.tables.sessions.push({ id: 'gc04-session', name: 'GC04 synthetic fixture', session_code: 'GC04TEST',
            status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: 2, green_roster_version: 'synthetic-browser-only',
            green_roster_snapshot: { fixture: true }, created_at: now });
        state.tables.game_state.push({ id: 'gc04-state', session_id: 'gc04-session', move: 1, phase: 1,
            timer_seconds: 5400, timer_running: false });
        if (occupiedRole) {
            state.tables.participants.push({ id: 'occupied-participant', auth_user_id: 'other-auth', client_id: 'other-client', name: 'Synthetic occupied seat' });
            state.tables.session_participants.push({ id: 'occupied-seat', session_id: 'gc04-session', participant_id: 'occupied-participant',
                role: occupiedRole, delegation_id: 'europe', is_active: true, heartbeat_at: now, joined_at: now });
        }
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    }, { occupiedRole });
    await page.locator('#sessionCode').fill('GC04TEST');
    await page.locator('#displayName').fill('Synthetic participant');
    await page.locator('#checkSessionBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#joinStatus')).toContainText('regional Green');
    await page.locator('[data-team="green"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#delegationSelection')).toBeVisible();
    await expect(page.locator('[data-role-surface="notetaker"]')).toBeHidden();
}

for (const delegation of ['asian_pacific', 'europe']) {
    for (const surface of ['facilitator', 'scribe']) {
        test(`${delegation} ${surface}: keyboard join, reload, stale storage and tampered deep link`, async ({ context, page }) => {
            await enableE2EMockBackend(context);
            await seed(page);
            const regionLabel = delegation === 'europe' ? 'Europe' : 'Asia-Pacific';
            const semanticLabel = surface === 'facilitator' ? 'Scribe' : 'Facilitator';
            await page.locator(`[data-delegation="${delegation}"]`).focus();
            await page.keyboard.press('Space');
            await expect(page.locator(`[data-delegation="${delegation}"]`)).toHaveAttribute('aria-pressed', 'true');
            await page.locator(`[data-role-surface="${surface}"]`).focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#seatSelectionSummary')).toContainText(`Green - ${regionLabel} ${semanticLabel}`);
            await page.locator('#joinForm button[type="submit"]').focus();
            await page.keyboard.press('Enter');
            await expect(page).toHaveURL(new RegExp(`teams/green/${surface}\\.html\\?delegation=${delegation}`));
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            await page.reload();
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            // Local state is only a hint. It cannot replace the authenticated seat.
            await page.evaluate(() => {
                sessionStorage.setItem('esg_role', 'blue_facilitator');
                const data = JSON.parse(sessionStorage.getItem('esg_session_data'));
                data.role = 'blue_facilitator'; data.team = 'blue'; data.delegationId = null;
                sessionStorage.setItem('esg_session_data', JSON.stringify(data));
            });
            await page.goto(buildAppUrl(`teams/green/${surface}.html`));
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            const other = delegation === 'europe' ? 'asian_pacific' : 'europe';
            await page.goto(buildAppUrl(`teams/green/${surface}.html?delegation=${other}`));
            await expect(page.locator('#seatContextStatus')).toContainText('Permission error');
            await expect(page.locator('.app-layout, .scribe-shell')).toBeHidden();
            await expect(page.getByRole('button', { name: 'Retry session validation' })).toBeVisible();
        });
    }
}

test('full seat stays on join with persistent accessible retry feedback', async ({ context, page }) => {
    await enableE2EMockBackend(context);
    await seed(page, { occupiedRole: 'green_europe_scribe' });
    await page.locator('[data-delegation="europe"]').click();
    await page.locator('[data-role-surface="facilitator"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#joinStatus')).toContainText('full');
    await expect(page.locator('#joinStatus')).toBeFocused();
    await expect(page.locator('#joinForm button[type="submit"]')).toBeEnabled();
});
